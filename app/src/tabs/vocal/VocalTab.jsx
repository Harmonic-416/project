import { useCallback, useRef, useState } from 'react'
import './VocalTab.css'
import SongLibrary from './components/SongLibrary.jsx'
import MidiUploader from './components/MidiUploader.jsx'
import SheetMusicViewer from './components/SheetMusicViewer.jsx'
import PlaybackControls from './components/PlaybackControls.jsx'
import { parseMidiFile } from './midi/parseMidi.js'
import { midiToMusicXml } from './midi/midiToMusicXml.js'
import { useMidiPlayback } from './playback/useMidiPlayback.js'
import { songLibrary } from './songs/songLibrary.js'

// This tab currently only covers MIDI -> sheet music -> synced playback.
// Recording + live pitch detection are meant to slot in later as siblings
// of midi/ and playback/ (e.g. audio/, pitch/) without touching this file's
// existing wiring.
function VocalTab() {
  const [view, setView] = useState('library') // library | detail
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)
  const [songTitle, setSongTitle] = useState(null)
  const [musicXml, setMusicXml] = useState(null)
  const [playbackData, setPlaybackData] = useState(null)
  const [sheetReady, setSheetReady] = useState(false)
  const sheetMusicRef = useRef(null)

  const loadFromArrayBuffer = useCallback(async (arrayBuffer, title) => {
    setStatus('loading')
    setError(null)
    setSheetReady(false)
    setMusicXml(null)
    setPlaybackData(null)
    setSongTitle(title)
    try {
      const midi = await parseMidiFile(arrayBuffer)
      const { musicXml: xml, playbackSchedule, cursorTimestamps } = midiToMusicXml(midi)
      setMusicXml(xml)
      setPlaybackData({ playbackSchedule, cursorTimestamps })
      setStatus('ready')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not read that MIDI file.')
      setStatus('error')
    }
  }, [])

  const handleSongSelected = useCallback(
    async (song) => {
      setView('detail')
      setStatus('loading')
      setSongTitle(song.title)
      try {
        const response = await fetch(song.url)
        const arrayBuffer = await response.arrayBuffer()
        await loadFromArrayBuffer(arrayBuffer, song.title)
      } catch (err) {
        console.error(err)
        setError('Could not load that song.')
        setStatus('error')
      }
    },
    [loadFromArrayBuffer],
  )

  const handleFileSelected = useCallback(
    (file) => {
      setView('detail')
      file.arrayBuffer().then((buf) => loadFromArrayBuffer(buf, file.name))
    },
    [loadFromArrayBuffer],
  )

  const handleSheetReady = useCallback(() => setSheetReady(true), [])

  const playback = useMidiPlayback({
    playbackSchedule: playbackData?.playbackSchedule ?? [],
    cursorTimestamps: playbackData?.cursorTimestamps ?? [],
    sheetMusicRef,
  })

  const handleBack = useCallback(() => {
    playback.stop()
    setView('library')
    setStatus('idle')
    setError(null)
    setSongTitle(null)
    setMusicXml(null)
    setPlaybackData(null)
    setSheetReady(false)
  }, [playback])

  if (view === 'library') {
    return (
      <div className="vocal-tab">
        <header className="vocal-tab__header">
          <h1>Vocal</h1>
          <p>Choose a song, or upload your own MIDI file.</p>
        </header>
        <SongLibrary songs={songLibrary} onSelectSong={handleSongSelected} />
        <MidiUploader onFileSelected={handleFileSelected} disabled={false} />
      </div>
    )
  }

  return (
    <div className="vocal-tab">
      <div className="vocal-tab__toolbar">
        <button type="button" className="vocal-tab__back" onClick={handleBack}>
          ← Songs
        </button>
        <span className="vocal-tab__song-title">{songTitle}</span>
      </div>

      {status === 'loading' && <p className="vocal-tab__status">Loading…</p>}
      {status === 'error' && <p className="vocal-tab__status vocal-tab__status--error">{error}</p>}

      {musicXml && (
        <>
          <SheetMusicViewer ref={sheetMusicRef} musicXml={musicXml} onReady={handleSheetReady} />
          <PlaybackControls
            state={playback.state}
            position={playback.position}
            duration={playback.duration}
            onPlay={playback.play}
            onPause={playback.pause}
            onStop={playback.stop}
            onSeek={playback.seek}
            disabled={!sheetReady}
          />
        </>
      )}
    </div>
  )
}

export default VocalTab
