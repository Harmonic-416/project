import './ShareAttempt.css'
import NotationUploader from './NotationUploader.jsx'

const FORMAT_LABEL = { midi: 'MIDI', musicxml: 'MusicXML', mxl: 'MXL' }

/**
 * What a shared-attempt link shows before the score can open: sign in first,
 * then (for a song that isn't in the catalog) open your own copy of the file.
 * `shared` is VocalTab's shared-attempt state.
 */
function SharedAttemptGate({ shared, onNavigateHome, onFileSelected, onOpenAnyway, onClose }) {
  const { phase, attempt, error } = shared
  const song = attempt ? `${attempt.song_title}${attempt.song_format ? ` (${FORMAT_LABEL[attempt.song_format]})` : ''}` : ''

  return (
    <div className="shared-gate">
      <h2>Shared attempt</h2>

      {phase === 'signin' && (
        <>
          <p>Sign in to open attempts people share with you.</p>
          <button type="button" className="share-attempt__button" onClick={onNavigateHome}>
            Go to Home to sign in
          </button>
        </>
      )}

      {phase === 'loading' && <p>Opening…</p>}

      {(phase === 'need-file' || phase === 'mismatch') && (
        <>
          <p>
            <strong>{attempt.sharer_name || 'Someone'}</strong> sang {song}. The song isn’t stored online, so open
            your own copy of the same file to see their attempt on it.
          </p>
          {phase === 'mismatch' && (
            <p className="shared-gate__warning">
              That file isn’t the same as theirs, so the dots may not line up with the notes.
            </p>
          )}
          <NotationUploader onFileSelected={onFileSelected} disabled={false} />
          {phase === 'mismatch' && (
            <button type="button" className="share-attempt__button" onClick={onOpenAnyway}>
              Open it anyway
            </button>
          )}
        </>
      )}

      {phase === 'error' && <p className="share-attempt__error">{error}</p>}

      <button type="button" className="vocal-tab__back" onClick={onClose}>
        ← Songs
      </button>
    </div>
  )
}

export default SharedAttemptGate
