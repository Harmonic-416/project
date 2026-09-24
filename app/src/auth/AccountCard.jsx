import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import Avatar from './Avatar.jsx'
import ProviderIcon from './ProviderIcon.jsx'
import { PROVIDERS, displayNameFor, friendlyAuthError, linkedProviders, providerName } from './authHelpers.js'
import './AccountCard.css'

/**
 * Shown on Home while signed in: who you are, which sign-in options are
 * attached to this account, and Sign out.
 *
 * "Connect" links a second provider to the SAME Supabase user
 * (supabase.auth.linkIdentity), so one person signing in with both Google
 * and GitHub under different emails still has one account, not two.
 * Needs "Allow manual linking" on in Supabase → Authentication.
 */
function AccountCard({ user, onSignOut, notice }) {
  // The session's copy of the user can be older than the last link, so ask
  // Supabase for the current identities once when the card opens.
  const [freshUser, setFreshUser] = useState(null)
  const [pending, setPending] = useState(null) // 'google' | 'github' | 'signout'
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase?.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user) setFreshUser(data.user)
    })
    return () => {
      cancelled = true
    }
  }, [user.id])

  const current = freshUser ?? user
  const linked = linkedProviders(current)

  // Like signing in, a successful link leaves for the provider and comes back.
  const connect = async (provider) => {
    setPending(provider)
    setError(null)
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: window.location.origin },
    })
    if (linkError) {
      setError(friendlyAuthError(linkError))
      setPending(null)
    }
  }

  const signOut = async () => {
    setPending('signout')
    setError(null)
    try {
      await onSignOut()
    } catch (err) {
      setError(friendlyAuthError(err))
      setPending(null)
    }
  }

  const message = error ?? notice

  return (
    <div className="account-card">
      <div className="account-card__who">
        <Avatar user={current} size={56} />
        <div className="account-card__names">
          <strong className="account-card__name">{displayNameFor(current)}</strong>
          <span className="account-card__email">{current.email}</span>
        </div>
      </div>

      <div className="account-card__methods">
        <h4 className="account-card__label">Sign-in methods</h4>
        <ul className="account-card__list">
          {PROVIDERS.map((provider) => {
            const email = linked[provider]
            return (
              <li key={provider} className="account-card__method">
                <span className={`account-card__icon account-card__icon--${provider}`}>
                  <ProviderIcon provider={provider} />
                </span>
                <span className="account-card__method-text">
                  <span>{providerName(provider)}</span>
                  {email !== null && <small>{email || 'Connected'}</small>}
                </span>
                {email !== null ? (
                  <span className="account-card__status">Connected</span>
                ) : (
                  <button
                    type="button"
                    className="account-card__connect"
                    disabled={pending !== null}
                    onClick={() => connect(provider)}
                  >
                    {pending === provider ? 'Opening…' : 'Connect'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <p className="account-card__hint">Connect both to sign in either way and keep one account.</p>
      </div>

      {message && (
        <p className="account-card__error" role="alert">
          {message}
        </p>
      )}

      <button type="button" className="account-card__signout" disabled={pending !== null} onClick={signOut}>
        {pending === 'signout' ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  )
}

export default AccountCard