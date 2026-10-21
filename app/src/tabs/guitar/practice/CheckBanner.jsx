import './CheckBanner.css'

/**
 * The bar under the lesson: did we hear the chord? (F16, F21, F34) and the
 * always-visible Hint / Skip / Retry buttons (F30, F31). When the chord is
 * verified, Retry becomes Next (or `nextLabel`, e.g. "Practice"). `extra`
 * names notes heard that the chord doesn't have ("an extra G"). While the
 * Hint rings, tapping it again plays each string on its own.
 */
function CheckBanner({ chord, verdict, misses, extra, hinting, onHint, onSkip, onRetry, onNext, nextLabel = 'Next' }) {
  const message = {
    listening: { icon: '♪', text: `Play ${chord.name}` },
    verified: { icon: '✓', text: `${chord.name} — heard it` },
    wrong: { icon: '✕', text: `Heard something else${extra ? ` (${extra})` : ''} · ${misses} ${misses === 1 ? 'try' : 'tries'}` },
    silent: { icon: '…', text: 'Couldn’t hear you — play a little louder' },
  }[verdict]

  return (
    <div className={`check-banner check-banner--${verdict}`}>
      <p className="check-banner__status" role="status" aria-live="polite">
        <span className="check-banner__icon" aria-hidden="true">
          {message.icon}
        </span>
        {message.text}
      </p>
      <div className="check-banner__actions">
        <button type="button" onClick={onHint}>
          {hinting ? 'Each string' : 'Hint'}
        </button>
        <button type="button" onClick={onSkip}>
          Skip
        </button>
        {verdict === 'verified' ? (
          <button type="button" className="check-banner__primary" onClick={onNext}>
            {nextLabel}
          </button>
        ) : (
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

export default CheckBanner