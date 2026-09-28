import './PracticeModes.css'
import { PRACTICE_MODES } from '../practice/practiceLogic.js'

/** Segmented control for how Play behaves: plain playback, wait-for-me, or trouble spots. */
function PracticeModeToggle({ mode, onChange, disabled }) {
  const current = PRACTICE_MODES.find((m) => m.id === mode)
  return (
    <div className="practice-modes">
      <div className="practice-modes__options" role="group" aria-label="Practice mode">
        {PRACTICE_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="practice-modes__option"
            aria-pressed={m.id === mode}
            disabled={disabled}
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
