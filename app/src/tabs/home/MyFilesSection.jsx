import { useEffect, useRef, useState } from 'react'
import { deleteMyFileRecord, fetchMyFile, listMyFileRecords, mergeMyFiles, myFileStorageUsed } from '@backend/myFiles'
import { supabase } from '../../lib/supabaseClient.js'
import { GUITAR_NOTATION_ACCEPT } from '../guitar/notation/formats.js'
import { NOTATION_ACCEPT } from '../vocal/notation/loadNotation.js'
import { fingerprintBytes } from '../vocal/share/sharedAttempt.js'
import { deleteMyFile, fileKind, formatSize, listMyFiles, myFilesAvailable, rememberMyFile } from './myFiles.js'
import { timeAgo } from './homeFormat.js'
import { FileIcon, NoteIcon } from './homeIcons.jsx'
import { GuitarIcon } from '../../nav/TabIcons.jsx'

const INSTRUMENT = { guitar: 'Guitar', voice: 'Vocal' }
const ACCEPT = { guitar: GUITAR_NOTATION_ACCEPT, voice: NOTATION_ACCEPT }

/**
 * The files on this device (myFiles.js) and, signed in, the ones kept on the
 * account (src/lib/myFiles.ts) as one list, newest opened first, with how
 * much room the account has left. `version` (useMyFilesSync) goes up when
 * either list changed elsewhere, so they are read again.
 */
function useMyFiles(userId, version) {
  const [state, setState] = useState({ files: null, error: null, usage: null })
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let live = true
    // The account's list is extra: if it can't be read, the device's files still show.
    const remote =
      userId && supabase
        ? listMyFileRecords(supabase).catch((err) => {
            console.error(err)
            return []
          })
        : Promise.resolve(null)
    const usage = userId && supabase ? myFileStorageUsed(supabase).catch(() => null) : Promise.resolve(null)
    Promise.all([listMyFiles(), remote, usage]).then(
      ([local, records, used]) => live && setState({ files: mergeMyFiles(local, records), error: null, usage: used }),
      (err) => {
        console.error(err)
        if (live) setState({ files: null, error: 'Could not read the files saved on this device.', usage: null })
      },
    )
    return () => {
      live = false
    }
  }, [userId, version, reloads])

  return {
    ...state,
    reload: () => setReloads((n) => n + 1),
    update: (change) => setState((s) => ({ ...s, files: s.files ? change(s.files) : s.files })),
  }
}

/**
 * Song files you opened in Guitar or Vocal: open one again, or remove it.
 * Each is kept on this device (myFiles.js) and, signed in, on the account
 * (useMyFilesSync sends it): a file only on the account is fetched when
 * tapped. One the account doesn't have (another device hasn't sent it yet)
 * asks for this device's copy of the same file, checked by fingerprint.
 */
