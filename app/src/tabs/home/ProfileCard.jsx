import { useState } from 'react'
import { formatHandle, inviteUrlFor, nameProblem, resetInviteCode, setDisplayName } from '@backend/friends'
import Avatar from '../../auth/Avatar.jsx'
import { supabase } from '../../lib/supabaseClient.js'

/**
 * Your name#tag (how friends find you) and your invite link. A new account
 * starts with the first name from Google/GitHub when there is one; until
 * there is a name, this asks for one, since friends can't find you without.
 */
function ProfileCard({ user, profile, error, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState(null)

  if (error) return <p className="home-tab__error">{error}</p>
  if (!profile) return <div className="home-card home-card--loading">Loading your profile…</div>

  const handle = formatHandle(profile)
  const needsName = !profile.display_name

  const copyInvite = async () => {
    const url = inviteUrlFor(profile.invite_code, window.location.origin)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Add me on Harmonic', url })
        return
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      setMessage('Invite link copied. Anyone who opens it becomes your friend.')
    } catch {
      setMessage(url)
    }
  }

  const resetInvite = async () => {
    if (!window.confirm('Turn off your current invite link? Links you already sent will stop working.')) return
    try {
      await resetInviteCode(supabase)
      await onChanged()
      setMessage('Your old invite link is off. Copy the new one to share it.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  return (
    <div className="home-card home-profile">
      <div className="home-profile__who">
        <Avatar user={user} size={52} />
        <div className="home-profile__names">
          {handle && !editing ? (
            <>
              <strong className="home-profile__handle">
                {profile.display_name}
                <span className="home-profile__tag">#{profile.tag}</span>
              </strong>
              <button type="button" className="home-link-button" onClick={() => setEditing(true)}>
                Change name
              </button>
            </>
          ) : (
            <NameForm
              current={profile.display_name ?? ''}
              firstTime={needsName}
              onCancel={needsName ? null : () => setEditing(false)}
              onSaved={async (saved) => {
                setEditing(false)
                await onChanged()
                setMessage(
                  saved.tag === profile.tag || needsName
                    ? `You’re ${saved.display_name}#${saved.tag}.`
                    : `Someone already had that name with your tag, so you’re now ${saved.display_name}#${saved.tag}.`,
                )
              }}
            />
          )}
        </div>
      </div>

      {handle && (
        <div className="home-profile__invite">
          <p className="home-tab__hint">
            Friends add you with <strong>{handle}</strong>, or send them your invite link.
          </p>
          <div className="home-row">
            <button type="button" className="home-button" onClick={copyInvite}>
              Copy invite link
            </button>
            <button type="button" className="home-link-button" onClick={resetInvite}>
              Turn off old link
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="home-tab__hint" role="status">
          {message}
        </p>
      )}
    </div>
  )
}

function NameForm({ current, firstTime, onCancel, onSaved }) {
  const [name, setName] = useState(current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (event) => {
    event.preventDefault()
    const problem = nameProblem(name)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSaved(await setDisplayName(supabase, name.trim()))
    } catch (err) {
      setError(err.message || 'Could not save your name.')
      setSaving(false)
    }
  }

  return (
    <form className="home-name-form" onSubmit={submit}>
      <label className="home-name-form__label" htmlFor="home-name">
        {firstTime ? 'Pick a name so friends can find you' : 'Your name'}
      </label>
      <div className="home-row">
        <input
          id="home-name"
          className="home-input"
          value={name}
          maxLength={20}
          autoComplete="nickname"
          placeholder="e.g. Pan"
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
        <button type="submit" className="home-button" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {onCancel && (
          <button type="button" className="home-link-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error ? (
        <span className="home-tab__error">{error}</span>
      ) : (
        <span className="home-tab__hint">You’ll get a 4-digit tag, like Pan#2041, so names can repeat.</span>
      )}
    </form>
  )
}

export default ProfileCard