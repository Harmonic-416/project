import { useState } from 'react'
import './AuthPanel.css'

function AuthPanel({ user, onSignIn, onSignUp, onSignOut }) {
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
  )
}

export default AuthPanel
