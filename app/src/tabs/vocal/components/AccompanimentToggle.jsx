import './PracticeModes.css'
import { ACCOMPANIMENTS } from '../practice/practiceLogic.js'

/**
 * "By myself" / "With all parts", for scores with several parts. The hint depends on the practice mode.
 * `options` defaults to the Vocal tab's wording; Guitar passes its own.
 */
function AccompanimentToggle({ value, mode, onChange, disabled, options = ACCOMPANIMENTS }) {
  const current = options.find((a) => a.id === value)
  return (
    <div className="practice-modes">
      <div className="practice-modes__options" role="group" aria-label="Practise with">
        {options.map((a) => (
          <button
            key={a.id}
            type="button"
            className="practice-modes__option"
            aria-pressed={a.id === value}
            disabled={disabled}
            onClick={() => onChange(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <span className="practice-modes__hint">{current?.hint[mode]}</span>
    </div>
  )
}

export default AccompanimentToggle
