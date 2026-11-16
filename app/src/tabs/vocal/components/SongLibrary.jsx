import { Music } from 'lucide-react'
import './SongLibrary.css'

/** A stable hue per title, for the song card's colour (Vocal shows it as a gradient cover). */
const hueFor = (title) => [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

/**
 * The built-in songs as cards. `renderMeta(song)` (optional; Vocal passes
 * SongCardMeta) adds a line of facts under the title — Guitar leaves it out.
 */
function SongLibrary({ songs, onSelectSong, renderMeta = null }) {
  if (songs.length === 0) {
    return (
      <p className="song-library__empty">
        No songs yet — drop .mid/.midi files into <code>midi-files/</code> to see them here.
      </p>
    )
  }

  return (
    <ul className="song-library">
      {songs.map((song) => (
        <li key={song.id}>
          <button
            type="button"
            className="song-library__item"
            style={{ '--hue': hueFor(song.title) }}
            onClick={() => onSelectSong(song)}
          >
            <span className="song-library__icon" aria-hidden="true"><Music size="1.1em" aria-hidden="true" /></span>
            {renderMeta ? (
              <span className="song-library__body">
                <span className="song-library__title">{song.title}</span>
                {renderMeta(song)}
              </span>
            ) : (
              <span>{song.title}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

export default SongLibrary