function MyFilesSection({ onOpenFile, userId = null, version = 0 }) {
  const { files, error, usage, update } = useMyFiles(userId, version)
  const [fetching, setFetching] = useState(null) // id of a file being fetched from the account
  const picker = useRef(null)
  const [picking, setPicking] = useState(null) // the listed file a copy is being chosen for
  const [notice, setNotice] = useState(null) // { id, name } of a chosen file that wasn't the same
  const signedIn = Boolean(userId && supabase)

  if (!myFilesAvailable()) return <p className="home-tab__hint">This browser can’t keep files.</p>
  if (error) return <p className="home-tab__error">{error}</p>
  if (files === null) return <p className="home-tab__hint">Loading…</p>
  if (files.length === 0) {
    return (
      <p className="home-tab__hint">
        Files you upload in Guitar or Vocal (MusicXML, MIDI, Guitar Pro) are listed here.{' '}
        {signedIn ? 'They are kept on your account, private to you.' : 'Sign in to keep them on your account.'}
      </p>
    )
  }

  const remove = async (file) => {
    const where = file.local ? (signedIn ? 'this device and your account' : 'this device') : 'your account'
    if (!window.confirm(`Remove “${file.name}” from ${where}?`)) return
    try {
      // A device file's removal reaches the account through useMyFilesSync.
      if (file.local) await deleteMyFile(file.id)
      else await deleteMyFileRecord(supabase, file.id)
      update((list) => list.filter((f) => f.id !== file.id))
    } catch (err) {
      console.error(err)
      setNotice({ id: file.id, text: 'Could not remove it.' })
    }
  }

  // Kept on the account: fetch it, keep it here, open it.
  const fetchFromAccount = async (file) => {
    setNotice(null)
    setFetching(file.id)
    try {
      const bytes = await fetchMyFile(supabase, file.id)
      if ((await fingerprintBytes(bytes)) !== file.id) throw new Error('The kept file does not match its fingerprint')
      await rememberMyFile({ id: file.id, name: file.name, instrument: file.instrument, bytes })
      onOpenFile({ id: file.id, instrument: file.instrument })
    } catch (err) {
      console.error(err)
      setNotice({ id: file.id, text: 'Could not fetch it from your account. Check your connection and try again.' })
    } finally {
      setFetching(null)
    }
  }

  const tap = (file) => {
    if (file.local) onOpenFile({ id: file.id, instrument: file.instrument })
    else if (file.stored) fetchFromAccount(file)
    else askForCopy(file)
  }

  const askForCopy = (file) => {
    setNotice(null)
    setPicking(file)
    if (picker.current) {
      picker.current.accept = ACCEPT[file.instrument] ?? `${NOTATION_ACCEPT},${GUITAR_NOTATION_ACCEPT}`
      picker.current.click()
    }
  }

  // The chosen file: the same one (by fingerprint) is kept here and opened;
  // a different one is pointed out, with the choice to open it instead.
  const chosen = async (event) => {
    const picked = event.target.files?.[0]
    event.target.value = ''
    const wanted = picking
    setPicking(null)
    if (!picked || !wanted) return
    try {
      const bytes = await picked.arrayBuffer()
      const id = await fingerprintBytes(bytes)
      if (id !== wanted.id) {
        setNotice({ id: wanted.id, text: `“${picked.name}” isn’t the same file as “${wanted.name}”.`, other: { id, name: picked.name, bytes } })
        return
      }
      await rememberMyFile({ id, name: picked.name, instrument: wanted.instrument, bytes })
      onOpenFile({ id, instrument: wanted.instrument })
    } catch (err) {
      console.error(err)
      setNotice({ id: wanted.id, text: 'Could not read that file.' })
    }
  }

  const openOther = async (file) => {
    const { other } = notice
    setNotice(null)
    await rememberMyFile({ id: other.id, name: other.name, instrument: file.instrument, bytes: other.bytes })
    onOpenFile({ id: other.id, instrument: file.instrument })
  }

  return (
    <>
      <input ref={picker} type="file" hidden onChange={chosen} aria-hidden="true" tabIndex={-1} />
      <ul className="home-files">
        {files.map((file) => (
          <li key={file.id} className={`home-files__item ${file.local ? '' : 'home-files__item--remote'}`}>
            <div className="home-files__row">
              {/* On this device: opens. On the account: fetched, then opens. Neither: asks for this device's copy. */}
              <button
                type="button"
                className="home-files__open"
                disabled={!file.local && (picking !== null || fetching !== null)}
                onClick={() => tap(file)}
              >
                <FileLine file={file} fetching={fetching === file.id} />
              </button>
              <button
                type="button"
                className="home-link-button home-link-button--small"
                aria-label={`Remove ${file.name}`}
                onClick={() => remove(file)}
              >
                Remove
              </button>
            </div>
            {notice?.id === file.id && (
              <p className="home-files__notice" role="status">
                {notice.text}
                {notice.other && (
                  <>
                    {' '}
                    <button type="button" className="home-link-button home-link-button--small" onClick={() => openOther(file)}>
                      Open it anyway
                    </button>
                  </>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="home-tab__hint">
        {signedIn
          ? `Kept on your account too, private to you, so they open on any device you sign in on.${
              usage ? ` ${usage.files} of ${usage.maxFiles} files, ${formatSize(usage.usedBytes)} of ${formatSize(usage.maxBytes)}.` : ''
            }`
          : 'Kept on this device only. Sign in to keep them on your account.'}
      </p>
    </>
  )
}

/** Where the file is, for its line in the list. */
function whereLabel(file, fetching) {
  if (fetching) return 'fetching from your account…'
  if (!file.local) return file.stored ? 'on your account · tap to open' : 'on another device · tap to open your copy'
  const opened = `opened ${timeAgo(file.opened)}`
  return file.stored === false ? `${opened} · this device only` : opened
}

function FileLine({ file, fetching = false }) {
  return (
    <>
      <span className="home-files__kind">{fileKind(file.name)}</span>
      <span className="home-files__text">
        <span className="home-files__name">{file.name}</span>
        <small>
          {INSTRUMENT[file.instrument] ?? file.instrument} · {formatSize(file.size)} ·{' '}
          {whereLabel(file, fetching)}
        </small>
      </span>
    </>
  )
}

const KINDS = [
  { kind: 'MusicXML', Icon: FileIcon, tone: 'purple' },
  { kind: 'MIDI', Icon: NoteIcon, tone: 'teal' },
  { kind: 'Guitar Pro', Icon: GuitarIcon, tone: 'purple' },
]

/** Home's My Files card: how many of each kind, here and on the account. */
export function FilesSummary({ onViewAll, userId = null, version = 0 }) {
  const { files } = useMyFiles(userId, version)
  const count = (kind) => files?.filter((f) => fileKind(f.name) === kind).length ?? 0
  const elsewhere = files?.filter((f) => !f.local).length ?? 0
  const signedIn = Boolean(userId && supabase)
  return (
    <>
      <p className="hp-muted">
        {files?.length
          ? `${files.length} ${files.length === 1 ? 'file' : 'files'}${
              signedIn ? ' on your account' : elsewhere ? `, ${elsewhere} on another device` : ' on this device'
            }. Tap one to open it again.`
          : 'Files you upload in Guitar or Vocal (MusicXML, MIDI, Guitar Pro) are listed here.'}
      </p>
      <ul className="hp-kinds">
        {KINDS.map(({ kind, Icon, tone }) => (
          <li key={kind}>
            <button type="button" className={`hp-kind hp-kind--${tone}`} onClick={onViewAll}>
              <span className="hp-kind__icon" aria-hidden="true">
                <Icon />
              </span>
              <strong>{kind}</strong>
              <small>
                {files === null ? '…' : count(kind)} {count(kind) === 1 ? 'file' : 'files'}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

export default MyFilesSection
