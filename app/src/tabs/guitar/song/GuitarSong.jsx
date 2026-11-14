import { useLatestSongRequest } from './useLatestSongRequest.js'
import { useDraftLibrary } from './useDraftLibrary.js'
import SongHeading from './SongHeading.jsx'
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
import { getSharedAttempt, getSongScoreStats } from '@backend/attempts'
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
import { lastAndBestLine } from './follow/runHistory.js'
import { GUITAR_ACCOMPANIMENTS, GUITAR_MODES, applyMix } from './follow/modes.js'
import { seekToTick } from './follow/playerControls.js'
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
  const requests = useLatestSongRequest()
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)
  const [storageNotice, setStorageNotice] = useState(null)
  const [exportError, setExportError] = useState(null)
  const [api, setApi] = useState(null)
  const [mode, setMode] = useState('listen')
  const [trackIndex, setTrackIndex] = useState(null) // null = the first practiceable track
  const [accompaniment, setAccompaniment] = useState('solo')
  const [latencyMs, setLatencyMs] = useState(loadLatency)
  const [referenceOn, setReferenceOn] = useState(true)
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
  const scoreRef = useRef(null)
  const enableScoreFollow = useCallback(() => scoreRef.current?.enableFollow(), [])
  const pageRef = useRef(null)
  useEffect(() => {
    pageRef.current?.closest('.guitar-tab__body')?.scrollTo?.({ top: 0 })
  }, [notation?.fingerprint, browse, sessionsView])

  // `catalogSongId` / `builtin` say where the song came from (for sharing),
  // `draft` ({ id }) that it's a transcription kept on this device;
  // `part` preselects a track and accompaniment (opening a shared attempt).
  const open = useCallback(async (arrayBuffer, filename, { title, catalogSongId = null, builtin = false, draft = null, part = null, request = requests.begin() } = {}) => {
    if (!request.isCurrent()) return undefined
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
      setTrackIndex(part?.index ?? null)
      if (part) setAccompaniment(part.withOthers ? 'all' : 'solo')
      setMode('listen')
      setEasy(loadEasy(fingerprint))
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
      setShared({ phase: 'open', attempt })
      const index = Number(attempt.part_id)
      await open(bytes, filename, {
        ...options,
        catalogSongId: attempt.song_id,
        part: { index: Number.isInteger(index) ? index : null, withOthers: attempt.with_others },
      })
      onSharedAttemptDone?.()
    },
    [open, onSharedAttemptDone],
  )

  // Follow a share link once someone is signed in. Before that, the gate
  // shows a phase derived from auth (see sharedGate below).
  const userId = auth?.user?.id ?? null
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
  const score = notation?.score ?? null
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
  const entries = timeline && practised ? timeline.entries : []
  // What the practice modes score: everything, or the Easy version's notes.
  const scoredTimeline = useMemo(() => withEasy(timeline, easy), [timeline, easy])
  const clock = useMemo(() => (timeline ? createSongClock(timeline.tempoMap) : null), [timeline])

  const onPosition = useCallback(
    ({ tick, playing }) => clock?.update({ wall: performance.now(), tick, speed: api?.playbackSpeed ?? 1, playing }),
    [api, clock],
  )
  const player = useAlphaTabPlayer(api, { onPosition })
  const getHost = useCallback(() => scoreRef.current?.getHost() ?? null, [])
  const overlay = useTabOverlay(api, getHost, entries)

  // Track mute/solo for the mode: your own part never plays while you're judged.
  const restoreMix = useCallback(() => {
    if (api && score) {
      applyMix(api, score, { mode, accompaniment, trackIndex: practised?.index ?? 0 })
      if (mode === 'listen' && !referenceOn) api.changeTrackMute(score.tracks, true)
    }
  }, [api, score, mode, accompaniment, practised, referenceOn])
  useEffect(() => {
    restoreMix()
  }, [restoreMix, player.ready])

  const changeMode = (next) => {
    api?.stop()
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
  const scoresKey = notation && scoredMode ? `${userId}:${notation.catalogSongId ?? notation.fingerprint}:${scoredMode}:${partId}:${easy}` : null
  useEffect(() => {
    if (!scoresKey || !userId || !supabase || viewingShared) return undefined
    let live = true
    getSongScoreStats(supabase, {
      songId: notation.catalogSongId,
      songFingerprint: notation.fingerprint,
      instrument: 'guitar',
      mode: scoredMode,
      easy,
      partId,
    }).then(
      (stats) => live && setScores({ key: scoresKey, stats }),
      () => { if (live) setScores({ key: scoresKey, error: 'Your run history could not load.' }) },
    )
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
      <div ref={pageRef} className="guitar-song">
        <header className="guitar-song__header">
          <span className="guitar-song__eyebrow">YOUR DAILY PRACTICE</span>
          <h2>What do you want to play today?</h2>
          <p>Tab and standard notation, with playback — and the app listens while you play.</p>
        </header>
        {auth?.configured && (
          <button type="button" className="guitar-song__search" onClick={() => { requests.cancel(); setStatus('idle'); setBrowse('search') }}>
            <span aria-hidden="true">🔍</span>
            <span>
              <strong>Search songs</strong>
              <small>Browse the online guitar catalog</small>
            </span>
          </button>
        )}
        {auth?.configured && (
          <button type="button" className="guitar-song__search" onClick={() => openSessions(null, 'library')}>
            <span aria-hidden="true">🗓</span>
            <span>
              <strong>Practice sessions</strong>
              <small>Your previous sittings, runs and notes</small>
            </span>
          </button>
        )}
        <button type="button" className="guitar-song__search" onClick={() => { requests.cancel(); setStatus('idle'); setBrowse('transcribe') }}>
          <span aria-hidden="true">🎙️</span>
          <span>
            <strong>Tab the guitar from a song</strong>
            <small>
              Upload an MP3 or WAV: Harmonic isolates its guitar part and tabs it, on this device
            </small>
          </span>
        </button>
        <h3 className="guitar-song__section-title">Ready to play <span>Built-in songs</span></h3>
        {BUILT_IN_SONGS.length ? <SongLibrary songs={BUILT_IN_SONGS} onSelectSong={openBuiltIn} /> : <p>Open a score below to start playing.</p>}
        <LocalSongs onOpen={open} onBeginOpen={requests.begin} />
        <MyTranscriptions phase={draftLibrary.phase} error={draftLibrary.error} deleting={draftLibrary.deleting} onRetry={draftLibrary.retry} onCreate={() => setBrowse('transcribe')} drafts={drafts} onOpen={openDraft} onDelete={removeDraft} />
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
          <span>Open a score: Guitar Pro, MusicXML, MIDI or MuseScore</span>
        </label>
        {status === 'loading' && <GuitarFeedback>Opening your score...</GuitarFeedback>}
        {status === 'error' && <GuitarFeedback kind="error">{error} Choose another score to try again.</GuitarFeedback>}
      </div>
    )
  }

  const exportScore = (exporter) => {
    setExportError(null)
    try { exporter(notation) }
    catch { setExportError('This score could not be exported. Try the other format, or reopen the original file and try again.') }
  }
  const ready = player.ready
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
  }

  return (
    <div ref={pageRef} className="guitar-song guitar-song--open guitar-follow">
      <SongHeading notation={notation} viewingShared={viewingShared} showSessions={!viewingShared && Boolean(auth?.user && supabase)} onSessions={() => openSessions(sessionSong, 'song')} onBack={() => { requests.cancel(); if (viewingShared) closeShared(); else setNotation(null) }} exportScore={exportScore} exportError={exportError} storageNotice={storageNotice} />
      {!viewingShared && <PracticeModeToggle mode={mode} onChange={changeMode} disabled={!ready} modes={modes} />}
      {!viewingShared && <details className="guitar-song__settings"><summary>Practice settings · part, accompaniment and version</summary><div className="guitar-song__settings-body">
      <PartTabs
        parts={tracks.map((t) => ({ id: t.index, name: t.name }))}
        selected={practised?.index}
        onSelect={changeTrack}
      />

      {mode === 'listen' && !viewingShared && <button type="button" className="guitar-song__reference" aria-pressed={referenceOn} onClick={() => setReferenceOn((on) => !on)} disabled={!ready}>Reference audio {referenceOn ? 'on' : 'off'}</button>}
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
      {!viewingShared && <div ref={setTransportHost} className="guitar-song__transport-slot" />}
      <GuitarScore
        ref={scoreRef}
        settingsHost={settingsHost}
        hideControls={viewingShared}
        score={score}
        songKey={notation.fingerprint}
        userId={userId}
        catalogSongId={notation.catalogSongId}
        client={supabase}
        trackIndexes={trackIndexes}
        onApi={setApi}
        onSpeedChange={setSpeed}
        controlsDisabled={viewingShared || (mode === 'trouble' && player.state === 'playing')}
      />
      {!ready && !viewingShared && <GuitarFeedback>Loading guitar sound... {Math.round(player.loaded * 100)}%</GuitarFeedback>}
      {viewingShared && (
        <GuitarSharedPanel
          onTransportStart={enableScoreFollow}
          attempt={shared.attempt}
          entries={entries}
          overlay={overlay}
          supabase={supabase}
          api={api}
          ready={ready}
        />
      )}
      {!viewingShared && scoresKey && auth?.user && entries.length > 0 && (
        <section className="guitar-song__history" aria-label="Full run history">
          <strong>Your full runs</strong>
          {scores?.key !== scoresKey ? <GuitarFeedback>Loading your run history...</GuitarFeedback> : scores.error ? <GuitarFeedback kind="error" onRetry={() => setScoresVersion((n) => n + 1)} retryLabel="Retry history">{scores.error}</GuitarFeedback> : <p>{lastAndBestLine(scores.stats)}</p>}
          <small>Compared within this mode, part and version. Partial or looped practice does not set a best.</small>
        </section>
      )}
      {timeline && !viewingShared && mode === 'wait' && entries.length > 0 ? (
        // Keyed by track and version so switching either starts the mode fresh.
        <GuitarWaitMode
          key={`${practised.index}-${easy}`}
          api={api}
          transportHost={transportHost}
          onTransportStart={enableScoreFollow}
          timeline={scoredTimeline}
          overlay={overlay}
          ready={ready}
          auth={auth}
          supabase={supabase}
          shareSong={shareSong}
          session={practiceSession}
          easy={easy}
          onSaved={runSaved}
        />
      ) : timeline && !viewingShared && mode === 'trouble' && entries.length > 0 ? (
        <>
          <GuitarTroubleMode
            key={`${practised.index}-${easy}`}
            api={api}
            transportHost={transportHost}
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
            speed={speed}
          />
          <SongTransportExtras api={api} disabled={!ready || player.state === 'playing'} />
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
              duration={timeline.duration}
              rate={speed}
              onPlay={() => api?.play()}
              onPause={() => api?.pause()}
              onStop={() => api?.stop()}
              onSeek={(seconds) => {
                if (api) seekToTick(api, secondsToTicks(timeline.tempoMap, seconds))
              }}
              disabled={!ready}
            />
            <SongTransportExtras api={api} disabled={!ready} />
          </>
        )
      )}
      {!viewingShared && auth?.user && (practiceSession.session || practiceSession.attempts.length > 0 || practiceSession.error) && (practiceSession.session?.user_id === userId || practiceSession.attempts.length === 0) && (
        <section className="guitar-song__session" aria-label="Current practice session">
          {practiceSession.error && <p role="alert">{practiceSession.error} Your playing still works. Reopen the song to retry saving.</p>}
          <SessionAttempts supabase={supabase} session={practiceSession} />
        </section>
      )}
    </div>
  )
}

export default GuitarSong
