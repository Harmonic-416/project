import '../../../vocal/components/PracticeModes.css'

const VERSIONS = [
  { id: 'full', label: 'Full', hint: 'Every note and chord is scored.' },
  {
    id: 'easy',
    label: 'Easy',
    hint: 'Only the first note or strum of each bar, and each chord change, is scored. The rest turn grey.',
  },
]

/** Full / Easy (F45): how much of the song the practice modes score (easyMode.js). */
function EasyToggle({ easy, onChange, disabled }) {
  const current = easy ? VERSIONS[1] : VERSIONS[0]
  return (
    <div className="practice-modes">
      <div className="practice-modes__options" role="group" aria-label="Version">
        {VERSIONS.map((v) => (
          <button
            key={v.id}
            type="button"
            className="practice-modes__option"
            aria-pressed={v === current}
            disabled={disabled}
            onClick={() => onChange(v.id === 'easy')}
          >
            {v.label}
          </button>
        ))}
      </div>
      <span className="practice-modes__hint">{current.hint}</span>
    </div>
  )
}

export default EasyToggle
