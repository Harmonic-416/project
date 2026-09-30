import './PracticeModes.css'

const OPTIONS = [
  { id: false, label: 'Speaker' },
  { id: true, label: 'Headphones' },
]

/**
 * What the device plays through, for the mic-scored modes. On the speaker
 * the mic hears the device too, so your own part is muted while you're
 * scored and the device's notes are filtered out (practice/deviceBleed.js).
 */
function HeadphonesToggle({ value, onChange, disabled }) {
  return (
    <div className="practice-modes">
      <div className="practice-modes__options" role="group" aria-label="Listening on">
        {OPTIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            className="practice-modes__option"
            aria-pressed={o.id === value}
            disabled={disabled}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="practice-modes__hint">
        {value
          ? 'Your part plays along while you sing.'
          : 'Your part stays silent while the mic scores you, and the device’s own notes are ignored.'}
      </span>
    </div>
  )
}

export default HeadphonesToggle
