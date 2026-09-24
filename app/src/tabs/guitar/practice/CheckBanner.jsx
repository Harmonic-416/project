import { MAX_MISSES } from './practiceState.js'
import './CheckBanner.css'

/**
 * The bar under the lesson: did we hear the chord? (F16, F21, F34) and the
 * always-visible Hint / Skip / Retry buttons (F30, F31). When the chord is
 * verified, Retry becomes Next.
 */
function CheckBanner({ chord, verdict, misses, hinting, onHint, onSkip, onRetry, onNext }) {
  const message = {
    listening: { icon: '♪', text: `Play ${chord.name}` },
    verified: { icon: '✓', text: `${chord.name} — heard it` },
    wrong: { icon: '✕', text: `Heard something else · try ${misses} of ${MAX_MISSES}` },
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
        <button type="button" onClick={onHint} disabled={hinting}>
          {hinting ? 'Playing…' : 'Hint'}
        </button>
        <button type="button" onClick={onSkip}>
          Skip
        </button>
        {verdict === 'verified' ? (
          <button type="button" className="check-banner__primary" onClick={onNext}>
            Next
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