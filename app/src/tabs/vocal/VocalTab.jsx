import { useCallback, useRef, useState } from 'react'
import './VocalTab.css'
import SongLibrary from './components/SongLibrary.jsx'
import CloudLibrary from './components/CloudLibrary.jsx'
import NotationUploader from './components/NotationUploader.jsx'
import SheetMusicViewer from './components/SheetMusicViewer.jsx'
import PlaybackControls from './components/PlaybackControls.jsx'
import ExportButtons from './components/ExportButtons.jsx'
import { loadNotation } from './notation/loadNotation.js'
import { useMidiPlayback } from './playback/useMidiPlayback.js'
import { songLibrary } from './songs/songLibrary.js'
import { fetchCloudNotation, saveNotationToCloud } from './songs/cloudLibrary.js'
import { useSession } from '../../auth/useSession.js'
import { supabase } from '../../lib/supabaseClient.js'

const FORMAT_LABEL = { midi: 'MIDI', musicxml: 'MusicXML', mxl: 'MXL' }
const NO_SCHEDULE = []
const NO_TIMESTAMPS = []

// This tab covers notation (MIDI / MusicXML / MXL) -> sheet music -> synced
// playback, export, and the cloud library (Supabase, via the shared backend
// layer). Recording + live pitch detection are meant to slot in later as
// siblings of notation/ and playback/ (e.g. audio/, pitch/) without touching
// this file's existing wiring.
function VocalTab() {
  const auth = useSession()
  const [view, setView] = useState('library') // library | detail
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)
  const [notation, setNotation] = useState(null) // { format, title, content, sourceBytes, cloudSongId, isSeed }
  const [scoreModel, setScoreModel] = useState(null) // derived from the rendered score
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [saveError, setSaveError] = useState(null)
  const sheetMusicRef = useRef(null)

  const beginLoad = useCallback(() => {
    setView('detail')
    setStatus('loading')
    setError(null)
    setNotation(null)
    setScoreModel(null)
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

  const playback = useMidiPlayback({
    playbackSchedule: scoreModel?.playbackSchedule ?? NO_SCHEDULE,
    cursorTimestamps: scoreModel?.cursorTimestamps ?? NO_TIMESTAMPS,
    sheetMusicRef,
  })

  const handleBack = useCallback(() => {
    playback.stop()
    setView('library')
    setStatus('idle')
    setError(null)
    setNotation(null)
    setScoreModel(null)
  }, [playback])

  if (view === 'library') {
    return (
      <div className="vocal-tab">
        <header className="vocal-tab__header">
          <h1>Vocal</h1>
          <p>Choose a song, or upload your own MIDI or MusicXML file.</p>
        </header>
        <h2 className="vocal-tab__section-title">Built-in songs</h2>
        <SongLibrary songs={songLibrary} onSelectSong={handleSongSelected} />
        <NotationUploader onFileSelected={handleFileSelected} disabled={false} />
        <CloudLibrary auth={auth} supabase={supabase} onSelectSong={handleCloudSongSelected} />
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
      ? 'Sign in (on the Songs page) to save'
      : undefined

  return (
    <div className="vocal-tab">
      <div className="vocal-tab__toolbar">
        <button type="button" className="vocal-tab__back" onClick={handleBack}>
          ← Songs
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
          <SheetMusicViewer
            ref={sheetMusicRef}
            content={notation.content}
            onReady={handleSheetReady}
            onError={handleSheetError}
          />
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
        </>
      )}
    </div>
  )
}

export default VocalTab
