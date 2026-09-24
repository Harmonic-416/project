/**
 * Small helpers for the sign-in screens. No React and no Supabase in here,
 * so they are easy to unit-test (app/tests/authHelpers.test.js).
 */

/** The sign-in options the app offers, in the order they are shown. */
export const PROVIDERS = ['google', 'github']

const PROVIDER_NAMES = { google: 'Google', github: 'GitHub', email: 'Email' }

export function providerName(provider) {
  return PROVIDER_NAMES[provider] ?? provider
}

/** Name to show for the user: from Google/GitHub, else the part of the email before "@". */
export function displayNameFor(user) {
  const meta = user?.user_metadata ?? {}
  const name = (meta.full_name || meta.name || meta.user_name || '').trim()
  if (name) return name
  return user?.email?.split('@')[0] ?? ''
}

export function firstNameFor(user) {
  return displayNameFor(user).split(/\s+/)[0]
}

/** Profile picture from Google or GitHub, or null (then initials are shown). */
export function avatarUrlFor(user) {
  const meta = user?.user_metadata ?? {}
  return meta.avatar_url || meta.picture || null
}

/** "Ahmad Arsalan" -> "AA", "ahmad" -> "AH", "" -> "?". */
export function initialsFor(name = '') {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Which sign-in options are attached to this one account, e.g.
 * { google: 'me@gmail.com', github: null }. Supabase keeps one "identity" per
 * provider on the user; linking a second provider adds a second identity to
 * the SAME user instead of creating a duplicate account.
 */
export function linkedProviders(user) {
  const linked = Object.fromEntries(PROVIDERS.map((provider) => [provider, null]))
  for (const identity of user?.identities ?? []) {
    if (identity.provider in linked) {
      linked[identity.provider] = identity.identity_data?.email || identity.email || ''
    }
  }
  return linked
}

// Raw messages from Supabase / Google / GitHub -> plain language.
const FRIENDLY_ERRORS = [
  [/already linked|identity_already_exists/i, 'That account is already used by a different Harmonic account, so it can’t be connected here.'],
  [/manual linking is disabled|manual_linking_disabled/i, 'Connecting a second sign-in option is switched off in Supabase.'],
  [/provider is not enabled|unsupported provider|provider_disabled/i, 'That sign-in option isn’t switched on yet. Try the other one.'],
  [/access_denied|access denied|denied/i, 'Sign-in was cancelled. Try again whenever you’re ready.'],
  [/org_internal|admin_policy|not a test user/i, 'This Google account isn’t allowed yet. Ask the team to add it as a test user.'],
  [/failed to fetch|networkerror|load failed/i, 'Can’t reach the server. Check your connection and try again.'],
]

export function friendlyAuthError(error) {
  const text = typeof error === 'string' ? error : [error?.code, error?.message].filter(Boolean).join(' ')
  for (const [pattern, friendly] of FRIENDLY_ERRORS) {
    if (pattern.test(text)) return friendly
  }
  return text || 'Something went wrong while signing in. Please try again.'
}

/**
 * When a sign-in fails, the browser comes back to the app with
 * `error_description` (or `error`) in the address, after "?" or "#".
 * Returns that text, or null when the address has no error in it.
 */
export function readOAuthError(href) {
  let url
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  for (const params of [url.searchParams, hash]) {
    const error = params.get('error_description') || params.get('error')
    if (error) return error
  }
  return null
}