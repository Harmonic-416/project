import { useCallback, useState } from 'react'
import SongLibrary from '../../vocal/components/SongLibrary.jsx'
import '../../vocal/components/NotationUploader.css'
import { exportGuitarMidi, exportGuitarPro } from '../notation/exportGuitarNotation.js'
import { GUITAR_NOTATION_ACCEPT, loadGuitarNotation } from '../notation/loadGuitarNotation.js'
import GuitarScore from './GuitarScore.jsx'
import './GuitarSong.css'

// Built-in guitar songs in public/guitar-songs/ (string/fret data, so they show tab).
const BUILT_IN_SONGS = [{ id: 'house-of-the-rising-sun.musicxml', title: 'House of the Rising Sun' }]

const FORMAT_LABEL = {
  'guitar-pro': 'Guitar Pro',
  alphatex: 'alphaTex',
  musicxml: 'MusicXML',
  mxl: 'MXL',
  midi: 'MIDI',
}

/**
 * Guitar songs: pick a built-in song or upload Guitar Pro / alphaTex /
 * MusicXML / MXL / MIDI, see it as tab + notation, play it, and export it
 * as MIDI or Guitar Pro. Lazy-loaded by GuitarTab because alphaTab is large.
 */
function GuitarSong() {
  const [notation, setNotation] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)

  const open = useCallback(async (arrayBuffer, filename, options) => {
    setStatus('loading')
    setError(null)
    try {
      setNotation(await loadGuitarNotation(arrayBuffer, filename, options))
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
        const response = await fetch(`${import.meta.env.BASE_URL}guitar-songs/${song.id}`)
        if (!response.ok) throw new Error(`Could not load ${song.title} (HTTP ${response.status}).`)
        await open(await response.arrayBuffer(), song.id, { title: song.title })
      } catch (err) {
        setError(err.message)
        setStatus('error')
      }
    },
    [open],
  )

  const openUpload = useCallback(async (file) => open(await file.arrayBuffer(), file.name), [open])

  if (!notation) {
    return (
      <div className="guitar-song">
        <header className="guitar-song__header">
          <h2>Songs</h2>
          <p>Tab and standard notation, with playback.</p>
        </header>
        <SongLibrary songs={BUILT_IN_SONGS} onSelectSong={openBuiltIn} />
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

  return (
    <div className="guitar-song guitar-song--open">
      <div className="guitar-song__toolbar">
        <button type="button" className="guitar-song__back" onClick={() => setNotation(null)}>
          ← Songs
        </button>
        <span className="guitar-song__title">{notation.title}</span>
        <span className="guitar-song__format">{FORMAT_LABEL[notation.format]}</span>
        <div className="guitar-song__actions" role="group" aria-label="Export">
          <button type="button" onClick={() => exportGuitarMidi(notation)}>
            Export MIDI
          </button>
          <button type="button" onClick={() => exportGuitarPro(notation)}>
            Export Guitar Pro
          </button>
        </div>
      </div>
      {!notation.hasTab && (
        <p className="guitar-song__notice">
          This file has no string/fret data, so it shows standard notation only. Automatic tab for MIDI files is coming.
        </p>
      )}
      <GuitarScore score={notation.score} />
    </div>
  )
}

export default GuitarSong
