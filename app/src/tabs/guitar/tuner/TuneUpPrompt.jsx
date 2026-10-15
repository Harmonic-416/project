import './TuneUpPrompt.css'

/**
 * "Tune first?" (F39): a banner above Songs, where the mic scores you, until
 * the guitar has been tuned this session, or when the notes played start
 * sounding out of tune (`drift`, cents; negative = flat). It never blocks:
 * Not now hides it for the session.
 */
function TuneUpPrompt({ drift = null, onTune, onDismiss }) {
  const text =
    drift === null
      ? 'Tune first? An out-of-tune guitar makes right chords sound wrong.'
      : `Your guitar sounds about ${Math.round(Math.abs(drift))}¢ ${drift < 0 ? 'flat' : 'sharp'} — retune?`

  return (
    <div className="tune-up-prompt" role="status">
      <span className="tune-up-prompt__icon" aria-hidden="true">
        ♮
      </span>
      <p className="tune-up-prompt__text">{text}</p>
      <div className="tune-up-prompt__actions">
        <button type="button" className="tune-up-prompt__tune" onClick={onTune}>
          Tune now
        </button>
        <button type="button" className="tune-up-prompt__dismiss" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  )
}

export default TuneUpPrompt
