import '../../vocal/components/SongLibrary.css'
import './TranscribePanel.css'

const savedOn = (time) => new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Drafts transcribed on this device (song/drafts.js), the latest first: open or delete. */
function MyTranscriptions({ drafts, onOpen, onDelete }) {
  if (!drafts.length) return null
  return (
    <section className="my-transcriptions" aria-label="My transcriptions">
      <h3>My transcriptions</h3>
      <ul className="song-library">
        {drafts.map((draft) => (
          <li key={draft.id} className="my-transcriptions__row">
            <button type="button" className="song-library__item" onClick={() => onOpen(draft)}>
              <span className="song-library__icon" aria-hidden="true">
                🎙️
              </span>
              <span>
                <span>{draft.title}</span>
                <small>Draft · {savedOn(draft.updated)}</small>
              </span>
            </button>
            <button
              type="button"
              className="my-transcriptions__delete"
              aria-label={`Delete ${draft.title}`}
              onClick={() => onDelete(draft)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default MyTranscriptions
