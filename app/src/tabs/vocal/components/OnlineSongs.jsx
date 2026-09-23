import { useEffect, useMemo, useState } from 'react'
import './SongLibrary.css'
import './OnlineSongs.css'
import { fetchCloudSongs } from '../songs/cloudLibrary.js'
import { filterSongs } from '../songs/searchSongs.js'

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
 * Browse the songs stored in Supabase: the shared catalog (seed songs) and the
 * signed-in user's own saved songs, filtered by a search box. Sign-in itself
 * lives on the Home tab — this component only reads `user` to decide between
 * the lists and the "sign in first" prompt.
 */
function OnlineSongs({ user, configured, ready, supabase, onSelectSong, onNavigateHome }) {
  const userId = user?.id ?? null
  const [query, setQuery] = useState('')
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
        if (!cancelled) setResult({ forUser: userId, error: err.message || 'Could not load the song catalog.' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  const current = result?.forUser === userId ? result : null
  const catalog = useMemo(
    () => filterSongs(current?.songs?.filter((item) => item.isSeed), query),
    [current, query],
  )
  const mine = useMemo(
    () => filterSongs(current?.songs?.filter((item) => !item.isSeed), query),
    [current, query],
  )

  if (!configured) {
    return (
      <p className="online-songs__hint">
        Cloud not configured — copy <code>app/.env.example</code> to <code>app/.env.local</code> to
        enable the online catalog.
      </p>
    )
  }

  if (!ready) {
    return <p className="online-songs__hint">Loading…</p>
  }

  if (!user) {
    return (
      <div className="online-songs__empty">
        <p className="online-songs__hint">Sign in to search the online catalog and your saved songs.</p>
        <button type="button" className="online-songs__cta" onClick={onNavigateHome}>
          Go to Home to sign in
        </button>
      </div>
    )
  }

  return (
    <div className="online-songs">
      <input
        type="search"
        className="online-songs__search"
        placeholder="Search by title or artist…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
      />

      {!current && <p className="online-songs__hint">Loading…</p>}
      {current?.error && <p className="online-songs__error">{current.error}</p>}

      {current?.songs && (
        <>
          <h3 className="online-songs__group">Catalog</h3>
          {catalog.length === 0 ? (
            <p className="online-songs__hint">
              {query.trim() ? 'No catalog songs match that search.' : 'The catalog is empty.'}
            </p>
          ) : (
            <SongList items={catalog} onSelectSong={onSelectSong} icon="☁️" />
          )}

          <h3 className="online-songs__group">My songs</h3>
          {mine.length === 0 ? (
            <p className="online-songs__hint">
              {query.trim()
                ? 'None of your songs match that search.'
                : 'Nothing saved yet — open a catalog song or a file and press “Save to cloud”.'}
            </p>
          ) : (
            <SongList items={mine} onSelectSong={onSelectSong} icon="🎵" />
          )}
        </>
      )}
    </div>
  )
}

export default OnlineSongs
