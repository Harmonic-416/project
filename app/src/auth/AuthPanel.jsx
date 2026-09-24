import { useState } from 'react'
import { PROVIDERS, friendlyAuthError, providerName } from './authHelpers.js'
import ProviderIcon from './ProviderIcon.jsx'
import './AuthPanel.css'

/**
 * Sign-in card shown on Home while signed out: Google and GitHub only.
 * The buttons follow Google's "Sign in with Google" branding guidelines
 * (white button, grey outline, official G) and GitHub's dark mark button.
 *
 * Email + password still exists in the backend layer (src/lib/auth.ts, used
 * by the integration tests); the app just doesn't offer it.
 *
 * `notice` is an error handed in by HomeTab when a sign-in bounced back.
 */
function AuthPanel({ onSignInWith, notice }) {
  const [pending, setPending] = useState(null) // provider we're leaving for
  const [error, setError] = useState(null)

  // On success the browser leaves for Google / GitHub, so the button stays
  // on "Opening…" on purpose. It only resets if the request itself fails.
  const start = async (provider) => {
    setPending(provider)
    setError(null)
    try {
      await onSignInWith(provider)
    } catch (err) {
      setError(friendlyAuthError(err))
      setPending(null)
    }
  }

  const message = error ?? notice

  return (
    <div className="auth-card">
      <h3 className="auth-card__title">Sign in</h3>
      <p className="auth-card__text">Use your Google or GitHub account. Harmonic never sees your password.</p>

      <div className="auth-card__buttons">
        {PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            className={`oauth-button oauth-button--${provider}`}
            disabled={pending !== null}
            onClick={() => start(provider)}
          >
            <ProviderIcon provider={provider} />
            <span>{pending === provider ? 'Opening…' : `Continue with ${providerName(provider)}`}</span>
          </button>
        ))}
      </div>

      {message && (
        <p className="auth-card__error" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}

export default AuthPanel