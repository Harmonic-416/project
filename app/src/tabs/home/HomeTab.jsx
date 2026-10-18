import { useEffect, useState } from 'react'
import './HomeTab.css'
import AccountCard from '../../auth/AccountCard.jsx'
import AuthPanel from '../../auth/AuthPanel.jsx'
import { firstNameFor, friendlyAuthError, readOAuthError } from '../../auth/authHelpers.js'
import { GuitarIcon, MicIcon } from '../../nav/TabIcons.jsx'
import MyFilesSection from './MyFilesSection.jsx'
import { LatestAttempt, WorkingOn } from './ProgressSection.jsx'
import { InboxSection, SentSection } from './SharedSection.jsx'
import { useHomeData } from './useHomeData.js'

const PRACTICE = [
  { id: 'guitar', Icon: GuitarIcon, title: 'Guitar', text: 'Tuner, then songs as tab and notation' },
  { id: 'vocal', Icon: MicIcon, title: 'Vocal', text: 'Sheet music, playback and recording' },
]

/**
 * Home: the account, and while signed in your own page: how your latest
 * attempt went, the songs you're working on, attempts friends sent you and
 * ones you sent (with comments), and the song files kept on this device.
 * Friends live in the Social tab.
 *
 * `onOpenAttempt` / `onOpenFile` open an attempt or a file in its
 * instrument's tab.
 */
function HomeTab({ auth, onNavigate, onOpenAttempt, onOpenFile }) {
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

  return (
    <div className="home-tab">
      <header className="home-tab__header">
        <h1>{user ? `Welcome back, ${firstNameFor(user)}` : 'Harmonic'}</h1>
        <p>Learn the instrument and the language at the same time.</p>
      </header>

      {signedIn ? (
        <SignedInHome user={user} onNavigate={onNavigate} onOpenAttempt={onOpenAttempt} onOpenFile={onOpenFile} />
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
          <Section id="home-files" title="My files">
            <MyFilesSection onOpenFile={onOpenFile} />
          </Section>
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

function SignedInHome({ user, onNavigate, onOpenAttempt, onOpenFile }) {
  const { data, errors, reload } = useHomeData(user.id)
  const unseen = data.inbox?.filter((item) => !item.seen_at).length ?? 0

  return (
    <>
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

      <Section id="home-sent" title="Sent by you">
        <SentSection sent={data.sent} error={errors.sent} friends={data.friends} myId={user.id} onOpenAttempt={onOpenAttempt} />
      </Section>

      <Section id="home-files" title="My files">
        <MyFilesSection onOpenFile={onOpenFile} />
      </Section>

      <PracticeLinks onNavigate={onNavigate} />
    </>
  )
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