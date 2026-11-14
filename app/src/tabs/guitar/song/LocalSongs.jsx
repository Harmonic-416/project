import GuitarFeedback from '../practice/GuitarFeedback.jsx'
import { useEffect, useRef, useState } from 'react'
import { fileKind, listMyFiles, loadMyFile } from '../../home/myFiles.js'

/** List metadata first; read score bytes only when the player opens a file. */
export default function LocalSongs({ onOpen, onBeginOpen }) {
  const [files, setFiles] = useState(null)
  const [error, setError] = useState(null)
  const [opening, setOpening] = useState(null)
  const [revision, setRevision] = useState(0)
  const mounted = useRef(true)
  const busy = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    let live = true
    listMyFiles().then(
      (rows) => { if (live) setFiles(rows.filter((row) => row.instrument === 'guitar')) },
      () => { if (live) setError('Your saved files could not be read. You can still upload a file below.') },
    )
    return () => { live = false }
  }, [revision])
  const open = async (file) => {
    if (busy.current) return
    busy.current = true
    const request = onBeginOpen?.()
    const current = () => mounted.current && (!request || request.isCurrent())
    setOpening(file.id)
    setError(null)
    try {
      const saved = await loadMyFile(file.id)
      if (!current()) return
      if (!saved) throw new Error('This file is no longer on this device. Upload it again below.')
      if (request) await onOpen(saved.bytes, saved.name, { request })
      else await onOpen(saved.bytes, saved.name)
    } catch (err) {
      if (current()) setError(err.message || 'This file could not be opened. Try uploading it again.')
    } finally {
      busy.current = false
      if (mounted.current) setOpening(null)
    }
  }
  return (
    <section className="guitar-song__local" aria-labelledby="local-songs-title">
      <h3 id="local-songs-title">Your files <span>On this device</span></h3>
      {error && <GuitarFeedback kind="error" onRetry={() => { setError(null); setRevision((v) => v + 1) }}>{error}</GuitarFeedback>}
      {!files && !error && <GuitarFeedback>Loading your saved files...</GuitarFeedback>}
      {files?.length === 0 && <GuitarFeedback kind="empty">Your saved scores will appear here. Open a Guitar Pro, MusicXML or MIDI file below to add your first score. Your music stays on this device.</GuitarFeedback>}
      {files?.length > 0 && <ul className="song-library">{files.map((file) => (
        <li key={file.id}><button className="song-library__item" type="button" disabled={opening !== null} onClick={() => open(file)}>
          <span className="song-library__icon" aria-hidden="true">♪</span>
          <span>{file.name}<small>{opening === file.id ? 'Opening…' : fileKind(file.name)}</small></span>
        </button></li>
      ))}</ul>}
    </section>
  )
}
