import { useLatestSongRequest } from './useLatestSongRequest.js'
import { useDraftLibrary } from './useDraftLibrary.js'
import SongHeading from './SongHeading.jsx'
import SongSectionPicker from './SongSectionPicker.jsx'
import { synth } from '@coderline/alphatab'
import LocalBackingTrack from './LocalBackingTrack.jsx'
import { guitarShiftLimits, transposeGuitarScore } from './transposeGuitarScore.js'
import { TransposeSteps } from '../../vocal/components/TransposeControl.jsx'
import { signed } from '../../vocal/transpose/keyFit.js'
import { attachBackingTrack } from './follow/localBackingTrack.js'
import { barsTouchedByRange, savedPassagesKey } from './savedPassages.js'
import { clampTempo } from '../../../audio/tempo/tempo.js'
import { BUILT_IN_SONGS, findSongFile } from './songSources.js'
import GuitarFeedback from '../practice/GuitarFeedback.jsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AccompanimentToggle from '../../vocal/components/AccompanimentToggle.jsx'
import OnlineSongs from '../../vocal/components/OnlineSongs.jsx'
import PartTabs from '../../vocal/components/PartTabs.jsx'
import PlaybackControls from './follow/GuitarPlaybackControls.jsx'
import PracticeModeToggle from '../../vocal/components/PracticeModeToggle.jsx'
import PracticeSessions from '../../vocal/components/PracticeSessions.jsx'
import SharedAttemptGate from '../../vocal/components/SharedAttemptGate.jsx'
import SongLibrary from '../../vocal/components/SongLibrary.jsx'
import '../../vocal/components/NotationUploader.css'
import { loadMyFile, rememberMyFile } from '../../home/myFiles.js'
import { fingerprintBytes } from '../../vocal/share/sharedAttempt.js'
import { fetchCloudNotation } from '../../vocal/songs/cloudLibrary.js'
import { getSharedAttempt, getSongScoreStats, listGuitarPracticeVerdicts } from '@backend/attempts'
import { usePracticeSession } from '../../vocal/practice/usePracticeSession.js'
import { supabase } from '../../../lib/supabaseClient.js'
import { GUITAR_NOTATION_ACCEPT, loadGuitarNotation } from '../notation/loadGuitarNotation.js'
import { chordNamesOf, saveSongChords } from '../practice/chordNames.js'
import GuitarScore from './GuitarScore.jsx'
import MyTranscriptions from './MyTranscriptions.jsx'
import LocalSongs from './LocalSongs.jsx'
import SessionAttempts from '../../vocal/components/SessionAttempts.jsx'
import TranscribePanel from './TranscribePanel.jsx'
import { loadDraft } from './drafts.js'
import { keepTranscriptionCopy } from './transcriptionStorage.js'
import EasyToggle from './follow/EasyToggle.jsx'
import GuitarSharedPanel from './follow/GuitarSharedPanel.jsx'
import GuitarTroubleMode from './follow/GuitarTroubleMode.jsx'
import GuitarWaitMode from './follow/GuitarWaitMode.jsx'
import SongTransportExtras from './follow/SongTransportExtras.jsx'
import { loadEasy, saveEasy, withEasy } from './follow/easyMode.js'
import { lastAndBestLine, recurringTroubleSpots } from './follow/runHistory.js'
import { GUITAR_ACCOMPANIMENTS, GUITAR_MODES, applyMix } from './follow/modes.js'
import { clearLoop, playRange, seekToTick } from './follow/playerControls.js'
import { sectionTimeline } from './follow/songSection.js'
import { createSongClock, loadLatency } from './follow/songClock.js'
import { buildTimeline, practiceableTracks, secondsToTicks, ticksToSeconds } from './follow/songTimeline.js'
import { useAlphaTabPlayer } from './follow/useAlphaTabPlayer.js'
import { useTabOverlay } from './follow/useTabOverlay.js'
import '../../../auth/authTheme.css'
import './GuitarSong.css'
import './follow/GuitarFollow.css'

/**
 * Guitar songs: pick a built-in or catalog song, or upload Guitar Pro /
 * alphaTex / MusicXML / MXL / MIDI, see it as tab + notation, and practise
 * it the way the Vocal tab practises a score:
 *   - Listen:        playback, with tempo, metronome and count-in (GuitarScore) and loops
 *   - Wait for me:   the song waits on each note until the mic hears it
 *   - Trouble spots: play along in time; every note is judged and marked
 * Export as MIDI or Guitar Pro. Lazy-loaded by GuitarTab because alphaTab
 * is large.
 *
 * Or transcribe a recording (transcribe/pipeline.js): an audio file becomes
 * a draft score, opened like any song and kept on this device under "My
 * transcriptions" (drafts.js). The tabbing runs on this device for everyone
 * (TranscribePanel); a recording is never uploaded to be tabbed.
 *
 * Any song can be practised in an Easy version that scores just the first
 * note of each bar and each chord change (follow/easyMode.js, F45); the
 * player chooses, and the choice is remembered per song.
 *
 * The practice modes share one timeline (follow/songTimeline.js: every note
 * the practised track plays, with its tick and time), one song clock
 * (follow/songClock.js, fed by alphaTab's position events) and one layer of
 * marks on the tab (follow/useTabOverlay.js).
 *
 * A Trouble spots run can be shared as a link (never the song itself: a
 * catalog song by id, anything else by its file's fingerprint);
 * `sharedAttemptId` opens one someone sent (App.jsx reads the link).
 *
 * Run history (change: guitar-run-history, F22): while signed in, an open
 * song has a practice session (usePracticeSession, as in the Vocal tab);
 * every finished Wait for me or Trouble spots run is saved into it, and the
 * song shows the last and best score of full runs in the chosen mode, part
 * and version. Practice sessions (the library's card, the song's Sessions
 * button, or Home via `sessionsToOpen` = { songId, songFingerprint,
 * songTitle }) lists the sittings and their runs; `onSessionsOpened` tells
 * App it has.
 */
