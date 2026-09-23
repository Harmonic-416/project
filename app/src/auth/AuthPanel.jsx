import { useState } from 'react'
import './AuthPanel.css'

// Providers must also be enabled in the Supabase dashboard (Auth → Providers)
// with this deployment's URL allowlisted; until then the redirect comes back
// with an error and the message below surfaces it.
const PROVIDERS = [
  {
    id: 'google',
    label: 'Continue with Google',
    icon: (
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        />
      </svg>
    ),
  },
  {
    id: 'github',
    label: 'Continue with GitHub',
    icon: (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"
        />
      </svg>
    ),
  },
]

function AuthPanel({ user, onSignIn, onSignUp, onSignOut, onSignInWith }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action(email, password)
      setPassword('')
    } catch (err) {
      setError(err.message || 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  // Stays busy on success: the page is navigating to the provider, so there is
  // no point re-enabling the buttons behind the redirect.
  const runProvider = async (provider) => {
    setBusy(true)
    setError(null)
    try {
      await onSignInWith(provider)
    } catch (err) {
      setError(err.message || 'Could not start that sign-in.')
      setBusy(false)
    }
  }

  if (user) {
    return (
      <div className="auth-panel auth-panel--signed-in">
        <span className="auth-panel__who">
          Signed in as <strong>{user.email}</strong>
        </span>
        <button type="button" className="auth-panel__button auth-panel__button--secondary" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="auth-panel-stack">
      {onSignInWith && (
        <>
          <div className="auth-panel__providers">
            {PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={`auth-panel__provider auth-panel__provider--${provider.id}`}
                disabled={busy}
                onClick={() => runProvider(provider.id)}
              >
                <span className="auth-panel__provider-icon">{provider.icon}</span>
                {provider.label}
              </button>
            ))}
          </div>
          <div className="auth-panel__divider">
            <span>or</span>
          </div>
        </>
      )}

      <form
        className="auth-panel"
        onSubmit={(event) => {
          event.preventDefault()
          run(onSignIn)
        }}
      >
        <input
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password (6+ characters)"
          autoComplete="current-password"
          value={password}
          minLength={6}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button type="submit" className="auth-panel__button" disabled={busy}>
          Sign in
        </button>
        <button
          type="button"
          className="auth-panel__button auth-panel__button--secondary"
          disabled={busy}
          onClick={() => run(onSignUp)}
        >
          Create account
        </button>
        {error && <p className="auth-panel__error">{error}</p>}
      </form>
    </div>
  )
}

export default AuthPanel
