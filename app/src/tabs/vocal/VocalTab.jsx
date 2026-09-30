import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './VocalTab.css'
import SongLibrary from './components/SongLibrary.jsx'
import OnlineSongs from './components/OnlineSongs.jsx'
import NotationUploader from './components/NotationUploader.jsx'
import SheetMusicViewer from './components/SheetMusicViewer.jsx'
import PlaybackControls from './components/PlaybackControls.jsx'
import PracticeModeToggle from './components/PracticeModeToggle.jsx'
import PartTabs from './components/PartTabs.jsx'
import AccompanimentToggle from './components/AccompanimentToggle.jsx'
import WaitModePlayer from './components/WaitModePlayer.jsx'
import TroubleSpotsPlayer from './components/TroubleSpotsPlayer.jsx'
import ExportButtons from './components/ExportButtons.jsx'
import RecordPanel from './components/RecordPanel.jsx'
import SharedAttemptGate from './components/SharedAttemptGate.jsx'
import SharedAttemptPanel from './components/SharedAttemptPanel.jsx'
import { loadNotation } from './notation/loadNotation.js'
import { useMidiPlayback } from './playback/useMidiPlayback.js'
import { melodyLine, scheduleFor } from './practice/practiceLogic.js'
import { extractPart, listParts, partOnTop } from './notation/partFilter.js'
import { songLibrary } from './songs/songLibrary.js'
import { fetchCatalogSong, fetchCloudNotation } from './songs/cloudLibrary.js'
import { fingerprintBytes } from './share/sharedAttempt.js'
import { getSharedAttempt } from '@backend/attempts'
import { supabase } from '../../lib/supabaseClient.js'

const FORMAT_LABEL = { midi: 'MIDI', musicxml: 'MusicXML', mxl: 'MXL' }
const NO_SCHEDULE = []
const NO_TIMESTAMPS = []
const OTHER_PART_CLASS = 'practice-note--other-part'