function GuitarSong({ auth, onNavigate, sharedAttemptId, onSharedAttemptDone, fileToOpenId, onFileOpened, sessionsToOpen, onSessionsOpened }) {
  const [browse, setBrowse] = useState('library') // library | search | transcribe
  const [notation, setNotation] = useState(null) // loadGuitarNotation's result + { fingerprint, catalogSongId, builtin, draft }
  const [pitchSetup, setPitchSetup] = useState({ shift: 0, score: null })
  const [shiftError, setShiftError] = useState(null)
  const [scoredRunActive, setScoredRunActive] = useState(false)
  const requests = useLatestSongRequest()
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)
  const [storageNotice, setStorageNotice] = useState(null)
  const [exportError, setExportError] = useState(null)
  const [api, setApi] = useState(null)
  const [mode, setMode] = useState('listen')
  const [selection, setSection] = useState(null)
  const [passageTempo, setPassageTempo] = useState(null)
  const [trackIndex, setTrackIndex] = useState(null) // null = the first practiceable track
  const [accompaniment, setAccompaniment] = useState('solo')
  const [latencyMs, setLatencyMs] = useState(loadLatency)
  const [referenceOn, setReferenceOn] = useState(true)
  const [backing, setBacking] = useState(null)
  const [backingError, setBackingError] = useState(null)
  const backingTransport = useRef(null)
  const [speed, setSpeed] = useState(1) // the tempo control's playback speed, for the time readouts
  const [easy, setEasy] = useState(false)
  // A shared attempt being opened: { phase, attempt, error, pendingFile }, where
  // phase is signin | loading | need-file | mismatch | error | open.
  const [shared, setShared] = useState(null)
  // Practice sessions on screen: { song ({ songId, fingerprint, title } or null for every song), returnTo: 'library' | 'song' }.
  const [sessionsView, setSessionsView] = useState(null)
  // Set before opening a song from Practice sessions' "+ New session": its session starts fresh.
  const freshStartRef = useRef(false)
  const [scores, setScores] = useState(null) // { key, stats }: the open song's last and best
  const [scoresVersion, setScoresVersion] = useState(0) // bumped when a run is saved
  const [settingsHost, setSettingsHost] = useState(null)
  const [transportHost, setTransportHost] = useState(null)
  const [infoHost, setInfoHost] = useState(null)
  const [feedbackHost, setFeedbackHost] = useState(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const scoreRef = useRef(null)
  const stopTrainingRef = useRef(null)
  const setTrainingTempo = useCallback((tempo) => scoreRef.current?.setTrainingTempo(tempo), [])
  const enableScoreFollow = useCallback(() => scoreRef.current?.enableFollow(), [])
  const revealScoreBar = useCallback((index) => scoreRef.current?.revealBar(index), [])
  const pageRef = useRef(null)
  useEffect(() => {
    pageRef.current?.closest('.guitar-tab__body')?.scrollTo?.({ top: 0 })
  }, [notation?.fingerprint, browse, sessionsView])

  // `catalogSongId` / `builtin` say where the song came from (for sharing),
  // `draft` ({ id }) that it's a transcription kept on this device;
  // `part` preselects a track and accompaniment (opening a shared attempt).
  const open = useCallback(async (arrayBuffer, filename, { title, catalogSongId = null, builtin = false, draft = null, part = null, shift = 0, request = requests.begin() } = {}) => {
    if (!request.isCurrent()) return undefined
    setBacking(null)
    setBackingError(null)
    setStatus('loading')
    setError(null)
    setStorageNotice(null)
    setExportError(null)
    try {
      // The fingerprint names the song for sharing and for its remembered tempo (same file, same tempo).
      const [loaded, fingerprint] = await Promise.all([
        loadGuitarNotation(arrayBuffer, filename, { title }),
        fingerprintBytes(arrayBuffer),
      ])
      if (!request.isCurrent()) return undefined
      const shifted = shift ? transposeGuitarScore(loaded.score, shift) : null
      setTrackIndex(part?.index ?? null)
      if (part) setAccompaniment(part.withOthers ? 'all' : 'solo')
      setMode('listen')
      setSection(null)
      setEasy(loadEasy(fingerprint))
      setPitchSetup({ shift, score: shifted })
      setShiftError(null)
      setScoredRunActive(false)
      saveSongChords(loaded.title, chordNamesOf(loaded.score)) // for ear training's "Chords from my song"
      setNotation({ ...loaded, fingerprint, catalogSongId, builtin, draft })
      setStatus('ready')
      return { fingerprint }
    } catch (err) {
      if (!request.isCurrent()) return undefined
      console.error(err)
      setError(err.message || 'Could not open this file.')
      setStatus('error')
    }
  }, [requests])

  const openBuiltIn = useCallback(
    async (song) => {
      const request = requests.begin()
      setError(null)
      setStatus('loading')
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}guitar-songs/${song.filename}`)
        if (!response.ok) throw new Error(`Could not load ${song.title} (HTTP ${response.status}).`)
        await open(await response.arrayBuffer(), song.filename, { builtin: true, request })
      } catch (err) {
        if (!request.isCurrent()) return
        setError(err.message)
        setStatus('error')
      }
    },
    [open, requests],
  )

  const openCloud = useCallback(
    async (item) => {
      const request = requests.begin()
      setError(null)
      setStatus('loading')
      try {
        const bytes = await fetchCloudNotation(supabase, item.song)
        await open(bytes, `${item.title}.musicxml`, { title: item.title, catalogSongId: item.id, request })
      } catch (err) {
        if (!request.isCurrent()) return
        console.error(err)
        setError(err.message || 'Could not load that song from the cloud.')
        setStatus('error')
      }
    },
    [open, requests],
  )

  const openUpload = useCallback(
    async (file) => {
      const request = requests.begin()
      setError(null)
      setStatus('loading')
      try {
        if (!file.size) throw new Error('This file is empty. Choose a score with notes in it.')
        if (file.size > 25 * 1024 * 1024) throw new Error('This score is over 25 MB. Try a smaller notation file.')
        const bytes = await file.arrayBuffer()
        // Failed imports must never become entries in the saved library.
        const loaded = await open(bytes, file.name, { request })
        if (loaded && request.isCurrent()) {
          try { await rememberMyFile({ id: loaded.fingerprint, name: file.name, instrument: 'guitar', bytes }) }
          catch { if (request.isCurrent()) setStorageNotice('Your score is open, but this browser could not keep a copy. Keep the original file to open it again later.') }
        }
      } catch (err) {
        if (!request.isCurrent()) return
        setError(err.message || 'Could not read this file. Try another score.')
        setStatus('error')
      }
    },
    [open, requests],
  )

  // A file picked from Home's "My files" (myFiles.js).
  useEffect(() => {
    if (!fileToOpenId) return undefined
    const request = requests.begin()
    setStatus('loading')
    setError(null)
    let cancelled = false
    loadMyFile(fileToOpenId)
      .then(async (file) => {
        if (cancelled || !request.isCurrent()) return
        if (!file) throw new Error('That file isn’t on this device anymore.')
        const loaded = await open(file.bytes, file.name, { request })
        if (!request.isCurrent()) return
        if (loaded) rememberMyFile(file).catch(() => { if (request.isCurrent()) setStorageNotice('Your score is open. This browser could not update its saved-file history.') })
        onFileOpened?.()
      })
      .catch((err) => {
        if (cancelled || !request.isCurrent()) return
        console.error(err)
        setError(err.message || 'Could not open that file.')
        setStatus('error')
        onFileOpened?.()
      })
    return () => {
      cancelled = true
      request.cancel()
    }
  }, [fileToOpenId, onFileOpened, open, requests])

  // ── My transcriptions ──────────────────────────────────────────────────
  const inLibrary = !notation && browse === 'library'
  const draftLibrary = useDraftLibrary(inLibrary)
  const { drafts, remove: removeStoredDraft } = draftLibrary

  const openDraft = useCallback(
    async (draft) => {
      const request = requests.begin()
      setError(null)
      setStatus('loading')
      try {
        const saved = await loadDraft(draft.id)
        if (!saved) throw new Error('That transcription isn’t on this device anymore.')
        const extension = saved.format === 'guitar-pro' ? 'gp' : 'musicxml'
        await open(saved.bytes, `${saved.title}.${extension}`, { title: saved.title, draft: { id: saved.id, about: saved.about ?? null }, request })
      } catch (err) {
        if (!request.isCurrent()) return
        console.error(err)
        setError(err.message || 'Could not open that transcription.')
        setStatus('error')
      }
    },
    [open, requests],
  )

  const removeDraft = useCallback(async (draft) => {
    if (!window.confirm(`Delete the draft "${draft.title}"? This can't be undone.`)) return
    await removeStoredDraft(draft)
  }, [removeStoredDraft])

  // A finished transcription: keep it (keyed by what it was made from, so
  // the same recording or video again replaces it), then open it.
  const keepTranscription = useCallback(
    async ({ id, title, musicXml, about, request = requests.begin() }) => {
      const { bytes, kept } = await keepTranscriptionCopy({ id, title, musicXml, about })
      if (!request.isCurrent()) return
      setBrowse('library')
      const loaded = await open(bytes, `${title}.musicxml`, { title, draft: { id, about }, request })
      if (loaded && !kept) setStorageNotice('Your draft is open, but this browser could not save it. Export MIDI or Guitar Pro before leaving this page to keep your work.')
    },
    [open, requests],
  )

  // Transcribed here, from a file (keyed by the recording's fingerprint).
  const finishTranscription = useCallback(
    async (file, result) => {
      const request = requests.begin()
      const id = await fingerprintBytes(await file.arrayBuffer())
      if (!request.isCurrent()) return
      await keepTranscription({ request, id, title: result.title, musicXml: result.musicXml, about: { isolated: result.isolated, heard: result.heard } })
    },
    [keepTranscription, requests],
  )

  // ── Shared attempts ────────────────────────────────────────────────────
  const openShared = useCallback(
    async (attempt, bytes, filename, options = {}) => {
      const request = requests.begin()
      setShared({ phase: 'loading', attempt })
      const index = Number(attempt.part_id)
      const loaded = await open(bytes, filename, {
        ...options,
        request,
        catalogSongId: attempt.song_id,
        part: { index: Number.isInteger(index) ? index : null, withOthers: attempt.with_others },
        shift: attempt.guitar_shift ?? 0,
      })
      if (!request.isCurrent()) return
      if (!loaded) {
        setShared({ phase: 'error', error: 'Could not open this score at the tuning used in the shared run.' })
        return
      }
      setShared({ phase: 'open', attempt })
      onSharedAttemptDone?.()
    },
    [open, onSharedAttemptDone, requests],
  )

  // Follow a share link once someone is signed in. Before that, the gate
  // shows a phase derived from auth (see sharedGate below).
  const userId = auth?.user?.id ?? null
  const passageKey = savedPassagesKey(notation?.fingerprint, userId)
  const section = selection?.passageId && selection.storageKey !== passageKey ? null : selection
  useEffect(() => {
    if (!sharedAttemptId || !userId || !supabase) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const attempt = await getSharedAttempt(supabase, sharedAttemptId)
        if (cancelled) return
        if (!attempt) throw new Error('This shared attempt doesn’t exist anymore.')
        if (attempt.instrument !== 'guitar') throw new Error('This attempt was sung — open it from the Vocal tab.')
        // The catalog song, a built-in song both people have, or a file of yours on this device.
        const found = await findSongFile({ songId: attempt.song_id, fingerprint: attempt.song_fingerprint })
        if (cancelled) return
        if (found) await openShared(attempt, found.bytes, found.filename, found.options)
        else setShared({ phase: 'need-file', attempt })
      } catch (err) {
        console.error(err)
        if (!cancelled) setShared({ phase: 'error', error: err.message || 'Could not open this shared attempt.' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sharedAttemptId, userId, openShared])

  const handleSharedFile = useCallback(
    async (file) => {
      const attempt = shared?.attempt
      if (!attempt) return
      const bytes = await file.arrayBuffer()
      if ((await fingerprintBytes(bytes)) === attempt.song_fingerprint) await openShared(attempt, bytes, file.name)
      else setShared({ phase: 'mismatch', attempt, pendingFile: { bytes, name: file.name } })
    },
    [openShared, shared],
  )

  const closeShared = useCallback(() => {
    requests.cancel()
    setShared(null)
    setNotation(null)
    onSharedAttemptDone?.()
  }, [onSharedAttemptDone, requests])

  // ── The open song ──────────────────────────────────────────────────────
  const shift = pitchSetup.shift
  const shiftLimits = useMemo(() => notation ? guitarShiftLimits(notation.score) : null, [notation])
  const score = notation ? pitchSetup.score ?? notation.score : null
  const tracks = useMemo(() => (score ? practiceableTracks(score) : []), [score])
  const practised = tracks.find((t) => t.index === trackIndex) ?? tracks[0] ?? null
  const hasOthers = Boolean(score && score.tracks.length > 1)
  const withOthers = hasOthers && accompaniment === 'all'

  const trackIndexes = useMemo(() => {
    if (!score) return [0]
    const mine = practised?.index ?? 0
    return withOthers ? [mine, ...score.tracks.map((t) => t.index).filter((i) => i !== mine)] : [mine]
  }, [score, practised, withOthers])

  const timeline = useMemo(
    () => (score ? buildTimeline(score, { trackIndex: practised?.index ?? 0 }) : null),
    [score, practised],
  )
  const practiceTimeline = useMemo(() => sectionTimeline(timeline, section), [timeline, section])
  const entries = practiceTimeline && practised ? practiceTimeline.entries : []
  // What the practice modes score: everything, or the Easy version's notes.
  const scoredTimeline = useMemo(
    () => (easy ? sectionTimeline(withEasy(timeline, true), section) : practiceTimeline),
    [timeline, easy, section, practiceTimeline],
  )
  const clock = useMemo(() => (timeline ? createSongClock(timeline.tempoMap) : null), [timeline])

  const onPosition = useCallback(
    ({ tick, playing }) => clock?.update({ wall: performance.now(), tick, speed: api?.playbackSpeed ?? 1, playing }),
    [api, clock],
  )
  const player = useAlphaTabPlayer(api, { onPosition })
  const backingActive = mode === 'listen' && Boolean(notation && backing && !sessionsView && shared?.phase !== 'open')
  const stopBacking = useCallback(() => {
    setBacking(null)
    setBackingError(null)
  }, [])
  useEffect(() => {
    if (!backingActive || !api) return undefined
    const transport = attachBackingTrack(api, backing.audio, backing.alignment,
      () => api.playerState === synth.PlayerState.Playing,
      (message) => {
        setBackingError(message)
        setBacking(null)
      })
    backingTransport.current = transport
    return () => {
      backingTransport.current = null
      transport.dispose()
    }
  }, [api, backing, backingActive])
  useEffect(() => {
    if (backingActive) backingTransport.current?.syncTempo()
  }, [backingActive, speed])
  const getHost = useCallback(() => scoreRef.current?.getHost() ?? null, [])
  const highlighted = section?.loop || section?.passageId ? section : null
  const overlay = useTabOverlay(api, getHost, entries, highlighted?.first ?? null, highlighted?.last)
  const sectionStart = practiceTimeline?.startTick
  const sectionEnd = practiceTimeline?.endTick
  const savedSection = Boolean(section?.passageId)
  const shouldLoop = Boolean(section?.loop)

  useEffect(() => {
    if (!api || !player.ready || sectionStart == null || backingActive) return
    if (savedSection && mode === 'wait') {
      clearLoop(api)
      seekToTick(api, sectionStart)
    } else if (mode !== 'wait' || shouldLoop) {
      playRange(api, sectionStart, sectionEnd, shouldLoop)
    } else {
      return
    }
    api.scrollToCursor()
  }, [api, player.ready, sectionStart, sectionEnd, section, savedSection, shouldLoop, mode, practised, easy, accompaniment, backingActive])

  useEffect(() => {
    if (!selection?.passageId || selection.storageKey === passageKey) return
    api?.stop()
    if (api) clearLoop(api)
  }, [api, passageKey, selection])

  const changeSection = (next) => {
    stopTrainingRef.current?.()
    api?.stop()
    if (api) clearLoop(api)
    setSection(next?.passageId ? { ...next, storageKey: passageKey } : next)
    setPassageTempo(next?.passageId ? next.tempo : null)
    if (next) revealScoreBar(next.first)
  }

  const passageSettings = () => {
    const range = api?.playbackRange
    const bars = range ? barsTouchedByRange(timeline?.bars ?? [], range) : section
    if (!bars) return null
    return {
      first: bars.first,
      last: bars.last,
      tempo: clampTempo(scoreRef.current?.getChosenTempo()),
      loop: range ? api.isLooping === true : section?.loop === true,
    }
  }
  const changePassageLoop = () => {
    setSection((current) => current?.passageId ? { ...current, loop: api.isLooping } : current)
  }

  const playSelection = () => {
    if (!api) return
    if (backingActive) {
      backingTransport.current?.play()
      return
    }
    if (sectionStart != null && (api.tickPosition < sectionStart || api.tickPosition >= sectionEnd)) {
      seekToTick(api, sectionStart)
    }
    api.play()
  }

  // Track mute/solo for the mode: your own part never plays while you're judged.
  const restoreMix = useCallback(() => {
    if (api && score) {
      applyMix(api, score, { mode, accompaniment, trackIndex: practised?.index ?? 0 })
      if (mode === 'listen' && (backingActive || !referenceOn)) api.changeTrackMute(score.tracks, true)
    }
  }, [api, score, mode, accompaniment, practised, referenceOn, backingActive])
  useEffect(() => {
    restoreMix()
  }, [restoreMix, player.ready])

  const changeMode = (next) => {
    api?.stop()
    if (next !== 'listen') stopBacking()
    setMode(next)
  }
  const changeTrack = (index) => {
    api?.stop()
    setTrackIndex(index)
  }
  const changeAccompaniment = (value) => {
    api?.stop()
    setAccompaniment(value)
  }
  const changeEasy = (value) => {
    api?.stop()
    setEasy(value)
    saveEasy(notation?.fingerprint, value)
  }

  const viewingShared = shared?.phase === 'open' && notation

  // ── Run history ────────────────────────────────────────────────────────
  // The practice session at this song: starts once it's open for a signed-in
  // user (and stays while its sessions are on screen), ends on leaving it.
  // Opening a shared attempt isn't practising, so no session then.
  const sessionSong = useMemo(
    () => (notation ? { songId: notation.catalogSongId, fingerprint: notation.fingerprint, title: notation.title } : null),
    [notation],
  )
  const practiceSession = usePracticeSession({
    supabase,
    userId,
    song: sessionSong,
    instrument: 'guitar',
    freshStart: freshStartRef,
    enabled: status === 'ready' && !viewingShared,
  })

  // Last and best of the full runs at this song, mode, part and version.
  const scoredMode = mode === 'wait' || mode === 'trouble' ? mode : null
  const partId = practised ? String(practised.index) : null
  const scoresKey = notation && scoredMode ? `${userId}:${notation.catalogSongId}:${notation.fingerprint}:${scoredMode}:${partId}:${easy}:${shift}` : null
  const troubleSpots = useMemo(() => {
    if (!timeline || !scoresKey || scores?.key !== scoresKey || !scores.runs) return []
    return recurringTroubleSpots(withEasy(timeline, easy).entries, scores.runs)
  }, [timeline, easy, scores, scoresKey])
  useEffect(() => {
    if (!scoresKey || !userId || !supabase || viewingShared) return undefined
    let live = true
    const query = {
      songId: notation.catalogSongId,
      songFingerprint: notation.fingerprint,
      instrument: 'guitar',
      mode: scoredMode,
      easy,
      partId,
      guitarShift: shift,
    }
    Promise.allSettled([getSongScoreStats(supabase, query), listGuitarPracticeVerdicts(supabase, query)])
      .then(([stats, runs]) => {
        if (!live) return
        setScores({
          key: scoresKey,
          stats: stats.status === 'fulfilled' ? stats.value : null,
          error: stats.status === 'rejected' ? 'Your run history could not load.' : null,
          runs: runs.status === 'fulfilled' ? runs.value : null,
        })
      })
    return () => {
      live = false
    }
    // scoresKey stands for the song, mode, part and version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoresKey, userId, viewingShared, scoresVersion])
  const runSaved = useCallback(() => setScoresVersion((n) => n + 1), [])

  // Practice sessions for a song, from Home's "Working on". Deferred a tick,
  // like the other hand-offs from App, so it doesn't cascade renders.
  useEffect(() => {
    if (!sessionsToOpen) return undefined
    const id = setTimeout(() => {
      setSessionsView({
        song: {
          songId: sessionsToOpen.songId ?? null,
          fingerprint: sessionsToOpen.songFingerprint ?? null,
          title: sessionsToOpen.songTitle ?? '',
        },
        returnTo: 'library',
      })
      setNotation(null)
      onSessionsOpened?.()
    }, 0)
    return () => clearTimeout(id)
  }, [sessionsToOpen, onSessionsOpened])

  const openSessions = (song, returnTo) => {
    requests.cancel()
    stopBacking()
    api?.stop()
    setSessionsView({ song, returnTo })
  }

  // Practise / + New session on a song card: back to the song if it's the
  // one open, else open it, continuing a recent session or starting a new one.
  const practiseFromSessions = async (entry, { fresh = false } = {}) => {
    const sameSong =
      notation && (entry.song_id ? notation.catalogSongId === entry.song_id : notation.fingerprint === entry.song_fingerprint)
    if (sameSong) {
      if (fresh) practiceSession.startNew()
      setSessionsView(null)
      return
    }
    const request = requests.begin()
    freshStartRef.current = fresh
    setSessionsView(null)
    setNotation(null)
    setStatus('loading')
    try {
      const found = await findSongFile({ songId: entry.song_id, fingerprint: entry.song_fingerprint })
      if (!request.isCurrent()) return
      const title = entry.song_title
      if (!found) throw new Error(`Open ${title ? `“${title}”` : 'this song'}’s file once on this device to practise it again.`)
      await open(found.bytes, found.filename, { ...found.options, request })
    } catch (err) {
      if (!request.isCurrent()) return
      console.error(err)
      freshStartRef.current = false
      setError(err.message || 'Could not open that song.')
      setStatus('error')
    }
  }

  // Listening to the Easy version: what it leaves out is grey on the tab.
  useEffect(() => {
    if (!easy || mode !== 'listen' || viewingShared || !scoredTimeline) return undefined
    for (const entry of scoredTimeline.entries) if (entry.optional) overlay.mark(entry.index, 'skipped')
    return () => overlay.clear()
  }, [easy, mode, viewingShared, scoredTimeline, overlay])
  const sharedGate =
    shared ??
    (!auth?.ready
      ? { phase: 'loading' }
      : !auth?.configured
        ? { phase: 'error', error: 'Shared attempts need the cloud, which isn’t configured on this copy of the app.' }
        : !auth?.user
          ? { phase: 'signin' }
          : { phase: 'loading' })

  if (sharedAttemptId && !viewingShared) {
    return (
      <div ref={pageRef} className="guitar-song">
        <SharedAttemptGate
          shared={sharedGate}
          verb="played"
          accept={GUITAR_NOTATION_ACCEPT}
          uploadLabel="Open your copy (Guitar Pro, MusicXML or MIDI)"
          onNavigateHome={() => onNavigate?.('home')}
          onFileSelected={handleSharedFile}
          onOpenAnyway={() => shared?.pendingFile && openShared(shared.attempt, shared.pendingFile.bytes, shared.pendingFile.name)}
          onClose={closeShared}
        />
      </div>
    )
  }

  if (sessionsView) {
    const toSong = sessionsView.returnTo === 'song' && notation
    const { song } = sessionsView
    return (
      <div ref={pageRef} className="guitar-song">
        <div className="guitar-song__toolbar">
          <button type="button" className="guitar-song__back" onClick={() => setSessionsView(null)}>
            {toSong ? `← ${notation.title}` : '← Songs'}
          </button>
          <span className="guitar-song__title">Practice sessions</span>
        </div>
        <PracticeSessions
          key={song ? (song.songId ?? song.fingerprint ?? song.title) : 'all'}
          auth={auth}
          supabase={supabase}
          song={song}
          instrument="guitar"
          onPractise={practiseFromSessions}
        />
      </div>
    )
  }

  if (!notation) {
    if (browse === 'transcribe') {
      return (
        <div ref={pageRef} className="guitar-song">
          <div className="guitar-song__toolbar">
            <button type="button" className="guitar-song__back" onClick={() => { requests.cancel(); setStatus('idle'); setBrowse('library') }}>
              ← Songs
            </button>
            <span className="guitar-song__title">Tab the guitar from a song</span>
          </div>
          <TranscribePanel onTranscribed={finishTranscription} />
        </div>
      )
    }
    if (browse === 'search') {
      return (
        <div ref={pageRef} className="guitar-song">
          <div className="guitar-song__toolbar">
            <button type="button" className="guitar-song__back" onClick={() => { requests.cancel(); setStatus('idle'); setBrowse('library') }}>
              ← Songs
            </button>
            <span className="guitar-song__title">Search songs</span>
          </div>
          <OnlineSongs configured={auth?.configured} supabase={supabase} onSelectSong={openCloud} instrument="guitar" />
          {status === 'loading' && <GuitarFeedback>Opening your score...</GuitarFeedback>}
          {status === 'error' && <GuitarFeedback kind="error">{error} Choose another score to try again.</GuitarFeedback>}
        </div>
      )
    }
    return (
      <div ref={pageRef} className="guitar-song guitar-song--library">
        <h2 className="guitar-song__library-title">Songs</h2>
        <div className="guitar-song__library-actions">
          <label className={`notation-uploader ${status === 'loading' ? 'notation-uploader--disabled' : ''}`}>
            <input
              type="file"
              accept={GUITAR_NOTATION_ACCEPT}
              disabled={status === 'loading'}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) openUpload(file)
                event.target.value = ''
              }}
            />
            <span>Open a score <small>Guitar Pro, MusicXML, MIDI or MuseScore</small></span>
          </label>
          {auth?.configured && (
            <button type="button" className="guitar-song__search" onClick={() => { requests.cancel(); setStatus('idle'); setBrowse('search') }}>
              Search songs
            </button>
          )}
          <button type="button" className="guitar-song__search" onClick={() => { requests.cancel(); setStatus('idle'); setBrowse('transcribe') }}>
            Tab the guitar from a song
          </button>
          {auth?.configured && (
            <button type="button" className="guitar-song__search" onClick={() => openSessions(null, 'library')}>
              Practice sessions
            </button>
          )}
        </div>
        {status === 'loading' && <GuitarFeedback>Opening your score...</GuitarFeedback>}
        {status === 'error' && <GuitarFeedback kind="error">{error} Choose another score to try again.</GuitarFeedback>}
        {BUILT_IN_SONGS.length > 0 && (
          <section aria-labelledby="built-in-guitar-songs">
            <h3 id="built-in-guitar-songs">Built-in songs</h3>
            <SongLibrary songs={BUILT_IN_SONGS} onSelectSong={openBuiltIn} />
          </section>
        )}
        <div className="guitar-song__saved">
          <LocalSongs onOpen={open} onBeginOpen={requests.begin} />
          <MyTranscriptions phase={draftLibrary.phase} error={draftLibrary.error} deleting={draftLibrary.deleting} onRetry={draftLibrary.retry} onCreate={() => setBrowse('transcribe')} drafts={drafts} onOpen={openDraft} onDelete={removeDraft} />
        </div>
      </div>
    )
  }

  const exportScore = (exporter) => {
    setExportError(null)
    try { exporter(notation) }
    catch { setExportError('This score could not be exported. Try the other format, or reopen the original file and try again.') }
  }
  const ready = player.ready
  const shiftDisabled = !ready || backingActive || player.state === 'playing' || scoredRunActive
  const changeShift = (next) => {
    if (shiftDisabled || next === shift) return
    try {
      const shifted = transposeGuitarScore(notation.score, next, shiftLimits)
      api?.stop()
      setPitchSetup({ shift: next, score: next ? shifted : null })
      setShiftError(null)
    } catch (err) {
      setShiftError(err instanceof RangeError ? err.message : 'Could not transpose this score.')
    }
  }
  const backingStart = backingActive ? ticksToSeconds(timeline.tempoMap, backing.alignment.startTick) : null
  const backingEnd = backingActive ? ticksToSeconds(timeline.tempoMap, backing.alignment.endTick) : null
  const modes = GUITAR_MODES.map((m) => (m.id !== 'listen' && !entries.length ? { ...m, disabled: true } : m))
  // What a shared attempt needs to name this song without uploading it.
  const shareSong = {
    songId: notation.catalogSongId,
    title: notation.title,
    format: notation.format === 'musescore' ? null : notation.format,
    fingerprint: notation.fingerprint,
    builtin: notation.builtin,
    partId: practised ? String(practised.index) : null,
    partName: practised?.name ?? null,
    withOthers,
    guitarShift: shift,
  }

  return (
    <div ref={pageRef} className={`guitar-song guitar-song--open guitar-follow${section && !viewingShared ? ' guitar-song--section' : ''}${optionsOpen ? ' guitar-song--options-open' : ''}`}>
      <header className="song-workspace__heading">
      <SongHeading infoHost={infoHost} notation={notation} viewingShared={viewingShared} showSessions={!viewingShared && Boolean(auth?.user && supabase)} onSessions={() => openSessions(sessionSong, 'song')} onBack={() => { requests.cancel(); stopBacking(); if (viewingShared) closeShared(); else setNotation(null) }} exportScore={exportScore} exportError={exportError} storageNotice={storageNotice} />
      <button type="button" className="song-workspace__options-button" aria-controls="song-practice-options" aria-expanded={optionsOpen} onClick={() => setOptionsOpen((open) => !open)}>Options</button>
      </header>
      <div className="song-workspace">
        <section className="song-workspace__main" aria-label="Score workspace">
          {!viewingShared && (
            <div className="song-workspace__practice">
              <PracticeModeToggle mode={mode} onChange={changeMode} disabled={!ready} modes={modes} />
              {score.masterBars?.length > 0 && (
                <SongSectionPicker key={passageKey} api={api} barCount={score.masterBars.length} section={section}
                  onChange={changeSection} disabled={!ready || backingActive} storageKey={passageKey} getPassage={passageSettings} />
              )}
              {section?.loop && !savedSection && !backingActive && <button type="button" className="practice-status__link" onClick={() => changeSection(null)}>Clear trouble spot loop</button>}
            </div>
          )}
          {!viewingShared && <div ref={setTransportHost} className="guitar-song__transport-slot" />}
      <GuitarScore
        key={`${notation.fingerprint}:${shift}`}
        ref={scoreRef}
        settingsHost={settingsHost}
        hideControls={viewingShared}
        sectionFocused={Boolean(section) && !viewingShared}
        score={score}
        songKey={notation.fingerprint}
        userId={userId}
        catalogSongId={notation.catalogSongId}
        client={supabase}
        trackIndexes={trackIndexes}
        onApi={setApi}
        onSpeedChange={setSpeed}
        onManualTempoChange={() => stopTrainingRef.current?.()}
        passageTempo={savedSection ? passageTempo : null}
        onPassageTempoChange={setPassageTempo}
        controlsDisabled={viewingShared || (mode === 'trouble' && player.state === 'playing')}
        backingActive={backingActive}
      />
        </section>
        <div className="song-workspace__side">
          <div ref={setFeedbackHost} className="song-workspace__feedback" />
          <aside id="song-practice-options" className="song-workspace__sidebar" aria-label="Practice options">
          <div className="song-workspace__sidebar-heading"><h2>Practice options</h2><button type="button" onClick={() => setOptionsOpen(false)} className="song-workspace__close" aria-label="Close practice options">✕</button></div>
      {!viewingShared && <details className="guitar-song__settings"><summary>Practice settings · part, accompaniment and version</summary><div className="guitar-song__settings-body">
      <PartTabs
        parts={tracks.map((t) => ({ id: t.index, name: t.name }))}
        selected={practised?.index}
        onSelect={changeTrack}
      />

      {mode === 'listen' && !viewingShared && !backingActive && <button type="button" className="guitar-song__reference" aria-pressed={referenceOn} onClick={() => setReferenceOn((on) => !on)} disabled={!ready}>Reference audio {referenceOn ? 'on' : 'off'}</button>}
      {hasOthers && !viewingShared && (
        <AccompanimentToggle
          value={accompaniment}
          mode={mode}
          onChange={changeAccompaniment}
          disabled={!ready}
          options={GUITAR_ACCOMPANIMENTS}
        />
      )}
      {entries.length > 0 && !viewingShared && (
        <EasyToggle easy={easy} onChange={changeEasy} disabled={!ready || (mode === 'trouble' && player.state === 'playing')} />
      )}

      </div></details>}
      {!viewingShared && <div ref={setSettingsHost} className="guitar-song__tempo-slot" />}
      {!viewingShared && <details className="guitar-song__settings">
        <summary>Transpose · {shift ? `${signed(shift)} semitones` : 'As written'}</summary>
        <div className="guitar-song__settings-body">
          <TransposeSteps shift={shift} onChange={changeShift} disabled={shiftDisabled}
            min={shiftLimits.min} max={shiftLimits.max} label={shift ? `${signed(shift)} semitones` : 'As written'} reset />
          {backingActive && <p>Turn off the backing track to change the tuning shift.</p>}
          {shiftError && <p role="alert">{shiftError}</p>}
        </div>
      </details>}
      {!viewingShared && timeline && <LocalBackingTrack key={notation.fingerprint} api={api} timeline={timeline} ready={ready}
        available={mode === 'listen'} active={backingActive} error={backingError} shifted={shift !== 0}
        onActivate={(track) => { setBackingError(null); setBacking(track) }} onDeactivate={stopBacking} />}

      {!ready && !viewingShared && <GuitarFeedback>Loading guitar sound... {Math.round(player.loaded * 100)}%</GuitarFeedback>}
      {viewingShared && (
        <GuitarSharedPanel
          key={`${shared.attempt.id}:${userId}`}
          onTransportStart={enableScoreFollow}
          attempt={shared.attempt}
          entries={entries}
          overlay={overlay}
          supabase={supabase}
          api={api}
          ready={ready}
          userId={userId}
          scoreFingerprint={notation.fingerprint}
        />
      )}
      {!viewingShared && scoresKey && auth?.user && entries.length > 0 && (
        <section className="guitar-song__history" aria-label="Full run history">
          <strong>Your full runs</strong>
          {scores?.key !== scoresKey ? <GuitarFeedback>Loading your run history...</GuitarFeedback> : scores.error ? <GuitarFeedback kind="error" onRetry={() => setScoresVersion((n) => n + 1)} retryLabel="Retry history">{scores.error}</GuitarFeedback> : <p>{lastAndBestLine(scores.stats)}</p>}
          <small>Compared within this mode, part and version. Partial or looped practice does not set a best.</small>
          {scores?.key === scoresKey && (
            <div className="run-review" aria-label="Recurring trouble spots">
              <h3>Recurring trouble spots</h3>
              {!scores.runs ? (
                <GuitarFeedback kind="error" onRetry={() => setScoresVersion((n) => n + 1)} retryLabel="Retry trouble spots">Your trouble spots could not load.</GuitarFeedback>
              ) : troubleSpots.length === 0 ? (
                <p>No recurring trouble spots in comparable full runs.</p>
              ) : (
                <ul className="run-review__list">
                  {troubleSpots.map(({ bar, difficult, evaluated }) => (
                    <li key={bar}>
                      <button type="button" className="run-review__item" disabled={!ready || player.state === 'playing'}
                        aria-pressed={Boolean(section?.loop && section.first === bar)}
                        onClick={() => {
                          changeSection({ first: bar, last: bar, loop: true })
                          revealScoreBar(bar)
                        }}>
                        <span>Bar {bar + 1}</span>
                        <span>Needed work in {difficult} of {evaluated} runs</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
      {section && !viewingShared && !practiceTimeline ? (
        <GuitarFeedback kind="empty">These bars aren’t played by the score. Choose another section.</GuitarFeedback>
      ) : section && !viewingShared && mode !== 'listen' && !entries.length ? (
        <GuitarFeedback kind="empty">There are no notes for this track in the selected bars.</GuitarFeedback>
      ) : timeline && !viewingShared && mode === 'wait' && entries.length > 0 ? (
        // Keyed by track and version so switching either starts the mode fresh.
        <GuitarWaitMode
          key={`${shift}-${practised.index}-${easy}-${sectionStart}-${sectionEnd}`}
          api={api}
          transportHost={transportHost}
          feedbackHost={feedbackHost}
          onTransportStart={enableScoreFollow}
          onTargetBar={revealScoreBar}
          timeline={scoredTimeline}
          overlay={overlay}
          ready={ready}
          auth={auth}
          supabase={supabase}
          shareSong={shareSong}
          session={practiceSession}
          easy={easy}
          onSaved={runSaved}
          onRunActiveChange={setScoredRunActive}
        />
      ) : timeline && !viewingShared && mode === 'trouble' && entries.length > 0 ? (
        <>
          <GuitarTroubleMode
            key={`${notation.fingerprint}-${shift}-${practised.index}-${easy}-${sectionStart}-${sectionEnd}`}
            api={api}
            transportHost={transportHost}
            feedbackHost={feedbackHost}
          onTransportStart={enableScoreFollow}
            score={score}
            timeline={scoredTimeline}
            overlay={overlay}
            player={player}
            clock={clock}
            latencyMs={latencyMs}
            onLatencyChange={setLatencyMs}
            restoreMix={restoreMix}
            title={notation.title}
            auth={auth}
            supabase={supabase}
            shareSong={shareSong}
            session={practiceSession}
            easy={easy}
            onSaved={runSaved}
            onRunActiveChange={setScoredRunActive}
            speed={speed}
            setTrainingTempo={setTrainingTempo}
            stopTrainingRef={stopTrainingRef}
            onPassageLoopChange={savedSection ? changePassageLoop : undefined}
            onClearPassage={savedSection ? () => changeSection(null) : undefined}
          />
        </>
      ) : (
        // Someone's shared run plays their recording (GuitarSharedPanel), never the song's MIDI.
        timeline &&
        !viewingShared && (
          <>
            <PlaybackControls
              transportHost={transportHost}
          onTransportStart={enableScoreFollow}
              state={player.state}
              position={ticksToSeconds(timeline.tempoMap, player.tick)}
              duration={backingEnd ?? practiceTimeline.duration}
              startTime={backingStart ?? practiceTimeline.startTime}
              rate={speed}
              onPlay={playSelection}
              onPause={() => api?.pause()}
              onStop={() => api?.stop()}
              onSeek={(seconds) => {
                if (api) seekToTick(api, secondsToTicks(timeline.tempoMap, seconds))
              }}
              disabled={!ready}
            />
            {(!section || savedSection || backingActive) && <SongTransportExtras api={api} disabled={!ready || (savedSection && player.state === 'playing')}
              onLoopChange={savedSection && !backingActive ? changePassageLoop : undefined}
              onClear={backingActive ? () => backingTransport.current?.clearSelection() : savedSection ? () => changeSection(null) : undefined} />}
          </>
        )
      )}
      {!viewingShared && auth?.user && (practiceSession.session || practiceSession.attempts.length > 0 || practiceSession.error) && (practiceSession.session?.user_id === userId || practiceSession.attempts.length === 0) && (
        <section className="guitar-song__session" aria-label="Current practice session">
          {practiceSession.error && <p role="alert">{practiceSession.error} Your playing still works. Reopen the song to retry saving.</p>}
          <SessionAttempts supabase={supabase} session={practiceSession} />
        </section>
      )}
        <div ref={setInfoHost} className="song-workspace__info" />
          </aside>
        </div>
      </div>
    </div>
  )
}

export default GuitarSong
