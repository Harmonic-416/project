import { useEffect, useState } from 'react'
import { formatHandle, inviteUrlFor, nameProblem, resetInviteCode, setDisplayName } from '@backend/friends'
import Avatar from '../../auth/Avatar.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { CheckIcon, CopyIcon, LinkIcon, PencilIcon } from './socialIcons.jsx'

/**
 * Top of Social: your avatar and name#tag (how friends find you), a few
 * counts, and your invite link. A new account starts with the first name
 * from Google/GitHub when there is one; until there is a name, this asks for
 * one, since friends can't find you without it.
 */
function SocialProfile({ user, profile, error, counts, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState(null)
  const [copied, setCopied] = useState(null) // 'handle' | 'link'

  useEffect(() => {
    if (!copied) return undefined
    const id = setTimeout(() => setCopied(null), 1800)
    return () => clearTimeout(id)
  }, [copied])

  if (error) return <p className="home-tab__error">{error}</p>
  if (!profile) return <div className="social-hero social-hero--loading">Loading your profile…</div>

  const handle = formatHandle(profile)
  const needsName = !profile.display_name
  const inviteUrl = inviteUrlFor(profile.invite_code, window.location.origin)

  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setMessage(null)
    } catch {
      setMessage(text)
    }
  }

  const shareInvite = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Add me on Harmonic', url: inviteUrl })
        return
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
    await copy('link', inviteUrl)
  }

  const resetInvite = async () => {
    if (!window.confirm('Turn off your current invite link? Links you already sent will stop working.')) return
    try {
      await resetInviteCode(supabase)
      await onChanged()
      setMessage('Your old invite link is off. Share the new one below.')
    } catch (err) {
      setMessage(err.message)
    }
  }

  return (
    <section className="social-hero" aria-label="Your profile">
      <div className="social-hero__banner" aria-hidden="true" />
      <div className="social-hero__body">
        <div className="social-hero__avatar">
          <Avatar user={user} size={76} />
        </div>

        {handle && !editing ? (
          <div className="social-hero__who">
            <h2 className="social-hero__name">
              {profile.display_name}
              <span className="social-hero__tag">#{profile.tag}</span>
            </h2>
            <div className="social-hero__actions">
              <button type="button" className="social-chip" onClick={() => copy('handle', handle)}>
                {copied === 'handle' ? <CheckIcon /> : <CopyIcon />}
                {copied === 'handle' ? 'Copied' : 'Copy name#tag'}
              </button>
              <button type="button" className="social-chip social-chip--quiet" onClick={() => setEditing(true)}>
                <PencilIcon />
                Edit name
              </button>
            </div>
          </div>
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

        <dl className="social-hero__stats">
          <div>
            <dt>Friends</dt>
            <dd>{counts.friends ?? '–'}</dd>
          </div>
          <div>
            <dt>Requests</dt>
            <dd className={counts.requests > 0 ? 'social-hero__stat--alert' : ''}>{counts.requests ?? '–'}</dd>
          </div>
          <div>
            <dt>Sent</dt>
            <dd>{counts.sent ?? '–'}</dd>
          </div>
        </dl>
      </div>

      {handle && (
        <div className="social-invite">
          <div className="social-invite__text">
            <span className="social-invite__icon" aria-hidden="true">
              <LinkIcon />
            </span>
            <div>
              <strong>Invite link</strong>
              <span>Anyone who opens it becomes your friend.</span>
            </div>
          </div>
          <div className="social-invite__row">
            <code className="social-invite__url" title={inviteUrl}>
              {inviteUrl.replace(/^https?:\/\//, '')}
            </code>
            <button type="button" className="social-button" onClick={shareInvite}>
              {copied === 'link' ? <CheckIcon /> : <CopyIcon />}
              {copied === 'link' ? 'Copied' : 'Share'}
            </button>
          </div>
          <button type="button" className="social-link-button" onClick={resetInvite}>
            Turn off this link and make a new one
          </button>
        </div>
      )}

      {message && (
        <p className="social-hero__message" role="status">
          {message}
        </p>
      )}
    </section>
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
    <form className="social-name-form" onSubmit={submit}>
      <label className="social-name-form__label" htmlFor="social-name">
        {firstTime ? 'Pick a name so friends can find you' : 'Your name'}
      </label>
      <div className="social-field">
        <input
          id="social-name"
          className="social-field__input"
          value={name}
          maxLength={20}
          autoComplete="nickname"
          placeholder="e.g. Pan"
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
        <button type="submit" className="social-button" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error ? (
        <span className="home-tab__error">{error}</span>
      ) : (
        <span className="social-hint">You’ll get a 4-digit tag, like Pan#2041, so names can repeat.</span>
      )}
      {onCancel && (
        <button type="button" className="social-link-button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  )
}

export default SocialProfile
