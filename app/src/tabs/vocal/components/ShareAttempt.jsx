import { useState } from 'react'
import './ShareAttempt.css'
import { shareAttempt } from '@backend/attempts'
import { displayNameFor } from '../../../auth/authHelpers.js'
import { shareUrlFor, toTrace } from '../share/sharedAttempt.js'

/**
 * "Share attempt": stores the pitch trace, score and (optionally) the
 * recording, never the song, and hands back a link. The person you send it
 * to signs in and opens the same song: a catalog or built-in song loads by
 * itself; for your own file they open their copy, matched by its fingerprint.
 *
 * `song` is { songId, title, format, fingerprint, builtin, partId, partName, withOthers }.
 * The Guitar tab shares with `instrument="guitar"` and `verdicts` (one per
 * note of its song timeline) instead of a pitch trace.
 */
function ShareAttempt({ auth, supabase, song, samples = [], accuracy, recording, instrument = 'voice', verdicts = null }) {
  const [includeRecording, setIncludeRecording] = useState(true)
  const [state, setState] = useState('idle') // idle | sharing | shared | error
  const [link, setLink] = useState(null)
  const [message, setMessage] = useState(null)

  if (!auth.configured) return null
  if (!auth.user) {
    return <p className="share-attempt__hint">Sign in on the Home tab to share this attempt.</p>
  }
  if (!song.songId && !song.fingerprint) return null

  const share = async () => {
    setState('sharing')
    setMessage(null)
    try {
      const shared = await shareAttempt(
        supabase,
        {
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
        },
        includeRecording ? recording : null,
      )
      const url = shareUrlFor(shared.id, window.location.origin, instrument)
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

  if (state === 'shared' && link) {
    return (
      <div className="share-attempt">
        <input className="share-attempt__link" readOnly value={link} onFocus={(event) => event.target.select()} />
        <button type="button" className="share-attempt__button" onClick={() => offer(link, song.title)}>
          Share link
        </button>
        {message && <span className="share-attempt__hint">{message}</span>}
        {!song.songId && !song.builtin && (
          <p className="share-attempt__hint">
            They open their own copy of {song.title} to see it; the song itself isn’t uploaded.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="share-attempt">
      <button type="button" className="share-attempt__button" disabled={state === 'sharing'} onClick={share}>
        {state === 'sharing' ? 'Sharing…' : 'Share attempt'}
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
      {message && <span className="share-attempt__error">{message}</span>}
    </div>
  )
}

export default ShareAttempt
