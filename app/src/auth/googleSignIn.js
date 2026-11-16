/**
 * Google sign-in that comes straight back to Harmonic.
 *
 * The usual Supabase route sends the browser to Google and back through
 * <project>.supabase.co, so Google's page says "to continue to
 * …supabase.co". Here the browser goes to Google and returns to this site
 * with a signed ID token, which is then handed to Supabase
 * (signInWithIdToken). Google's page names this site instead.
 *
 * Only used when VITE_GOOGLE_CLIENT_ID is set; without it the app keeps the
 * Supabase route. The address `${origin}/` must be listed under "Authorised
 * redirect URIs" on that client in Google Cloud (see app/README.md).
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const STORAGE_KEY = 'harmonic.googleSignIn'

export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

/** The Google address to send the browser to. */
export function buildGoogleAuthUrl({ clientId, redirectUri, hashedNonce, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: hashedNonce,
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params}`
}

/**
 * Google returns to the app with `#id_token=…&state=…`. Returns those two,
 * or null when the address is not such a return (a failed one carries
 * `error` instead, which readOAuthError in authHelpers.js picks up).
 */
export function readGoogleCallback(href) {
  let url
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const idToken = hash.get('id_token')
  if (!idToken) return null
  return { idToken, state: hash.get('state') ?? '' }
}

function randomText() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Google gets the SHA-256 of the nonce; Supabase gets the nonce itself. */
export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Leave for Google. `intent` is 'signin', or 'link' to add Google to the
 * account that is signed in now.
 */
export async function startGoogleSignIn(intent = 'signin') {
  const nonce = randomText()
  const state = randomText()
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ nonce, state, intent }))
  window.location.assign(
    buildGoogleAuthUrl({
      clientId: googleClientId,
      redirectUri: `${window.location.origin}/`,
      hashedNonce: await sha256Hex(nonce),
      state,
    }),
  )
}

/**
 * Call once when the app loads. If the address is a return from Google,
 * takes the token out of the address and signs in (or links) with it.
 * Does nothing otherwise. Throws when the sign-in cannot be completed.
 */
export async function finishGoogleSignIn(supabase) {
  const callback = readGoogleCallback(window.location.href)
  if (!callback) return

  let saved = null
  try {
    saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY))
  } catch {
    saved = null
  }
  sessionStorage.removeItem(STORAGE_KEY)
  window.history.replaceState(null, '', window.location.pathname)

  if (!saved || saved.state !== callback.state) {
    throw new Error('Google sign-in could not be completed. Please try again.')
  }

  const credentials = { provider: 'google', token: callback.idToken, nonce: saved.nonce }
  const { error } =
    saved.intent === 'link'
      ? await supabase.auth.linkIdentity(credentials)
      : await supabase.auth.signInWithIdToken(credentials)
  if (error) throw error
}
