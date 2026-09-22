import './SongLibrary.css'

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
          <button type="button" className="song-library__item" onClick={() => onSelectSong(song)}>
            <span className="song-library__icon" aria-hidden="true">🎵</span>
            <span>{song.title}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default SongLibrary
