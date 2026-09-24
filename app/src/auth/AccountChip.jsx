import Avatar from './Avatar.jsx'
import { firstNameFor } from './authHelpers.js'
import './AccountChip.css'

/**
 * Small account button for the top of an instrument tab: your picture and
 * first name when signed in, "Sign in" when not. Either way it opens Home,
 * where the account lives. Renders nothing when sign-in isn't set up.
 */
function AccountChip({ auth, onNavigate }) {
  if (!auth?.configured || !auth.ready) return null

  return (
    <button
      type="button"
      className="account-chip"
      onClick={() => onNavigate('home')}
      aria-label={auth.user ? `Account: ${auth.user.email}` : 'Sign in'}
    >
      {auth.user ? (
        <>
          <Avatar user={auth.user} size={24} />
          <span className="account-chip__name">{firstNameFor(auth.user)}</span>
        </>
      ) : (
        <span className="account-chip__name">Sign in</span>
      )}
    </button>
  )
}

export default AccountChip