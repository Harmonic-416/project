import { useEffect, useRef, useState } from 'react'
import './ShareAttempt.css'
import { attachRecording, saveAttempt, sendAttemptToFriends, shareAttempt, shareAttemptLink } from '@backend/attempts'
import { formatHandle, listFriends } from '@backend/friends'
import { displayNameFor } from '../../../auth/authHelpers.js'
import { shareUrlFor, toTrace } from '../share/sharedAttempt.js'
import { namesList } from '../../home/homeFormat.js'

/**
 * Shown under a finished attempt (Vocal: a recorded run; Guitar: a Trouble
 * spots run). While signed in, the attempt is saved privately as soon as it
 * appears, so Home can show the song under "Working on" and give feedback on
 * it. From here it can also go further:
 *
 *   - Copy link: anyone who signs in with the link can open it.
 *   - Send to friends: it shows up on their Home page, where they can comment.
 *
 * Only the pitch trace (or, for guitar, the verdict on every note), the
 * score and optionally the recording are stored, never the song: the person
 * opening it uses a catalog or built-in song, or their own copy of the file,
 * matched by its fingerprint.
 *
 * `song` is { songId, title, format, fingerprint, builtin, partId, partName, withOthers }.
 */
function ShareAttempt({ auth, supabase, song, samples = [], accuracy, recording, instrument = 'voice', verdicts = null }) {
  const [includeRecording, setIncludeRecording] = useState(true)
  const [saved, setSaved] = useState(null) // the saved attempt row
  const [saveFailed, setSaveFailed] = useState(false)
  const [state, setState] = useState('idle') // idle | sharing | shared | error
  const [link, setLink] = useState(null)
  const [message, setMessage] = useState(null)
  const [picking, setPicking] = useState(false)
  const savingRef = useRef(null)

  const signedIn = Boolean(auth.configured && auth.user && supabase)
  const identifiable = Boolean(song.songId || song.fingerprint)

  // What gets stored, fixed when the attempt appears (its props are final by then).
  const [details] = useState(() => ({
    sharerName: displayNameFor(auth.user) || null,
    songId: song.songId,
    songTitle: song.title,
    songFormat: song.format,
    songFingerprint: song.songId ? null : song.fingerprint,
    partId: song.partId,
    partName: song.partName,
    withOthers: song.withOthers,
    samples: toTrace(samples),
    accuracy: Math.round(accuracy * 10) / 10,
    instrument,
    verdicts,
  }))

  // Save once per finished attempt (the ref survives StrictMode's re-run).
  useEffect(() => {
    if (!signedIn || !identifiable) return undefined
    if (!savingRef.current) savingRef.current = saveAttempt(supabase, details)
    let live = true
    savingRef.current.then(
      (row) => live && setSaved(row),
      (err) => {
        console.error(err)
        if (live) setSaveFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [signedIn, identifiable, supabase, details])

  if (!auth.configured) return null
  if (!auth.user) {
    return <p className="share-attempt__hint">Sign in on the Home tab to save and share this attempt.</p>
  }
  if (!identifiable) return null

  /** The saved row, with the recording attached if asked for. */
  const ready = async () => {
    let row = saved ?? (await savingRef.current?.catch(() => null))
    if (!row) return null
    if (includeRecording && recording && !row.recording_path) {
      row = await attachRecording(supabase, row, recording)
      setSaved(row)
    }
    return row
  }

  const copyLink = async () => {
    setState('sharing')
    setMessage(null)
    try {
      let row = await ready()
      if (row) await shareAttemptLink(supabase, row.id)
      // Saving didn't work: share the old way, as a new row.
      else row = await shareAttempt(supabase, details, includeRecording ? recording : null)
      const url = shareUrlFor(row.id, window.location.origin, instrument)
      setLink(url)
      setState('shared')
      await offer(url, song.title)
    } catch (err) {
      console.error(err)
      setMessage(err.message || 'Could not share this attempt.')
      setState('error')
    }
  }

  // The phone's share sheet when there is one, else the clipboard.
  const offer = async (url, title) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `My attempt at ${title}`, url })
        return
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      setMessage('Link copied.')
    } catch {
      setMessage('Copy the link below.')
    }
  }

  const status = saved ? 'Saved to your Home page.' : saveFailed ? null : 'Saving…'

  return (
    <div className="share-attempt">
      {state === 'shared' && link ? (
        <>
          <input className="share-attempt__link" readOnly value={link} onFocus={(event) => event.target.select()} />
          <button type="button" className="share-attempt__button" onClick={() => offer(link, song.title)}>
            Share link
          </button>
        </>
      ) : (
        <button type="button" className="share-attempt__button" disabled={state === 'sharing'} onClick={copyLink}>
          {state === 'sharing' ? 'Sharing…' : 'Copy link'}
        </button>
      )}
      <button
        type="button"
        className="share-attempt__button share-attempt__button--quiet"
        disabled={!saved}
        aria-expanded={picking}
        onClick={() => setPicking((open) => !open)}
      >
        Send to friends
      </button>
      {recording && (
        <label className="share-attempt__option">
          <input
            type="checkbox"
            checked={includeRecording}
            disabled={state === 'sharing'}
            onChange={(event) => setIncludeRecording(event.target.checked)}
          />
          Include my recording
        </label>
      )}
      {message && <span className={state === 'error' ? 'share-attempt__error' : 'share-attempt__hint'}>{message}</span>}
      {status && !message && <span className="share-attempt__hint">{status}</span>}
      {picking && saved && (
        <FriendPicker
          supabase={supabase}
          onSend={async (friends) => {
            const row = await ready()
            await sendAttemptToFriends(supabase, row.id, friends.map((f) => f.user_id))
            setMessage(`Sent to ${namesList(friends.map((f) => f.display_name))}. It’s on their Home page.`)
            setState('idle')
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {state === 'shared' && !song.songId && !song.builtin && (
        <p className="share-attempt__hint">
          They open their own copy of {song.title} to see it; the song itself isn’t uploaded.
        </p>
      )}
    </div>
  )
}

/** Tick friends, then Send. */
function FriendPicker({ supabase, onSend, onClose }) {
  const [friends, setFriends] = useState(null)
  const [chosen, setChosen] = useState(() => new Set())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    listFriends(supabase)
      .then((list) => live && setFriends(list.filter((f) => f.kind === 'friend')))
      .catch((err) => live && setError(err.message))
    return () => {
      live = false
    }
  }, [supabase])

  const toggle = (id) =>
    setChosen((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      await onSend(friends.filter((f) => chosen.has(f.user_id)))
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not send it.')
      setSending(false)
    }
  }

  return (
    <div className="share-attempt__picker" role="group" aria-label="Send to friends">
      {friends === null && !error && <p className="share-attempt__hint">Loading your friends…</p>}
      {friends?.length === 0 && (
        <p className="share-attempt__hint">No friends yet. Add some on the Home tab with their name#tag or your invite link.</p>
      )}
      {friends?.length > 0 && (
        <ul className="share-attempt__friends">
          {friends.map((friend) => (
            <li key={friend.user_id}>
              <label className="share-attempt__option">
                <input type="checkbox" checked={chosen.has(friend.user_id)} onChange={() => toggle(friend.user_id)} />
                {formatHandle(friend) ?? 'Unnamed friend'}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="share-attempt__picker-actions">
        <button type="button" className="share-attempt__button" disabled={chosen.size === 0 || sending} onClick={send}>
          {sending ? 'Sending…' : chosen.size > 1 ? `Send to ${chosen.size} friends` : 'Send'}
        </button>
        <button type="button" className="share-attempt__button share-attempt__button--quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
      {error && <span className="share-attempt__error">{error}</span>}
    </div>
  )
}

export default ShareAttempt