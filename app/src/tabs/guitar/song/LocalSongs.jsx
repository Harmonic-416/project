import { useEffect, useState } from 'react'
import { fileKind, listMyFiles, loadMyFile } from '../../home/myFiles.js'

/** List metadata first; read score bytes only when the player opens a file. */
export default function LocalSongs({ onOpen }) {
  const [files, setFiles] = useState(null)
  const [error, setError] = useState(null)
  const [opening, setOpening] = useState(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let live = true
    listMyFiles().then(
      (rows) => { if (live) setFiles(rows.filter((row) => row.instrument === 'guitar')) },
      () => { if (live) setError('Your saved files could not be read. You can still upload a file below.') },
    )
    return () => { live = false }
  }, [revision])
  const open = async (file) => {
    setOpening(file.id)
    setError(null)
    try {
      const saved = await loadMyFile(file.id)
      if (!saved) throw new Error('This file is no longer on this device. Upload it again below.')
      await onOpen(saved.bytes, saved.name)
    } catch (err) {
      setError(err.message || 'This file could not be opened. Try uploading it again.')
    } finally { setOpening(null) }
  }
  return (
    <section className="guitar-song__local" aria-labelledby="local-songs-title">
      <h3 id="local-songs-title">Your files <span>On this device</span></h3>
      {error && <div role="alert" className="guitar-song__status--error">{error} <button type="button" onClick={() => { setError(null); setRevision((v) => v + 1) }}>Try again</button></div>}
      {!files && !error && <p role="status">Loading your saved files…</p>}
      {files?.length === 0 && <p>Open a Guitar Pro, MusicXML or MIDI file below. Your music stays on this device, ready for next time.</p>}
      {files?.length > 0 && <ul className="song-library">{files.map((file) => (
        <li key={file.id}><button className="song-library__item" type="button" disabled={opening !== null} onClick={() => open(file)}>
          <span className="song-library__icon" aria-hidden="true">♪</span>
          <span>{file.name}<small>{opening === file.id ? 'Opening…' : fileKind(file.name)}</small></span>
        </button></li>
      ))}</ul>}
    </section>
  )
}
