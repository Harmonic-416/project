import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import NotationUploader from '../vocal/components/NotationUploader.jsx'
import { GUITAR_NOTATION_ACCEPT } from '../guitar/notation/formats.js'
import { NOTATION_ACCEPT } from '../vocal/notation/loadNotation.js'
import { fingerprintBytes } from '../vocal/share/sharedAttempt.js'
import { fileKind, formatSize, myFilesAvailable, rememberMyFile } from './myFiles.js'
import { fetchAccountFile, removalScope, removeListedFile, useMyFiles } from './useMyFiles.js'
import { timeAgo } from './homeFormat.js'
import { FileIcon, NoteIcon } from './homeIcons.jsx'
import { GuitarIcon } from '../../nav/TabIcons.jsx'

const INSTRUMENT = { guitar: 'Guitar', voice: 'Vocal' }
const ACCEPT = { guitar: GUITAR_NOTATION_ACCEPT, voice: NOTATION_ACCEPT }

/**
 * Song files you opened in Guitar or Vocal: open one again, or remove it.
 * Each is kept on this device (myFiles.js) and, signed in, on the account
 * (useMyFilesSync sends it): a file only on the account is fetched when
 * tapped. One the account doesn't have (another device hasn't sent it yet)
 * asks for this device's copy of the same file, checked by fingerprint.
 */
function MyFilesSection({ onImportScore, onOpenFile, userId = null, version = 0 }) {
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
      <EmptyFiles signedIn={signedIn} onImportScore={onImportScore} />
    )
  }

  const remove = async (file) => {
    if (!window.confirm(`Remove “${file.name}” from ${removalScope(file, signedIn)}?`)) return
    try {
      await removeListedFile(file)
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
      await fetchAccountFile(file)
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

function EmptyFiles({ signedIn, onImportScore }) {
  return (
    <>
      <p className="hp-muted">
        Scores you open from a file appear here. {!signedIn && 'Sign in to keep them on your account.'}
      </p>
      {onImportScore && (
        <NotationUploader onFileSelected={onImportScore} accept={GUITAR_NOTATION_ACCEPT} label="Open a Guitar score" />
      )}
    </>
  )
}

/** Home's My Files card: how many of each kind, here and on the account. */
export function FilesSummary({ onImportScore, onViewAll, userId = null, version = 0 }) {
  const { files } = useMyFiles(userId, version)
  const count = (kind) => files?.filter((f) => fileKind(f.name) === kind).length ?? 0
  const elsewhere = files?.filter((f) => !f.local).length ?? 0
  const signedIn = Boolean(userId && supabase)
  if (files?.length === 0) return <EmptyFiles signedIn={signedIn} onImportScore={onImportScore} />
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
