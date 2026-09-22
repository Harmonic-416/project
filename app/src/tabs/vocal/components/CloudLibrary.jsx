import { useEffect, useState } from 'react'
import './SongLibrary.css'
import './CloudLibrary.css'
import AuthPanel from '../../../auth/AuthPanel.jsx'
import { fetchCloudSongs } from '../songs/cloudLibrary.js'

function SongList({ items, onSelectSong, icon }) {
  return (
    <ul className="song-library">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="song-library__item"
            disabled={!item.available}
            title={item.available ? undefined : 'Notation file not uploaded to storage yet'}
            onClick={() => onSelectSong(item)}
          >
            <span className="song-library__icon" aria-hidden="true">
              {icon}
            </span>
            <span>
              {item.title}
              {item.artist ? ` — ${item.artist}` : ''}
              {item.available ? '' : ' (notation missing)'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Sign-in plus the two cloud lists: the shared catalog (seed songs) and the
 * user's own saved songs. Both come from the `song` table through the shared
 * backend layer; RLS decides what each user sees.
 */
function CloudLibrary({ auth, supabase, onSelectSong }) {
  const { user, configured, ready } = auth
  const userId = user?.id ?? null
  const [result, setResult] = useState(null) // { forUser, songs } | { forUser, error }

  useEffect(() => {
    if (!supabase || !userId) return undefined
    let cancelled = false
    fetchCloudSongs(supabase).then(
      (songs) => {
        if (!cancelled) setResult({ forUser: userId, songs })
      },
      (err) => {
        console.error(err)
        if (!cancelled) setResult({ forUser: userId, error: err.message || 'Could not load the cloud library.' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  if (!configured) {
    return (
      <section className="cloud-library">
        <h2>Cloud library</h2>
        <p className="cloud-library__hint">
          Not configured — copy <code>app/.env.example</code> to <code>app/.env.local</code> to enable
          sign-in, the song catalog, and saving to the cloud.
        </p>
      </section>
    )
  }

  const current = result?.forUser === userId ? result : null
  const catalog = current?.songs?.filter((item) => item.isSeed) ?? []
  const mine = current?.songs?.filter((item) => !item.isSeed) ?? []

  return (
    <section className="cloud-library">
      <h2>Cloud library</h2>
      {ready && <AuthPanel user={user} onSignIn={auth.signIn} onSignUp={auth.signUp} onSignOut={auth.signOut} />}
      {!user && ready && (
        <p className="cloud-library__hint">Sign in to browse the song catalog and keep your own songs.</p>
      )}
      {userId && !current && <p className="cloud-library__hint">Loading…</p>}
      {current?.error && <p className="cloud-library__error">{current.error}</p>}
      {current?.songs && (
        <>
          <h3>Catalog</h3>
          {catalog.length === 0 ? (
            <p className="cloud-library__hint">The catalog is empty.</p>
          ) : (
            <SongList items={catalog} onSelectSong={onSelectSong} icon="☁️" />
          )}
          <h3>My songs</h3>
          {mine.length === 0 ? (
            <p className="cloud-library__hint">
              Nothing saved yet — open a catalog song or a file and press “Save to cloud”.
            </p>
          ) : (
            <SongList items={mine} onSelectSong={onSelectSong} icon="🎵" />
          )}
        </>
      )}
    </section>
  )
}

export default CloudLibrary
