import { useCallback, useRef, useState } from 'react'
import './VocalTab.css'
import SongLibrary from './components/SongLibrary.jsx'
import NotationUploader from './components/NotationUploader.jsx'
import SheetMusicViewer from './components/SheetMusicViewer.jsx'
import PlaybackControls from './components/PlaybackControls.jsx'
import ExportButtons from './components/ExportButtons.jsx'
import RecordPanel from './components/RecordPanel.jsx'
import { loadNotation } from './notation/loadNotation.js'
import { useMidiPlayback } from './playback/useMidiPlayback.js'
import { songLibrary } from './songs/songLibrary.js'

const FORMAT_LABEL = { midi: 'MIDI', musicxml: 'MusicXML', mxl: 'MXL' }
const NO_SCHEDULE = []
const NO_TIMESTAMPS = []

// This tab covers notation (MIDI / MusicXML / MXL) -> sheet music -> synced
// playback, plus export. Recording + live pitch detection are meant to slot
// in later as siblings of notation/ and playback/ (e.g. audio/, pitch/)
// without touching this file's existing wiring.
function VocalTab() {
  const [view, setView] = useState('library') // library | detail
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)
  const [notation, setNotation] = useState(null) // { format, title, content, sourceBytes }
  const [scoreModel, setScoreModel] = useState(null) // derived from the rendered score
  const sheetMusicRef = useRef(null)

  const beginLoad = useCallback(() => {
    setView('detail')
    setStatus('loading')
    setError(null)
    setNotation(null)
    setScoreModel(null)
  }, [])

  const fail = useCallback((err, fallback) => {
    console.error(err)
    setError(err?.message || fallback)
    setStatus('error')
  }, [])

  const loadFromArrayBuffer = useCallback(
    async (arrayBuffer, filename) => {
      beginLoad()
      try {
        setNotation(await loadNotation(arrayBuffer, filename))
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

  const handleFileSelected = useCallback(
    (file) => {
      file.arrayBuffer().then((buf) => loadFromArrayBuffer(buf, file.name))
    },
    [loadFromArrayBuffer],
  )

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
        <SongLibrary songs={songLibrary} onSelectSong={handleSongSelected} />
        <NotationUploader onFileSelected={handleFileSelected} disabled={false} />
      </div>
    )
  }

  return (
    <div className="vocal-tab">
      <div className="vocal-tab__toolbar">
        <button type="button" className="vocal-tab__back" onClick={handleBack}>
          ← Songs
        </button>
        <span className="vocal-tab__song-title">{notation?.title}</span>
        {notation && <span className="vocal-tab__format">{FORMAT_LABEL[notation.format]}</span>}
        {notation && <ExportButtons notation={notation} scoreModel={scoreModel} disabled={!scoreModel} />}
      </div>

      {status === 'loading' && <p className="vocal-tab__status">Loading…</p>}
      {status === 'error' && <p className="vocal-tab__status vocal-tab__status--error">{error}</p>}

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
          {scoreModel && (
            <RecordPanel scoreModel={scoreModel} playback={playback} sheetMusicRef={sheetMusicRef} title={notation.title} />
          )}
        </>
      )}
    </div>
  )
}

export default VocalTab
