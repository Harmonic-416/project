import './PracticeModes.css'
import { doName } from '../notation/solfege.js'

/** The hint under the switch: where do is, and why when it was worked out from the notes. */
function hint(on, key) {
  if (!on) return 'Show solfège (do re mi) under the notes.'
  if (!key) return 'Do is the home note of each key; minor keys start on la.'
  if (key.inferred) return `Do is ${doName(key.fifths)}, worked out from the notes (the file’s key signature doesn’t match them).`
  return `Do is ${doName(key.fifths)}; minor keys start on la.`
}

/**
 * Solfège labels under the notes, on or off (remembered on this device).
 * The labels are movable do (notation/solfege.js); `solfegeKey` is the
 * key they're read in, from scoreKey.
 */
function SolfegeToggle({ on, solfegeKey, onChange, disabled }) {
  return (
    <div className="practice-modes">
      <div className="practice-modes__options" role="group" aria-label="Solfège labels">
        <button type="button" className="practice-modes__option" aria-pressed={!on} disabled={disabled} onClick={() => onChange(false)}>
          Notes only
        </button>
        <button type="button" className="practice-modes__option" aria-pressed={on} disabled={disabled} onClick={() => onChange(true)}>
          Do re mi
        </button>
      </div>
      <span className="practice-modes__hint">{hint(on, solfegeKey)}</span>
    </div>
  )
}

export default SolfegeToggle
