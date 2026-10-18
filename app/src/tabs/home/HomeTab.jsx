import { useEffect, useRef, useState } from 'react'
import './HomeTab.css'
import { acceptInvite, formatHandle } from '@backend/friends'
import AccountCard from '../../auth/AccountCard.jsx'
import AuthPanel from '../../auth/AuthPanel.jsx'
import { firstNameFor, friendlyAuthError, readOAuthError } from '../../auth/authHelpers.js'
import { supabase } from '../../lib/supabaseClient.js'
import { GuitarIcon, MicIcon } from '../../nav/TabIcons.jsx'
import FriendsSection from './FriendsSection.jsx'
import ProfileCard from './ProfileCard.jsx'
import { LatestAttempt, WorkingOn } from './ProgressSection.jsx'
import { InboxSection, SentSection } from './SharedSection.jsx'
import { useHomeData } from './useHomeData.js'

const PRACTICE = [
  { id: 'guitar', Icon: GuitarIcon, title: 'Guitar', text: 'Tuner, then songs as tab and notation' },
  { id: 'vocal', Icon: MicIcon, title: 'Vocal', text: 'Sheet music, playback and recording' },
]

/**
 * Home: the account, and while signed in your own page: your name#tag and
 * invite link, how your latest attempt went, the songs you're working on,
 * attempts friends sent you (with comments), your friends and requests, and
 * what you've sent.
 *
 * `inviteCode` is an invite link being opened (App.jsx): once signed in it
 * makes you friends with whoever sent it. `onOpenAttempt` opens an attempt
 * in its instrument's tab.
 */
function HomeTab({ auth, onNavigate, inviteCode, onInviteDone, onOpenAttempt }) {
  const { user, configured, ready } = auth

  // A failed sign-in or "Connect" comes back to the app with the reason in
  // the address bar. Read it once, then tidy the address so a refresh
  // doesn't show the same message again.
  const [notice] = useState(() => {
    const raw = readOAuthError(window.location.href)
    return raw ? friendlyAuthError(raw) : null
  })
  useEffect(() => {
    if (notice) window.history.replaceState(null, '', window.location.pathname)
  }, [notice])

  const signedIn = Boolean(configured && ready && user)
  // The banner outlives the pending invite, so its result stays readable
  // after App has forgotten the code.
  const [inviteShown, setInviteShown] = useState(inviteCode)

  return (
    <div className="home-tab">
      <header className="home-tab__header">
        <h1>{user ? `Welcome back, ${firstNameFor(user)}` : 'Harmonic'}</h1>
        <p>Learn the instrument and the language at the same time.</p>
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

      {signedIn ? (
        <SignedInHome user={user} onNavigate={onNavigate} onOpenAttempt={onOpenAttempt} inviteCode={inviteCode} />
      ) : (
        <>
          <Section id="home-account" title="Account">
            {!configured ? (
              <p className="home-tab__hint">
                Sign-in is off on this copy of the app: copy <code>app/.env.example</code> to{' '}
                <code>app/.env.local</code> and add the Supabase key. Everything else works with local files.
              </p>
            ) : !ready ? (
              <p className="home-tab__hint">Checking your sign-in…</p>
            ) : (
              <>
                <p className="home-tab__hint">
                  Sign in to keep your results, add friends and get feedback on your attempts.
                </p>
                <AuthPanel onSignInWith={auth.signInWith} notice={notice} />
              </>
            )}
          </Section>
          <PracticeLinks onNavigate={onNavigate} />
        </>
      )}

      {signedIn && (
        <Section id="home-account" title="Account">
          <AccountCard user={user} onSignOut={auth.signOut} notice={notice} />
        </Section>
      )}
    </div>
  )
}

function SignedInHome({ user, onNavigate, onOpenAttempt, inviteCode }) {
  const { data, errors, reload } = useHomeData(user.id)
  const unseen = data.inbox?.filter((item) => !item.seen_at).length ?? 0
  const requests = data.friends?.filter((f) => f.kind === 'incoming').length ?? 0

  // Accepting an invite (InviteBanner) changes the friends list.
  const hadInvite = useRef(Boolean(inviteCode))
  useEffect(() => {
    if (hadInvite.current && !inviteCode) reload('friends')
    hadInvite.current = Boolean(inviteCode)
  }, [inviteCode, reload])

  return (
    <>
      <ProfileCard user={user} profile={data.profile} error={errors.profile} onChanged={() => reload('profile')} />

      <Section id="home-progress" title="Your latest attempt">
        <LatestAttempt latest={data.latest} recent={data.recent} error={errors.latest ?? errors.recent} onOpenAttempt={onOpenAttempt} />
      </Section>

      <Section id="home-working-on" title="Working on">
        <WorkingOn recent={data.recent} error={errors.recent} onOpenAttempt={onOpenAttempt} />
      </Section>

      <Section id="home-inbox" title="Shared with you" count={unseen} countLabel="new">
        <InboxSection
          inbox={data.inbox}
          error={errors.inbox}
          myId={user.id}
          onOpenAttempt={onOpenAttempt}
          onChanged={() => reload('inbox')}
        />
      </Section>

      <Section id="home-friends" title="Friends" count={requests} countLabel={requests === 1 ? 'request' : 'requests'}>
        <FriendsSection
          me={data.profile}
          friends={data.friends}
          error={errors.friends}
          onChanged={() => reload('friends')}
        />
      </Section>

      <Section id="home-sent" title="Sent by you">
        <SentSection sent={data.sent} error={errors.sent} friends={data.friends} myId={user.id} onOpenAttempt={onOpenAttempt} />
      </Section>

      <PracticeLinks onNavigate={onNavigate} />
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
          <strong>You’ve been invited to be friends.</strong> Sign in below to accept.
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

function Section({ id, title, count = 0, countLabel, children }) {
  return (
    <section className="home-tab__section" aria-labelledby={id}>
      <h2 id={id} className="home-tab__section-title">
        {title}
        {count > 0 && (
          <span className="home-tab__section-count">
            {count} {countLabel}
          </span>
        )}
      </h2>
      {children}
    </section>
  )
}

function PracticeLinks({ onNavigate }) {
  return (
    <Section id="home-practice" title="Practice">
      <div className="home-tab__links">
        {PRACTICE.map((item) => (
          <button key={item.id} type="button" className="home-tab__link" onClick={() => onNavigate(item.id)}>
            <span className="home-tab__link-icon" aria-hidden="true">
              <item.Icon />
            </span>
            <span className="home-tab__link-text">
              <strong>{item.title}</strong>
              <small>{item.text}</small>
            </span>
            <span className="home-tab__link-arrow" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </div>
    </Section>
  )
}

export default HomeTab