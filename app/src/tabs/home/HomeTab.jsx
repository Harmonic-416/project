import './HomeTab.css'
import AuthPanel from '../../auth/AuthPanel.jsx'

/**
 * Landing screen and the single home for the account. Sign-in used to live
 * inside the Vocal tab's cloud library, which meant the instrument page owned
 * session state it did not need; the tabs now just read `auth.user`.
 */
function HomeTab({ auth, onNavigate }) {
  const { user, configured, ready } = auth

  return (
    <div className="home-tab">
      <header className="home-tab__header">
        <h1>Harmonic</h1>
        <p>Learn the instrument and the language at the same time.</p>
      </header>

      <section className="home-tab__section">
        <h2 className="home-tab__section-title">Account</h2>

        {!configured ? (
          <p className="home-tab__hint">
            Cloud not configured — copy <code>app/.env.example</code> to <code>app/.env.local</code> to
            enable sign-in, the song catalog, and saving your own songs. The app still works without
            it, using local files only.
          </p>
        ) : !ready ? (
          <p className="home-tab__hint">Loading…</p>
        ) : (
          <>
            <AuthPanel
              user={user}
              onSignIn={auth.signIn}
              onSignUp={auth.signUp}
              onSignOut={auth.signOut}
              onSignInWith={auth.signInWith}
            />
            <p className="home-tab__hint">
              {user
                ? 'You can browse the online catalog and save songs to your library.'
                : 'Sign in to search the online catalog and keep your own songs.'}
            </p>
          </>
        )}
      </section>

      <section className="home-tab__section">
        <h2 className="home-tab__section-title">Start practising</h2>
        <div className="home-tab__links">
          <button type="button" className="home-tab__link" onClick={() => onNavigate('vocal')}>
            <span className="home-tab__link-icon" aria-hidden="true">🎤</span>
            <span>
              <strong>Vocal</strong>
              <small>Sheet music, playback, and recording</small>
            </span>
          </button>
          <button type="button" className="home-tab__link" onClick={() => onNavigate('guitar')}>
            <span className="home-tab__link-icon" aria-hidden="true">🎸</span>
            <span>
              <strong>Guitar</strong>
              <small>Coming soon</small>
            </span>
          </button>
        </div>
      </section>
    </div>
  )
}

export default HomeTab
