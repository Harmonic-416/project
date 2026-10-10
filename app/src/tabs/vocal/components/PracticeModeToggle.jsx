import './PracticeModes.css'
import { PRACTICE_MODES } from '../practice/practiceLogic.js'

/**
 * Segmented control for how Play behaves: plain playback, wait-for-me, or trouble spots.
 * `modes` defaults to the Vocal tab's wording; Guitar passes its own.
 */
function PracticeModeToggle({ mode, onChange, disabled, modes = PRACTICE_MODES }) {
  const current = modes.find((m) => m.id === mode)
  return (
    <div className="practice-modes">
      <div className="practice-modes__options" role="group" aria-label="Practice mode">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            className="practice-modes__option"
            aria-pressed={m.id === mode}
            disabled={disabled || m.disabled}
            onClick={() => onChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {current && <span className="practice-modes__hint">{current.hint}</span>}
    </div>
  )
}

export default PracticeModeToggle