// This tab covers notation (MIDI / MusicXML / MXL) -> sheet music -> synced
// playback, export, the online catalog (Supabase, via the shared backend
// layer), recording a sung attempt, and shared attempts. Songs are never
// uploaded (copyright): your own files stay on your device, and a shared
// attempt names its song by catalog id or by the file's fingerprint.
//
// `sharedAttemptId` comes from a share link (App.jsx); `onSharedAttemptDone`
// tells App it has been opened or dismissed.
function VocalTab({ auth, onNavigate, sharedAttemptId, onSharedAttemptDone }) {
  const [view, setView] = useState(sharedAttemptId ? 'shared' : 'library') // library | search | shared | detail
  // Where the back button goes: a cloud song opens from the search view, a
  // built-in song or an upload from the library view.
  const [returnTo, setReturnTo] = useState('library')
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)
  const [notation, setNotation] = useState(null) // { format, title, content, sourceBytes, fingerprint, catalogSongId, builtin }
  const [scoreModel, setScoreModel] = useState(null) // derived from the rendered score
  // A shared attempt being opened: { phase, attempt, error, pendingFile }, where
  // phase is signin | loading | need-file | mismatch | error | open.
  const [shared, setShared] = useState(null)
  const [practiceMode, setPracticeMode] = useState('listen') // listen | wait | trouble (see practice/practiceLogic.js)
  const [practicePart, setPracticePart] = useState(undefined) // part id; undefined = the first part
  const [accompaniment, setAccompaniment] = useState('solo') // solo | all (see practice/practiceLogic.js)
  const sheetMusicRef = useRef(null)

  const beginLoad = useCallback(() => {
    setView('detail')
    setStatus('loading')
    setError(null)
    setNotation(null)
    setScoreModel(null)
    setPracticePart(undefined)
  }, [])

  const fail = useCallback((err, fallback) => {
    console.error(err)
    setError(err?.message || fallback)
    setStatus('error')
  }, [])

  // `part` preselects a part and accompaniment (opening a shared attempt);
  // `builtin` marks a song that ships with the app.
  const loadFromArrayBuffer = useCallback(
    async (arrayBuffer, filename, { title, catalogSongId = null, builtin = false, part = null } = {}) => {
      beginLoad()
      try {
        const [loaded, fingerprint] = await Promise.all([
          loadNotation(arrayBuffer, filename, { title }),
          fingerprintBytes(arrayBuffer),
        ])
        if (part) {
          setPracticePart(part.id ?? undefined)
          setAccompaniment(part.withOthers ? 'all' : 'solo')
          setPracticeMode('listen')
        }
        setNotation({ ...loaded, fingerprint, catalogSongId, builtin })
        setStatus('ready')
      } catch (err) {
        fail(err, 'Could not read that file.')
      }
    },
    [beginLoad, fail],
  )

  const handleSongSelected = useCallback(
    async (song) => {
      setReturnTo('library')
      beginLoad()
      try {
        const response = await fetch(song.url)
        if (!response.ok) throw new Error(`Could not load that song (HTTP ${response.status}).`)
        await loadFromArrayBuffer(await response.arrayBuffer(), song.filename, { builtin: true })
      } catch (err) {
        fail(err, 'Could not load that song.')
      }
    },
    [beginLoad, fail, loadFromArrayBuffer],
  )

  const handleCloudSongSelected = useCallback(
    async (item) => {
      setReturnTo('search')
      beginLoad()
      try {
        const bytes = await fetchCloudNotation(supabase, item.song)
        await loadFromArrayBuffer(bytes, `${item.title}.musicxml`, { title: item.title, catalogSongId: item.id })
      } catch (err) {
        fail(err, 'Could not load that song from the cloud.')
      }
    },
    [beginLoad, fail, loadFromArrayBuffer],
  )

  const handleFileSelected = useCallback(
    (file) => {
      setReturnTo('library')
      file.arrayBuffer().then((buf) => loadFromArrayBuffer(buf, file.name))
    },
    [loadFromArrayBuffer],
  )

  // ── Shared attempts ────────────────────────────────────────────────────
  const openShared = useCallback(
    async (attempt, bytes, filename, { title, builtin = false } = {}) => {
      setShared({ phase: 'open', attempt })
      setReturnTo('library')
      await loadFromArrayBuffer(bytes, filename, {
        title,
        builtin,
        catalogSongId: attempt.song_id,
        part: { id: attempt.part_id, withOthers: attempt.with_others },
      })
      onSharedAttemptDone?.()
    },
    [loadFromArrayBuffer, onSharedAttemptDone],
  )

  // Follow a share link once someone is signed in. Before that, the gate
  // shows a phase derived from auth (see sharedGate below).
  const userId = auth.user?.id ?? null
  useEffect(() => {
    if (!sharedAttemptId || !userId || !supabase) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const attempt = await getSharedAttempt(supabase, sharedAttemptId)
        if (cancelled) return
        if (!attempt) throw new Error('This shared attempt doesn’t exist anymore.')
        if (attempt.song_id) {
          const song = await fetchCatalogSong(supabase, attempt.song_id)
          if (!song) throw new Error('The catalog song for this attempt is no longer available.')
          const bytes = await fetchCloudNotation(supabase, song)
          if (!cancelled) await openShared(attempt, bytes, `${song.title}.musicxml`, { title: song.title })
          return
        }
        // A built-in song both people have: find it by fingerprint.
        for (const song of songLibrary) {
          const response = await fetch(song.url)
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
      if ((await fingerprintBytes(bytes)) === attempt.song_fingerprint) {
        await openShared(attempt, bytes, file.name)
      } else {
        setShared({ phase: 'mismatch', attempt, pendingFile: { bytes, name: file.name } })
      }
    },
    [openShared, shared],
  )

  const handleSharedOpenAnyway = useCallback(() => {
    if (shared?.pendingFile) openShared(shared.attempt, shared.pendingFile.bytes, shared.pendingFile.name)
  }, [openShared, shared])

  const closeShared = useCallback(() => {
    setShared(null)
    onSharedAttemptDone?.()
    setView('library')
    setStatus('idle')
    setError(null)
    setNotation(null)
    setScoreModel(null)
  }, [onSharedAttemptDone])

  const handleSheetReady = useCallback((model) => {
    setScoreModel(model)
    if (import.meta.env.DEV) window.__harmonic = { ...(window.__harmonic ?? {}), scoreModel: model }
  }, [])

  const handleSheetError = useCallback((err) => fail(err, 'Could not render that score.'), [fail])

  // With several parts the viewer gets a rearranged copy of the score: the
  // selected part alone (by myself), or every part with the selected one on
  // top (with all parts). Either way the practised part is the rendered
  // score's part 0, which is what melodyLine and RecordPanel follow.
  const parts = useMemo(() => (notation ? listParts(notation.content) : []), [notation])
  const multiPart = parts.length > 1
  const selectedPart = multiPart ? (parts.find((p) => p.id === practicePart) ?? parts[0]) : null
  const withOthers = multiPart && accompaniment === 'all'
  const viewerContent = useMemo(() => {
    if (!notation || !selectedPart) return notation?.content
    try {
      return withOthers ? partOnTop(notation.content, selectedPart.id) : extractPart(notation.content, selectedPart.id)
    } catch (err) {
      console.error(err)
      return notation.content
    }
  }, [notation, selectedPart, withOthers])

  const otherPartNotes = useMemo(
    () => (withOthers && scoreModel ? scoreModel.notes.filter((n) => n.partIndex !== 0) : null),
    [withOthers, scoreModel],
  )

  // What Play sounds like: every part on screen, except in Trouble spots
  // with all parts, where your part is left for you to sing. (Wait for me
  // doesn't use playback; it holds the other parts' chords itself.)
  const playbackSchedule = useMemo(() => {
    if (!scoreModel) return NO_SCHEDULE
    if (otherPartNotes && practiceMode === 'trouble') return scheduleFor(otherPartNotes)
    return scoreModel.playbackSchedule
  }, [scoreModel, otherPartNotes, practiceMode])

  const playback = useMidiPlayback({
    playbackSchedule,
    cursorTimestamps: scoreModel?.cursorTimestamps ?? NO_TIMESTAMPS,
    sheetMusicRef,
    minDuration: scoreModel?.duration ?? 0,
  })

  const melody = useMemo(() => (scoreModel ? melodyLine(scoreModel.notes) : []), [scoreModel])

  // With all parts on screen, fade every note but the selected part's.
  useEffect(() => {
    const viewer = sheetMusicRef.current
    if (!viewer || !otherPartNotes) return undefined
    scoreModel.notes.forEach((note, i) => {
      if (note.partIndex !== 0) viewer.markNote(i, OTHER_PART_CLASS)
    })
    return () => viewer.clearMarks(OTHER_PART_CLASS)
  }, [scoreModel, otherPartNotes])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__harmonic = { ...(window.__harmonic ?? {}), playbackSchedule, otherPartNotes }
  }, [playbackSchedule, otherPartNotes])

  const handlePartChange = useCallback(
    (partId) => {
      if (partId === selectedPart?.id) return
      playback.stop()
      setScoreModel(null) // until the viewer has rendered the new selection
      setPracticePart(partId)
    },
    [playback, selectedPart],
  )

  const handleAccompanimentChange = useCallback(
    (value) => {
      if (value === accompaniment) return
      playback.stop()
      if (multiPart) setScoreModel(null) // the viewer re-renders with or without the other parts
      setAccompaniment(value)
    },
    [accompaniment, multiPart, playback],
  )

  const handleModeChange = useCallback(
    (mode) => {
      playback.stop()
      setPracticeMode(mode)
    },
    [playback],
  )

  const handleBack = useCallback(() => {
    playback.stop()
    setShared(null)
    setView(returnTo)
    setStatus('idle')
    setError(null)
    setNotation(null)
    setScoreModel(null)
  }, [playback, returnTo])

  if (view === 'library') {
    return (
      <div className="vocal-tab">
        <header className="vocal-tab__header">
          <h1>Vocal</h1>
          <p>Choose a song, or upload your own MIDI or MusicXML file.</p>
        </header>

        <button type="button" className="vocal-tab__search-songs" onClick={() => setView('search')}>
          <span className="vocal-tab__search-icon" aria-hidden="true">🔍</span>
          <span>
            <strong>Search songs</strong>
            <small>Browse the online song catalog</small>
          </span>
        </button>

        <h2 className="vocal-tab__section-title">Built-in songs</h2>
        <SongLibrary songs={songLibrary} onSelectSong={handleSongSelected} />
        <NotationUploader onFileSelected={handleFileSelected} disabled={false} />
      </div>
    )
  }

  if (view === 'search') {
    return (
      <div className="vocal-tab">
        <div className="vocal-tab__toolbar">
          <button type="button" className="vocal-tab__back" onClick={() => setView('library')}>
            ← Songs
          </button>
          <span className="vocal-tab__song-title">Search songs</span>
        </div>
        <OnlineSongs configured={auth.configured} supabase={supabase} onSelectSong={handleCloudSongSelected} />
      </div>
    )
  }

  const sharedGate =
    shared ??
    (!auth.ready
      ? { phase: 'loading' }
      : !auth.configured
        ? { phase: 'error', error: 'Shared attempts need the cloud, which isn’t configured on this copy of the app.' }
        : !auth.user
          ? { phase: 'signin' }
          : { phase: 'loading' })

  if (view === 'shared') {
    return (
      <div className="vocal-tab">
        <SharedAttemptGate
          shared={sharedGate}
          onNavigateHome={() => onNavigate('home')}
          onFileSelected={handleSharedFile}
          onOpenAnyway={handleSharedOpenAnyway}
          onClose={closeShared}
        />
      </div>
    )
  }

  const viewingShared = shared?.phase === 'open'
  // What a shared attempt needs to name this song without uploading it.
  const shareSong = notation && {
    songId: notation.catalogSongId,
    title: notation.title,
    format: notation.format,
    fingerprint: notation.fingerprint,
    builtin: notation.builtin,
    partId: selectedPart?.id ?? null,
    partName: selectedPart?.name ?? scoreModel?.partNames?.[0] ?? null,
    withOthers,
  }

  return (
    <div className="vocal-tab">
      <div className="vocal-tab__toolbar">
        <button type="button" className="vocal-tab__back" onClick={viewingShared ? closeShared : handleBack}>
          {viewingShared ? '← Close' : returnTo === 'search' ? '← Search' : '← Songs'}
        </button>
        <span className="vocal-tab__song-title">{notation?.title}</span>
        {notation && <span className="vocal-tab__format">{FORMAT_LABEL[notation.format]}</span>}
        {notation && (
          <div className="vocal-tab__actions">
            <ExportButtons notation={notation} scoreModel={scoreModel} disabled={!scoreModel} />
          </div>
        )}
      </div>

      {status === 'loading' && <p className="vocal-tab__status">Loading…</p>}
      {status === 'error' && <p className="vocal-tab__status vocal-tab__status--error">{error}</p>}

      {notation && (
        <>
          <PartTabs parts={parts} selected={selectedPart?.id} onSelect={handlePartChange} />
          <SheetMusicViewer
            ref={sheetMusicRef}
            content={viewerContent}
            onReady={handleSheetReady}
            onError={handleSheetError}
          />
          {!viewingShared && (
            <PracticeModeToggle mode={practiceMode} onChange={handleModeChange} disabled={!scoreModel} />
          )}
          {multiPart && !viewingShared && (
            <AccompanimentToggle
              value={accompaniment}
              mode={practiceMode}
              onChange={handleAccompanimentChange}
              disabled={!scoreModel}
            />
          )}
          {scoreModel && practiceMode === 'wait' ? (
            // Keyed by part so switching parts starts the mode fresh on the new line.
            <WaitModePlayer
              key={selectedPart?.id}
              melody={melody}
              duration={playback.duration}
              sheetMusicRef={sheetMusicRef}
              backingNotes={withOthers ? otherPartNotes : null}
            />
          ) : scoreModel && practiceMode === 'trouble' ? (
            <TroubleSpotsPlayer key={selectedPart?.id} melody={melody} playback={playback} sheetMusicRef={sheetMusicRef} />
          ) : (
            <PlaybackControls
              state={playback.state}
              position={playback.position}
              duration={playback.duration}
              onPlay={playback.play}
              onPause={playback.pause}
              onStop={playback.stop}
              onSeek={playback.seek}
              disabled={!scoreModel}
            />
          )}
          {scoreModel && viewingShared && (
            <SharedAttemptPanel
              attempt={shared.attempt}
              scoreModel={scoreModel}
              sheetMusicRef={sheetMusicRef}
              supabase={supabase}
            />
          )}
          {scoreModel && practiceMode === 'listen' && !viewingShared && (
            <RecordPanel
              key={selectedPart?.id}
              scoreModel={scoreModel}
              playback={playback}
              sheetMusicRef={sheetMusicRef}
              title={notation.title}
              auth={auth}
              supabase={supabase}
              shareSong={shareSong}
            />
          )}
        </>
      )}
    </div>
  )
}

export default VocalTab
