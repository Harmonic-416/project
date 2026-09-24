import { useEffect, useState } from 'react'
import './HomeTab.css'
import AccountCard from '../../auth/AccountCard.jsx'
import AuthPanel from '../../auth/AuthPanel.jsx'
import { firstNameFor, friendlyAuthError, readOAuthError } from '../../auth/authHelpers.js'
import { GuitarIcon, MicIcon } from '../../nav/TabIcons.jsx'

const PRACTICE = [
  { id: 'guitar', Icon: GuitarIcon, title: 'Guitar', text: 'Tuner, then songs as tab and notation' },
  { id: 'vocal', Icon: MicIcon, title: 'Vocal', text: 'Sheet music, playback and recording' },
]

/**
 * Landing screen and the one place for the account: sign in while signed
 * out, the account card while signed in. The instrument tabs only read
 * `auth.user` to decide what they may save.
 */
function HomeTab({ auth, onNavigate }) {
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

  return (
    <div className="home-tab">
      <header className="home-tab__header">
        <h1>{user ? `Welcome back, ${firstNameFor(user)}` : 'Harmonic'}</h1>
        <p>Learn the instrument and the language at the same time.</p>
      </header>

      <section className="home-tab__section" aria-labelledby="home-account">
        <h2 id="home-account" className="home-tab__section-title">
          Account
        </h2>

        {!configured ? (
          <p className="home-tab__hint">
            Sign-in is off on this copy of the app: copy <code>app/.env.example</code> to{' '}
            <code>app/.env.local</code> and add the Supabase key. Everything else works with local files.
          </p>
        ) : !ready ? (
          <p className="home-tab__hint">Checking your sign-in…</p>
        ) : user ? (
          <AccountCard user={user} onSignOut={auth.signOut} notice={notice} />
        ) : (
          <AuthPanel onSignInWith={auth.signInWith} notice={notice} />
        )}
      </section>

      <section className="home-tab__section" aria-labelledby="home-practice">
        <h2 id="home-practice" className="home-tab__section-title">
          Practice
        </h2>
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
      </section>
    </div>
  )
}

export default HomeTab