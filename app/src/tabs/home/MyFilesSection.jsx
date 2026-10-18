import { useEffect, useState } from 'react'
import { deleteMyFile, fileKind, formatSize, listMyFiles, myFilesAvailable } from './myFiles.js'
import { timeAgo } from './homeFormat.js'

const INSTRUMENT = { guitar: 'Guitar', voice: 'Vocal' }

/**
 * Song files you opened in Guitar or Vocal, kept on this device only
 * (myFiles.js): open one again, or remove it from the list.
 */
function MyFilesSection({ onOpenFile }) {
  const [files, setFiles] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    listMyFiles()
      .then((list) => live && setFiles(list))
      .catch((err) => {
        console.error(err)
        if (live) setError('Could not read the files saved on this device.')
      })
    return () => {
      live = false
    }
  }, [])

  if (!myFilesAvailable()) return <p className="home-tab__hint">This browser can’t keep files.</p>
  if (error) return <p className="home-tab__error">{error}</p>
  if (files === null) return <p className="home-tab__hint">Loading…</p>
  if (files.length === 0) {
    return (
      <p className="home-tab__hint">
        Files you upload in Guitar or Vocal (MusicXML, MIDI, Guitar Pro) are listed here. They stay on this device and are
        never uploaded.
      </p>
    )
  }

  const remove = async (file) => {
    if (!window.confirm(`Remove “${file.name}” from this device?`)) return
    await deleteMyFile(file.id)
    setFiles((list) => list.filter((f) => f.id !== file.id))
  }

  return (
    <>
      <ul className="home-files">
        {files.map((file) => (
          <li key={file.id} className="home-files__item">
            <button type="button" className="home-files__open" onClick={() => onOpenFile({ id: file.id, instrument: file.instrument })}>
              <span className="home-files__kind">{fileKind(file.name)}</span>
              <span className="home-files__text">
                <span className="home-files__name">{file.name}</span>
                <small>
                  {INSTRUMENT[file.instrument]} · {formatSize(file.size)} · opened {timeAgo(file.opened)}
                </small>
              </span>
            </button>
            <button
              type="button"
              className="home-link-button home-link-button--small"
              aria-label={`Remove ${file.name}`}
              onClick={() => remove(file)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <p className="home-tab__hint">Kept on this device only.</p>
    </>
  )
}

export default MyFilesSection