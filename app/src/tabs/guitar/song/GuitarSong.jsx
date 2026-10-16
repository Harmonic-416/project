/* global __GUITAR_SONG_FILES__ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AccompanimentToggle from '../../vocal/components/AccompanimentToggle.jsx'
import OnlineSongs from '../../vocal/components/OnlineSongs.jsx'
import PartTabs from '../../vocal/components/PartTabs.jsx'
import PlaybackControls from '../../vocal/components/PlaybackControls.jsx'
import PracticeModeToggle from '../../vocal/components/PracticeModeToggle.jsx'
import SharedAttemptGate from '../../vocal/components/SharedAttemptGate.jsx'
import SongLibrary from '../../vocal/components/SongLibrary.jsx'
import '../../vocal/components/NotationUploader.css'
import { titleFromFilename } from '../../vocal/notation/loadNotation.js'
import { fingerprintBytes } from '../../vocal/share/sharedAttempt.js'
import { fetchCatalogSong, fetchCloudNotation } from '../../vocal/songs/cloudLibrary.js'
import { getSharedAttempt } from '@backend/attempts'
import { supabase } from '../../../lib/supabaseClient.js'
import { exportGuitarMidi, exportGuitarPro } from '../notation/exportGuitarNotation.js'
import { GUITAR_NOTATION_ACCEPT, loadGuitarNotation } from '../notation/loadGuitarNotation.js'
import { chordNamesOf, saveSongChords } from '../practice/chordNames.js'
import GuitarScore from './GuitarScore.jsx'
import MyTranscriptions from './MyTranscriptions.jsx'
import TabNotice from './TabNotice.jsx'
import TranscribePanel from './TranscribePanel.jsx'
import { deleteDraft, draftsAvailable, listDrafts, loadDraft, saveDraft } from './drafts.js'
import EasyToggle from './follow/EasyToggle.jsx'
import GuitarSharedPanel from './follow/GuitarSharedPanel.jsx'
import GuitarTroubleMode from './follow/GuitarTroubleMode.jsx'
import GuitarWaitMode from './follow/GuitarWaitMode.jsx'
import SongTransportExtras from './follow/SongTransportExtras.jsx'
import { loadEasy, saveEasy, withEasy } from './follow/easyMode.js'
import { GUITAR_ACCOMPANIMENTS, GUITAR_MODES, applyMix } from './follow/modes.js'
import { seekToTick } from './follow/playerControls.js'
import { createSongClock, loadLatency } from './follow/songClock.js'
import { buildTimeline, practiceableTracks, secondsToTicks, ticksToSeconds } from './follow/songTimeline.js'
import { useAlphaTabPlayer } from './follow/useAlphaTabPlayer.js'
import { useTabOverlay } from './follow/useTabOverlay.js'
import '../../../auth/authTheme.css'
import './GuitarSong.css'
import './follow/GuitarFollow.css'

// Built-in guitar songs: every file in public/guitar-songs/ (string/fret data,
// so they show tab), listed by vite.config.js at dev start / build.
const BUILT_IN_SONGS = __GUITAR_SONG_FILES__.map((filename) => ({
  id: filename,
  filename,
  title: titleFromFilename(filename),
})).sort((a, b) => a.title.localeCompare(b.title))

const FORMAT_LABEL = {
  'guitar-pro': 'Guitar Pro',
  alphatex: 'alphaTex',
  musicxml: 'MusicXML',
  mxl: 'MXL',
  midi: 'MIDI',
}

/**
 * Over a transcription: how it was made (`about`, from the pipeline: whether
 * the guitar was separated from a band, and how much of the song it plays
 * in). Older drafts don't say.
 */
