import './PracticeModes.css'
import { ACCOMPANIMENTS } from '../practice/practiceLogic.js'

/** "By myself" / "With all parts", for scores with several parts. The hint depends on the practice mode. */
function AccompanimentToggle({ value, mode, onChange, disabled }) {
  const current = ACCOMPANIMENTS.find((a) => a.id === value)
  return (
    <div className="practice-modes">
      <div className="practice-modes__options" role="group" aria-label="Practise with">
        {ACCOMPANIMENTS.map((a) => (
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
      <span className="practice-modes__hint">
        {current?.hint[mode]}
        {value === 'all' && mode === 'wait' && ' Use headphones so the mic only hears you.'}
      </span>
    </div>
  )
}

export default AccompanimentToggle
