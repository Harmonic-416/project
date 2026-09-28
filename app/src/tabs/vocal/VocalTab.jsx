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
import { loadNotation } from './notation/loadNotation.js'
import { useMidiPlayback } from './playback/useMidiPlayback.js'
import { melodyLine, scheduleFor } from './practice/practiceLogic.js'
import { extractPart, listParts, partOnTop } from './notation/partFilter.js'
import { songLibrary } from './songs/songLibrary.js'
import { fetchCloudNotation, saveNotationToCloud } from './songs/cloudLibrary.js'
import { supabase } from '../../lib/supabaseClient.js'

const FORMAT_LABEL = { midi: 'MIDI', musicxml: 'MusicXML', mxl: 'MXL' }
const NO_SCHEDULE = []
const NO_TIMESTAMPS = []
const OTHER_PART_CLASS = 'practice-note--other-part'

// This tab covers notation (MIDI / MusicXML / MXL) -> sheet music -> synced
// playback, export, and the cloud library (Supabase, via the shared backend
// layer). Recording + live pitch detection are meant to slot in later as
// siblings of notation/ and playback/ (e.g. audio/, pitch/) without touching
// this file's existing wiring.
function VocalTab({ auth, onNavigate }) {
  const [view, setView] = useState('library') // library | search | detail
  // Where the back button goes: a cloud song opens from the search view, a
  // built-in song or an upload from the library view.
  const [returnTo, setReturnTo] = useState('library')
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)
  const [notation, setNotation] = useState(null) // { format, title, content, sourceBytes, cloudSongId, isSeed }
  const [scoreModel, setScoreModel] = useState(null) // derived from the rendered score
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [saveError, setSaveError] = useState(null)
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
    setSaveState('idle')
    setSaveError(null)
  }, [])

  const fail = useCallback((err, fallback) => {
    console.error(err)
    setError(err?.message || fallback)
    setStatus('error')
  }, [])

  const loadFromArrayBuffer = useCallback(
    async (arrayBuffer, filename, { title, cloudSongId = null, isSeed = false } = {}) => {
      beginLoad()
      try {
        const loaded = await loadNotation(arrayBuffer, filename, { title })
        setNotation({ ...loaded, cloudSongId, isSeed })
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
        await loadFromArrayBuffer(await response.arrayBuffer(), song.filename)
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
        await loadFromArrayBuffer(bytes, `${item.title}.musicxml`, {
          title: item.title,
          cloudSongId: item.id,
          isSeed: item.isSeed,
        })
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

  const handleSave = useCallback(async () => {
    if (!notation || !auth.user) return
    setSaveState('saving')
    setSaveError(null)
    try {
      const song = await saveNotationToCloud(supabase, notation)
      setNotation((current) => (current ? { ...current, cloudSongId: song.id, isSeed: false } : current))
      setSaveState('saved')
    } catch (err) {
      console.error(err)
      setSaveError(err.message || 'Could not save to the cloud.')
      setSaveState('error')
    }
  }, [notation, auth.user])

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
            <small>Browse the online catalog and your saved songs</small>
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
        <OnlineSongs
          user={auth.user}
          configured={auth.configured}
          ready={auth.ready}
          supabase={supabase}
          onSelectSong={handleCloudSongSelected}
          onNavigateHome={() => onNavigate('home')}
        />
      </div>
    )
  }

  // Catalog songs can be copied into the user's own library; own songs are
  // already there; local files get saved as new songs.
  const ownedInCloud = Boolean(notation?.cloudSongId) && !notation?.isSeed
  const canSave = Boolean(notation && scoreModel && auth.user && !ownedInCloud && saveState !== 'saving')
  const saveLabel = ownedInCloud
    ? 'In your library'
    : saveState === 'saving'
      ? 'Saving…'
      : notation?.isSeed
        ? 'Add to my library'
        : 'Save to cloud'
  const saveHint = !auth.configured
    ? 'Cloud library not configured'
    : !auth.user
      ? 'Sign in on the Home tab to save'
      : undefined

  return (
    <div className="vocal-tab">
      <div className="vocal-tab__toolbar">
        <button type="button" className="vocal-tab__back" onClick={handleBack}>
          {returnTo === 'search' ? '← Search' : '← Songs'}
        </button>
        <span className="vocal-tab__song-title">{notation?.title}</span>
        {notation && <span className="vocal-tab__format">{FORMAT_LABEL[notation.format]}</span>}
        {notation && (
          <div className="vocal-tab__actions">
            <ExportButtons notation={notation} scoreModel={scoreModel} disabled={!scoreModel} />
            <button
              type="button"
              className={`vocal-tab__save ${ownedInCloud ? 'vocal-tab__save--done' : ''}`}
              disabled={!canSave}
              title={saveHint}
              onClick={handleSave}
            >
              {saveLabel}
            </button>
          </div>
        )}
      </div>

      {status === 'loading' && <p className="vocal-tab__status">Loading…</p>}
      {status === 'error' && <p className="vocal-tab__status vocal-tab__status--error">{error}</p>}
      {saveState === 'error' && <p className="vocal-tab__status vocal-tab__status--error">{saveError}</p>}

      {notation && (
        <>
          <PartTabs parts={parts} selected={selectedPart?.id} onSelect={handlePartChange} />
          <SheetMusicViewer
            ref={sheetMusicRef}
            content={viewerContent}
            onReady={handleSheetReady}
            onError={handleSheetError}
          />
          <PracticeModeToggle mode={practiceMode} onChange={handleModeChange} disabled={!scoreModel} />
          {multiPart && (
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
          {scoreModel && practiceMode === 'listen' && (
            <RecordPanel
              key={selectedPart?.id}
              scoreModel={scoreModel}
              playback={playback}
              sheetMusicRef={sheetMusicRef}
              title={notation.title}
            />
          )}
        </>
      )}
    </div>
  )
}

export default VocalTab
