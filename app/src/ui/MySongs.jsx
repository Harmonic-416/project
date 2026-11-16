import { useEffect, useMemo, useRef, useState } from 'react'
import '../tabs/vocal/components/SongLibrary.css'
import './MySongs.css'
import { hueFor } from '../tabs/vocal/components/songHue.js'
import { supabase } from '../lib/supabaseClient.js'
import { fileKind, loadMyFile, myFilesAvailable } from '../tabs/home/myFiles.js'
import { fetchAccountFile, removalScope, removeListedFile, useMyFiles } from '../tabs/home/useMyFiles.js'

const stripExtension = (name) => name.replace(/\.[^.]+$/, '')

const plainNote = ({ kind = 'loading', children, onRetry, retryLabel = 'Try again' }) => (
  <p className={`my-songs__note my-songs__note--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    {children}
    {onRetry && (
      <>
        {' '}
        <button type="button" className="my-songs__retry" onClick={onRetry}>
          {retryLabel}
        </button>
      </>
    )}
  </p>
)

/**
 * "My songs" on an instrument's Songs page: the song files this person has
 * opened for that instrument, as cards like the built-in ones
 * (SongLibrary), each opening on a tap and removable. The same list Home's
 * My Files shows (home/useMyFiles.js): the files on this device and, signed
 * in, the ones kept on the account, which are fetched when tapped. A song
 * that came with a friend's take (home/songSharing.js) is here too.
 *
 * One component for both instruments (they differ only in what they pass):
 *   instrument    'voice' | 'guitar': whose files to list
 *   userId        the signed-in user's id, or null
 *   version       useMyFilesSync's counter: read the lists again when it moves
 *   onOpen(file, request)  open { id, name, instrument, bytes }
 *   onBeginOpen() optional: a request handle ({ isCurrent() }) taken before a
 *                 file is read, so a slow one doesn't open over a later choice
 *   renderMeta(song)  optional facts under the title, for a file on this
 *                 device (Vocal passes SongCardMeta); `song.load()` gives its bytes
 *   renderNote    how waiting / empty / error lines look (Guitar passes GuitarFeedback)
 *   emptyText     the one line shown with no songs yet
 */
function MySongs({
  instrument,
  userId = null,
  version = 0,
  onOpen,
  onBeginOpen = null,
  renderMeta = null,
  renderNote = plainNote,
  titleOf = stripExtension,
  icon = '🎵',
  emptyText,
}) {
  const { files, error, update, reload } = useMyFiles(userId, version)
  const [busy, setBusy] = useState(null) // { id, what: 'opening' | 'fetching' }
  const [problem, setProblem] = useState(null)
  const working = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const signedIn = Boolean(userId && supabase)

  // Only what can open from here: on this device, or kept on the account.
  // (A file another device has but hasn't sent yet is on Home's list, which can ask for this device's copy.)
  const songs = useMemo(
    () =>
      (files ?? [])
        .filter((file) => file.instrument === instrument && (file.local || file.stored))
        .map((file) => ({
          file,
          song: {
            id: file.id,
            title: titleOf(file.name),
            filename: file.name,
            load: () => loadMyFile(file.id).then((saved) => saved?.bytes ?? null),
          },
        })),
    [files, instrument, titleOf],
  )

  if (!myFilesAvailable()) return renderNote({ kind: 'empty', children: 'This browser can’t keep song files, so open yours each time.' })
  if (error) return renderNote({ kind: 'error', children: error, onRetry: reload })
  if (files === null) return renderNote({ kind: 'loading', children: 'Loading your songs…' })
  if (songs.length === 0) return renderNote({ kind: 'empty', children: emptyText })

  const open = async (file) => {
    if (working.current) return
    working.current = true
    const request = onBeginOpen?.()
    const current = () => mounted.current && (!request || request.isCurrent())
    setProblem(null)
    setBusy({ id: file.id, what: file.local ? 'opening' : 'fetching' })
    try {
      let bytes
      let name = file.name
      if (file.local) {
        const saved = await loadMyFile(file.id)
        if (!saved) throw new Error('This file is no longer on this device. Open the original file again.')
        bytes = saved.bytes
        name = saved.name
      } else {
        bytes = await fetchAccountFile(file).catch((err) => {
          console.error(err)
          throw new Error('Could not fetch it from your account. Check your connection and try again.')
        })
      }
      if (!current()) return
      await onOpen({ id: file.id, name, instrument: file.instrument, bytes }, request)
    } catch (err) {
      if (current()) setProblem({ id: file.id, text: err.message || 'This file could not be opened. Try uploading it again.' })
    } finally {
      working.current = false
      if (mounted.current) setBusy(null)
    }
  }

  const remove = async (file) => {
    if (!window.confirm(`Remove “${file.name}” from ${removalScope(file, signedIn)}?`)) return
    try {
      await removeListedFile(file)
      update((list) => list.filter((f) => f.id !== file.id))
    } catch (err) {
      console.error(err)
      setProblem({ id: file.id, text: 'Could not remove it.' })
    }
  }

  const where = (file) => {
    if (busy?.id === file.id) return busy.what === 'fetching' ? 'Fetching from your account…' : 'Opening…'
    return file.local ? fileKind(file.name) : `${fileKind(file.name)} · on your account`
  }

  return (
    <>
      <ul className="song-library song-library--covers my-songs">
        {songs.map(({ file, song }) => (
          <li key={file.id} className="my-songs__row">
            <button
              type="button"
              className="song-library__item"
              style={{ '--hue': hueFor(song.title) }}
              disabled={busy !== null}
              onClick={() => open(file)}
            >
              <span className="song-library__icon" aria-hidden="true">
                {icon}
              </span>
              <span className="song-library__body">
                <span className="song-library__title">{song.title}</span>
                {renderMeta && file.local && renderMeta(song)}
                <small className="my-songs__where">{where(file)}</small>
              </span>
            </button>
            <button type="button" className="my-songs__remove" aria-label={`Remove ${file.name}`} disabled={busy !== null} onClick={() => remove(file)}>
              Remove
            </button>
            {problem?.id === file.id && (
              <p className="my-songs__problem" role="alert">
                {problem.text}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="my-songs__kept">
        {signedIn
          ? 'Kept on your account, private to you. A friend gets a song only with a take you send them.'
          : 'Kept on this device. Sign in on Home to keep them on your account.'}
      </p>
    </>
  )
}

export default MySongs
