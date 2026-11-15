import './PracticeModes.css'
import { ACCOMPANIMENTS } from '../practice/practiceLogic.js'

/**
 * "By myself" / "With all parts", for scores with several parts. The hint depends on the practice mode
 * (or is one string, as in Vocal's Listen ladder, LISTEN_MIXES). `options` defaults to the Vocal tab's
 * two-way wording; Guitar passes its own. A value these options don't list (a Listen-only rung such as
 * "My part louder", seen from Wait for me) reads as the "with others" option.
 */
function AccompanimentToggle({ value, mode, onChange, disabled, options = ACCOMPANIMENTS }) {
  const shown = options.some((a) => a.id === value) ? value : value === 'solo' ? 'solo' : options[options.length - 1].id
  const current = options.find((a) => a.id === shown)
  const hint = typeof current?.hint === 'string' ? current.hint : current?.hint[mode]
  return (
    <div className="practice-modes">
      <div className="practice-modes__options" role="group" aria-label="Practise with">
        {options.map((a) => (
          <button
            key={a.id}
            type="button"
            className="practice-modes__option"
            aria-pressed={a.id === shown}
            disabled={disabled}
            onClick={() => onChange(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <span className="practice-modes__hint">{hint}</span>
    </div>
  )
}

export default AccompanimentToggle