function DraftNotice({ about }) {
  let text = 'Draft from a recording: the notes, rhythm and fingering are a best guess, so check it by ear.'
  if (about?.isolated) {
    const share = Math.round((about.heard ?? 0) * 100)
    text =
      `The guitar part, isolated from the full song${share ? ` (the guitar plays in about ${share}% of it)` : ''}. ` +
      'Other instruments can bleed into it, so check stray notes by ear.'
  } else if (about) {
    text = 'Transcribed from a recording of a guitar on its own: a best guess, so check it by ear.'
  }
  return (
    <div className="guitar-song__notice guitar-song__notice--info">
      <p>{text}</p>
    </div>
  )
}

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
 * Or transcribe a recording (TranscribePanel, transcribe/pipeline.js): an
 * audio file becomes a draft score, opened like any song and kept on this
 * device under "My transcriptions" (drafts.js).
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
 */
function GuitarSong({ auth, onNavigate, sharedAttemptId, onSharedAttemptDone }) {
  const [browse, setBrowse] = useState('library') // library | search | transcribe
  const [notation, setNotation] = useState(null) // loadGuitarNotation's result + { fingerprint, catalogSongId, builtin, draft }
  const [drafts, setDrafts] = useState([]) // My transcriptions: [{ id, title, updated }]
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)
  const [api, setApi] = useState(null)
  const [mode, setMode] = useState('listen')
  const [trackIndex, setTrackIndex] = useState(null) // null = the first practiceable track
  const [accompaniment, setAccompaniment] = useState('solo')
  const [latencyMs, setLatencyMs] = useState(loadLatency)
  const [speed, setSpeed] = useState(1) // the tempo control's playback speed, for the time readouts
  const [easy, setEasy] = useState(false)
  // A shared attempt being opened: { phase, attempt, error, pendingFile }, where
  // phase is signin | loading | need-file | mismatch | error | open.
  const [shared, setShared] = useState(null)
  const scoreRef = useRef(null)

  // `catalogSongId` / `builtin` say where the song came from (for sharing),
  // `draft` ({ id }) that it's a transcription kept on this device;
  // `part` preselects a track and accompaniment (opening a shared attempt).
  const open = useCallback(async (arrayBuffer, filename, { title, catalogSongId = null, builtin = false, draft = null, part = null } = {}) => {
    setStatus('loading')
    setError(null)
    try {
      // The fingerprint names the song for sharing and for its remembered tempo (same file, same tempo).
      const [loaded, fingerprint] = await Promise.all([
        loadGuitarNotation(arrayBuffer, filename, { title }),
        fingerprintBytes(arrayBuffer),
      ])
      setTrackIndex(part?.index ?? null)
      if (part) setAccompaniment(part.withOthers ? 'all' : 'solo')
      setMode('listen')
      setEasy(loadEasy(fingerprint))
      saveSongChords(loaded.title, chordNamesOf(loaded.score)) // for ear training's "Chords from my song"
      setNotation({ ...loaded, fingerprint, catalogSongId, builtin, draft })
      setStatus('ready')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not open this file.')
      setStatus('error')
    }
  }, [])

  const openBuiltIn = useCallback(
    async (song) => {
      setStatus('loading')
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}guitar-songs/${song.filename}`)
        if (!response.ok) throw new Error(`Could not load ${song.title} (HTTP ${response.status}).`)
        await open(await response.arrayBuffer(), song.filename, { builtin: true })
      } catch (err) {
        setError(err.message)
        setStatus('error')
      }
    },
    [open],
  )

  const openCloud = useCallback(
    async (item) => {
      setStatus('loading')
      try {
        const bytes = await fetchCloudNotation(supabase, item.song)
        await open(bytes, `${item.title}.musicxml`, { title: item.title, catalogSongId: item.id })
      } catch (err) {
        console.error(err)
        setError(err.message || 'Could not load that song from the cloud.')
        setStatus('error')
      }
    },
    [open],
  )

  const openUpload = useCallback(async (file) => open(await file.arrayBuffer(), file.name), [open])

  // ── My transcriptions ──────────────────────────────────────────────────
  const inLibrary = !notation && browse === 'library'
  useEffect(() => {
    if (!inLibrary || !draftsAvailable()) return undefined
    let cancelled = false
    listDrafts()
      .then((list) => {
        if (!cancelled) setDrafts(list)
      })
      .catch((err) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [inLibrary])

  const openDraft = useCallback(
    async (draft) => {
      setStatus('loading')
      try {
        const saved = await loadDraft(draft.id)
        if (!saved) throw new Error('That transcription isn’t on this device anymore.')
        const extension = saved.format === 'guitar-pro' ? 'gp' : 'musicxml'
        await open(saved.bytes, `${saved.title}.${extension}`, { title: saved.title, draft: { id: saved.id, about: saved.about ?? null } })
      } catch (err) {
        console.error(err)
        setError(err.message || 'Could not open that transcription.')
        setStatus('error')
      }
    },
    [open],
  )

  const removeDraft = useCallback(async (draft) => {
    if (!window.confirm(`Delete the draft “${draft.title}”? This can’t be undone.`)) return
    try {
      await deleteDraft(draft.id)
      setDrafts((list) => list.filter((d) => d.id !== draft.id))
    } catch (err) {
      console.error(err)
    }
  }, [])

  // A finished transcription: keep it (keyed by the recording, so the same
  // file again replaces it), then open it.
  const finishTranscription = useCallback(
    async (file, result) => {
      const bytes = new TextEncoder().encode(result.musicXml).buffer
      const id = await fingerprintBytes(await file.arrayBuffer())
      const about = { isolated: result.isolated, heard: result.heard }
      if (draftsAvailable()) {
        try {
          await saveDraft({ id, title: result.title, format: 'musicxml', bytes, about })
        } catch (err) {
          console.error(err) // it still opens; it just isn't kept
        }
      }
      setBrowse('library')
      await open(bytes, `${result.title}.musicxml`, { title: result.title, draft: { id, about } })
    },
    [open],
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
        if (attempt.song_id) {
          const song = await fetchCatalogSong(supabase, attempt.song_id)
          if (!song) throw new Error('The catalog song for this attempt is no longer available.')
          const bytes = await fetchCloudNotation(supabase, song)
          if (!cancelled) await openShared(attempt, bytes, `${song.title}.musicxml`, { title: song.title })
          return
        }
        // A built-in song both people have: find it by fingerprint.
        for (const song of BUILT_IN_SONGS) {
          const response = await fetch(`${import.meta.env.BASE_URL}guitar-songs/${song.filename}`)
          if (!response.ok) continue
          const bytes = await response.arrayBuffer()
          if ((await fingerprintBytes(bytes)) === attempt.song_fingerprint) {
            if (!cancelled) await openShared(attempt, bytes, song.filename, { builtin: true })
            return
          }
        }
        if (!cancelled) setShared({ phase: 'need-file', attempt })
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
    setShared(null)
    setNotation(null)
    onSharedAttemptDone?.()
  }, [onSharedAttemptDone])

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
    if (api && score) applyMix(api, score, { mode, accompaniment, trackIndex: practised?.index ?? 0 })
  }, [api, score, mode, accompaniment, practised])
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
      <div className="guitar-song">
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

  if (!notation) {
    if (browse === 'transcribe') {
      return (
        <div className="guitar-song">
          <div className="guitar-song__toolbar">
            <button type="button" className="guitar-song__back" onClick={() => setBrowse('library')}>
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
        <div className="guitar-song">
          <div className="guitar-song__toolbar">
            <button type="button" className="guitar-song__back" onClick={() => setBrowse('library')}>
              ← Songs
            </button>
            <span className="guitar-song__title">Search songs</span>
          </div>
          <OnlineSongs configured={auth?.configured} supabase={supabase} onSelectSong={openCloud} instrument="guitar" />
          {status === 'loading' && <p className="guitar-song__status">Loading…</p>}
          {status === 'error' && <p className="guitar-song__status guitar-song__status--error">{error}</p>}
        </div>
      )
    }
    return (
      <div className="guitar-song">
        <header className="guitar-song__header">
          <h2>Songs</h2>
          <p>Tab and standard notation, with playback — and the app listens while you play.</p>
        </header>
        {auth?.configured && (
          <button type="button" className="guitar-song__search" onClick={() => setBrowse('search')}>
            <span aria-hidden="true">🔍</span>
            <span>
              <strong>Search songs</strong>
              <small>Browse the online guitar catalog</small>
            </span>
          </button>
        )}
        <button type="button" className="guitar-song__search" onClick={() => setBrowse('transcribe')}>
          <span aria-hidden="true">🎙️</span>
          <span>
            <strong>Tab the guitar from a song</strong>
            <small>Upload an MP3 or WAV: Harmonic isolates its guitar part and tabs it, on this device</small>
          </span>
        </button>
        <SongLibrary songs={BUILT_IN_SONGS} onSelectSong={openBuiltIn} />
        <MyTranscriptions drafts={drafts} onOpen={openDraft} onDelete={removeDraft} />
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
          <span>Upload Guitar Pro, MusicXML or MIDI file</span>
        </label>
        {status === 'loading' && <p className="guitar-song__status">Loading…</p>}
        {status === 'error' && <p className="guitar-song__status guitar-song__status--error">{error}</p>}
      </div>
    )
  }

  const ready = player.ready
  const modes = GUITAR_MODES.map((m) => (m.id !== 'listen' && !entries.length ? { ...m, disabled: true } : m))
  // What a shared attempt needs to name this song without uploading it.
  const shareSong = {
    songId: notation.catalogSongId,
    title: notation.title,
    format: notation.format,
    fingerprint: notation.fingerprint,
    builtin: notation.builtin,
    partId: practised ? String(practised.index) : null,
    partName: practised?.name ?? null,
    withOthers,
  }

  return (
    <div className="guitar-song guitar-song--open guitar-follow">
      <div className="guitar-song__toolbar">
        <button
          type="button"
          className="guitar-song__back"
          onClick={() => (viewingShared ? closeShared() : setNotation(null))}
        >
          {viewingShared ? '← Close' : '← Songs'}
        </button>
        <span className="guitar-song__title">{notation.title}</span>
        <span className={`guitar-song__format ${notation.draft ? 'guitar-song__format--draft' : ''}`}>
          {notation.draft ? 'Draft' : FORMAT_LABEL[notation.format]}
        </span>
        <div className="guitar-song__actions" role="group" aria-label="Export">
          <button type="button" onClick={() => exportGuitarMidi(notation)}>
            Export MIDI
          </button>
          <button type="button" onClick={() => exportGuitarPro(notation)}>
            Export Guitar Pro
          </button>
        </div>
      </div>
      {notation.draft ? (
        <DraftNotice about={notation.draft.about} />
      ) : (
        <TabNotice tab={notation.tab} hasTab={notation.hasTab} />
      )}
      <PartTabs
        parts={tracks.map((t) => ({ id: t.index, name: t.name }))}
        selected={practised?.index}
        onSelect={changeTrack}
      />
      <GuitarScore
        ref={scoreRef}
        score={score}
        songKey={notation.fingerprint}
        trackIndexes={trackIndexes}
        onApi={setApi}
        onSpeedChange={setSpeed}
        controlsDisabled={mode === 'trouble' && player.state === 'playing'}
      />
      {!ready && <p className="guitar-score__status">Loading guitar sound… {Math.round(player.loaded * 100)}%</p>}
      {viewingShared && (
        <GuitarSharedPanel attempt={shared.attempt} entries={entries} overlay={overlay} supabase={supabase} />
      )}
      {!viewingShared && <PracticeModeToggle mode={mode} onChange={changeMode} disabled={!ready} modes={modes} />}
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
      {timeline && !viewingShared && mode === 'wait' && entries.length > 0 ? (
        // Keyed by track and version so switching either starts the mode fresh.
        <GuitarWaitMode key={`${practised.index}-${easy}`} api={api} timeline={scoredTimeline} overlay={overlay} ready={ready} />
      ) : timeline && !viewingShared && mode === 'trouble' && entries.length > 0 ? (
        <>
          <GuitarTroubleMode
            key={`${practised.index}-${easy}`}
            api={api}
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
            speed={speed}
          />
          <SongTransportExtras api={api} disabled={!ready || player.state === 'playing'} />
        </>
      ) : (
        timeline && (
          <>
            <PlaybackControls
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
    </div>
  )
}

export default GuitarSong
