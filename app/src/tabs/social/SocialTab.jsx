import { useEffect, useRef, useState } from 'react'
import '../home/HomeTab.css'
import '../home/HomePage.css'
import './SocialTab.css'
import { acceptInvite, formatHandle } from '@backend/friends'
import { supabase } from '../../lib/supabaseClient.js'
import SocialFriends from './SocialFriends.jsx'
import SocialProfile from './SocialProfile.jsx'
import { useHomeData } from '../home/useHomeData.js'
import { PeopleIcon } from './socialIcons.jsx'

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
    <div className="home-page social-page">
      <div className="home-tab social-tab">
        <header className="social-tab__header">
          <span className="social-tab__eyebrow">Social</span>
          <h1>Friends</h1>
          <p>Send your attempts to friends and get feedback on them.</p>
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
          <div className="social-card social-signed-out">
            <span className="social-empty__icon" aria-hidden="true">
              <PeopleIcon />
            </span>
            <h2>Practice is better with friends</h2>
            <p>Sign in to add friends, send them your attempts and leave each other feedback.</p>
            <button type="button" className="social-button" onClick={() => onNavigate('home')}>
              Sign in on Home
            </button>
          </div>
        )}
      </div>
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

  const friends = data.friends
  const count = (kind) => (friends ? friends.filter((f) => f.kind === kind).length : null)
  const counts = { friends: count('friend'), requests: count('incoming'), sent: count('outgoing') }

  return (
    <>
      <SocialProfile
        user={user}
        profile={data.profile}
        error={errors.profile}
        counts={counts}
        onChanged={() => reload('profile')}
      />
      <SocialFriends me={data.profile} friends={friends} error={errors.friends} onChanged={() => reload('friends')} />
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
