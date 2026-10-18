import { useEffect, useRef, useState } from 'react'
import '../home/HomeTab.css'
import './SocialTab.css'
import { acceptInvite, formatHandle } from '@backend/friends'
import { supabase } from '../../lib/supabaseClient.js'
import FriendsSection from '../home/FriendsSection.jsx'
import ProfileCard from '../home/ProfileCard.jsx'
import { useHomeData } from '../home/useHomeData.js'

const PARTS = ['profile', 'friends']

/**
 * Social: friends only. Your name#tag and invite link, adding someone by
 * name#tag, your friends, requests asking you, and requests you sent.
 * (Attempts you send or get, and their comments, are on Home.)
 *
 * `inviteCode` is an invite link being opened (App.jsx): once signed in it
 * makes you friends with whoever sent it.
 */
function SocialTab({ auth, onNavigate, inviteCode, onInviteDone }) {
  const { user, configured, ready } = auth
  const signedIn = Boolean(configured && ready && user)
  // The banner outlives the pending invite, so its result stays readable
  // after App has forgotten the code.
  const [inviteShown, setInviteShown] = useState(inviteCode)

  return (
    <div className="home-tab social-tab">
      <header className="home-tab__header">
        <h1>Friends</h1>
        <p>Add friends to send them your attempts and get feedback.</p>
      </header>

      {inviteShown && configured && (
        <InviteBanner
          code={inviteShown}
          signedIn={signedIn}
          ready={ready}
          onDone={onInviteDone}
          onDismiss={() => setInviteShown(null)}
        />
      )}

      {!configured ? (
        <p className="home-tab__hint">Sign-in is off on this copy of the app, so friends aren’t available.</p>
      ) : !ready ? (
        <p className="home-tab__hint">Checking your sign-in…</p>
      ) : signedIn ? (
        <SignedInSocial user={user} inviteCode={inviteCode} />
      ) : (
        <div className="home-card">
          <p className="home-tab__hint">Sign in to add friends.</p>
          <div className="home-row">
            <button type="button" className="home-button" onClick={() => onNavigate('home')}>
              Sign in on Home
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SignedInSocial({ user, inviteCode }) {
  const { data, errors, reload } = useHomeData(user.id, PARTS)

  // Accepting an invite (InviteBanner) changes the friends list.
  const hadInvite = useRef(Boolean(inviteCode))
  useEffect(() => {
    if (hadInvite.current && !inviteCode) reload('friends')
    hadInvite.current = Boolean(inviteCode)
  }, [inviteCode, reload])

  return (
    <>
      <ProfileCard user={user} profile={data.profile} error={errors.profile} onChanged={() => reload('profile')} />
      <FriendsSection me={data.profile} friends={data.friends} error={errors.friends} onChanged={() => reload('friends')} />
    </>
  )
}

/** Opening someone's invite link: sign in, then you're friends. */
function InviteBanner({ code, signedIn, ready, onDone, onDismiss }) {
  const [state, setState] = useState({ phase: 'waiting' }) // waiting | working | done | error
  const started = useRef(false)

  useEffect(() => {
    if (!signedIn || started.current) return
    started.current = true
    setState({ phase: 'working' })
    acceptInvite(supabase, code)
      .then((result) => setState({ phase: 'done', result }))
      .catch((err) => setState({ phase: 'error', error: err.message }))
      .finally(() => onDone())
  }, [signedIn, code, onDone])

  if (!ready) return null
  if (!signedIn) {
    return (
      <div className="home-banner" role="status">
        <span>
          <strong>You’ve been invited to be friends.</strong> Sign in on Home to accept.
        </span>
      </div>
    )
  }
  if (state.phase === 'working') return <div className="home-banner">Adding your friend…</div>
  const close = (
    <button type="button" className="home-banner__close" aria-label="Dismiss" onClick={onDismiss}>
      ×
    </button>
  )
  if (state.phase === 'error') {
    return (
      <div className="home-banner home-banner--error" role="alert">
        <span>{state.error}</span>
        {close}
      </div>
    )
  }
  if (state.phase === 'done') {
    const { result } = state
    const name = formatHandle(result) ?? 'them'
    const text =
      result.result === 'self'
        ? 'That’s your own invite link. Send it to a friend!'
        : result.result === 'already_friends'
          ? `You and ${name} are already friends.`
          : `You and ${name} are now friends.`
    return (
      <div className="home-banner home-banner--done" role="status">
        <span>{text}</span>
        {close}
      </div>
    )
  }
  return null
}

export default SocialTab