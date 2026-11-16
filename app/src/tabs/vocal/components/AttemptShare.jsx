import { Link, Send } from 'lucide-react'
import { useState } from 'react'
import './ShareAttempt.css'
import { sendAttemptToFriends, shareAttemptLink } from '@backend/attempts'
import { shareUrlFor } from '../share/sharedAttempt.js'
import { namesList } from '../../home/homeFormat.js'
import { FriendPicker } from './ShareAttempt.jsx'

/**
 * Share an attempt that is already saved (a row in This session or Practice
 * sessions): send it to friends, or copy its link. The same two actions, and
 * the same friend picker, as the card after a take (ShareAttempt) — that one
 * also has to save the take first; this one only shares.
 */
export default function AttemptShare({ supabase, attempt }) {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const copyLink = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await shareAttemptLink(supabase, attempt.id)
      const url = shareUrlFor(attempt.id, window.location.origin, attempt.instrument ?? 'voice')
      try {
        if (navigator.share) await navigator.share({ title: `My attempt at ${attempt.song_title ?? 'a song'}`, url })
        else {
          await navigator.clipboard.writeText(url)
          setMessage('Link copied.')
        }
      } catch (err) {
        if (err?.name !== 'AbortError') setMessage(url)
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not share this attempt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="share-attempt attempt-share">
      <button
        type="button"
        className="share-attempt__button share-attempt__send"
        aria-expanded={picking}
        onClick={() => setPicking((open) => !open)}
      >
        <Send size="1.1em" aria-hidden="true" /> Send to friends
      </button>
      <button type="button" className="share-attempt__button share-attempt__button--quiet" disabled={busy} onClick={copyLink}>
        <Link size="1.1em" aria-hidden="true" /> {busy ? 'Sharing…' : 'Copy link'}
      </button>
      {message && <span className="share-attempt__hint">{message}</span>}
      {error && <span className="share-attempt__error">{error}</span>}
      {!attempt.recording_path && <span className="share-attempt__hint">No recording kept: they’ll see your marks but can’t hear you.</span>}
      {picking && (
        <FriendPicker
          supabase={supabase}
          onSend={async (friends) => {
            await sendAttemptToFriends(supabase, attempt.id, friends.map((f) => f.user_id))
            setMessage(`Sent to ${namesList(friends.map((f) => f.display_name))}. It’s on their Home page.`)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
