import './PracticeModes.css'

/** "Lyrics" / "Solfège" under the score: what's written under the notes, and where do is. */
function SolfegeToggle({ on, doName, onChange, disabled }) {
  return (
    <div className="practice-modes">
      <div className="practice-modes__options" role="group" aria-label="Under the notes">
        <button
          type="button"
          className="practice-modes__option"
          aria-pressed={!on}
          disabled={disabled}
          onClick={() => onChange(false)}
        >
          Lyrics
        </button>
        <button
          type="button"
          className="practice-modes__option"
          aria-pressed={on}
          disabled={disabled}
          onClick={() => onChange(true)}
        >
          Solfège
        </button>
      </div>
      <span className="practice-modes__hint">
        {on && doName ? `Do is ${doName}. In a minor key, home is la.` : 'Show do re mi under the notes'}
      </span>
    </div>
  )
}

export default SolfegeToggle
