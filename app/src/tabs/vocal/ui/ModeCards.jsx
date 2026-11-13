import { PRACTICE_MODES } from '../practice/practiceLogic.js'
import { sfx } from '../feedback/sfx.js'
import './songScreen.css'

const ICONS = { listen: '🎧', wait: '⏸️', trouble: '🎯' }
const BLURBS = { listen: 'Play along, then record', wait: 'It waits for your note', trouble: 'Find the hard bits' }

/** The three ways to practise a song, as big cards (Vocal's take on PracticeModeToggle). */
export default function ModeCards({ mode, onChange, disabled }) {
  const current = PRACTICE_MODES.find((m) => m.id === mode)
  return (
    <div className="v-modes-wrap">
      <div className="v-modes" role="group" aria-label="Practice mode">
        {PRACTICE_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`v-modes__card v-modes__card--${m.id}`}
            aria-pressed={m.id === mode}
            title={m.hint}
            disabled={disabled}
            onClick={() => {
              if (m.id !== mode) sfx.tap()
              onChange(m.id)
            }}
          >
            <span className="v-modes__icon" aria-hidden="true">
              {ICONS[m.id]}
            </span>
            <strong>{m.label}</strong>
            <small>{BLURBS[m.id]}</small>
          </button>
        ))}
      </div>
      {current && <p className="v-modes__hint">{current.hint}</p>}
    </div>
  )
}
