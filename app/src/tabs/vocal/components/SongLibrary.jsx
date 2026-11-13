import './SongLibrary.css'

/** A stable hue per title, for the song card's colour (Vocal shows it as a gradient cover). */
const hueFor = (title) => [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

function SongLibrary({ songs, onSelectSong }) {
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
            <span className="song-library__icon" aria-hidden="true">🎵</span>
            <span>{song.title}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default SongLibrary
