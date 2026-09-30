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
 * Browse the shared song catalog (public-domain songs the team curates in
 * Supabase), filtered by a search box. No sign-in needed: the catalog is
 * public, and the app doesn't store anyone's own songs in the cloud.
 */
function OnlineSongs({ configured, supabase, onSelectSong }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null) // { songs } | { error }

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false
    fetchCloudSongs(supabase).then(
      (songs) => {
        if (!cancelled) setResult({ songs })
      },
      (err) => {
        console.error(err)
        if (!cancelled) setResult({ error: err.message || 'Could not load the song catalog.' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [supabase])

  const catalog = useMemo(() => filterSongs(result?.songs, query), [result, query])

  if (!configured) {
    return (
      <p className="online-songs__hint">
        Cloud not configured — copy <code>app/.env.example</code> to <code>app/.env.local</code> to
        enable the online catalog.
      </p>
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

      {!result && <p className="online-songs__hint">Loading…</p>}
      {result?.error && <p className="online-songs__error">{result.error}</p>}

      {result?.songs && (
        <>
          <h3 className="online-songs__group">Catalog</h3>
          {catalog.length === 0 ? (
            <p className="online-songs__hint">
              {query.trim() ? 'No catalog songs match that search.' : 'The catalog is empty.'}
            </p>
          ) : (
            <SongList items={catalog} onSelectSong={onSelectSong} icon="☁️" />
          )}
        </>
      )}
    </div>
  )
}

export default OnlineSongs
