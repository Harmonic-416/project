import GuitarFeedback from '../practice/GuitarFeedback.jsx'
import '../../vocal/components/SongLibrary.css'
import './TranscribePanel.css'

const savedOn = (time) => new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Drafts transcribed on this device (song/drafts.js), the latest first: open or delete. */
function MyTranscriptions({ drafts, onOpen, onDelete, onCreate, phase = 'ready', error = null, onRetry, deleting = null }) {
  return (
    <section className="my-transcriptions" aria-label="My transcriptions">
      <h3>My transcriptions</h3>
      {phase === 'loading' && <GuitarFeedback>Loading your transcription drafts...</GuitarFeedback>}
      {error && <GuitarFeedback kind="error" onRetry={onRetry}> {error}</GuitarFeedback>}
      {phase === 'unavailable' && <GuitarFeedback kind="empty">This browser cannot keep transcription drafts. You can still tab a song; export its score before leaving to keep your work.</GuitarFeedback>}
      {!drafts.length && phase === 'ready' && !error && <GuitarFeedback kind="empty" onRetry={onCreate} retryLabel="Tab a song">Guitar tabs you create from recordings will appear here. Choose a song recording to make your first draft.</GuitarFeedback>}
      {drafts.length > 0 && <ul className="song-library">
        {drafts.map((draft) => (
          <li key={draft.id} className="my-transcriptions__row">
            <button type="button" className="song-library__item" disabled={deleting !== null} onClick={() => onOpen(draft)}>
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
              disabled={deleting !== null}
              onClick={() => onDelete(draft)}
            >
              {deleting === draft.id ? 'Deleting...' : 'Delete'}
            </button>
          </li>
        ))}
      </ul>}
    </section>
  )
}

export default MyTranscriptions
