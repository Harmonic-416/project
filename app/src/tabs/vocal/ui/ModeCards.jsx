import { Headphones, Pause, Target } from 'lucide-react'
import { PRACTICE_MODES } from '../practice/practiceLogic.js'
import { sfx } from '../feedback/sfx.js'
import './songScreen.css'

const ICONS = { listen: Headphones, wait: Pause, trouble: Target }
const BLURBS = { listen: 'Sing along, get a score', wait: 'Waits for each note', trouble: 'Marks the notes you miss' }

/**
 * The three ways to practise a song, as one compact row (Vocal's take on
 * PracticeModeToggle): icon, name and a few words each, with the longer
 * hint on hover, so the score — not the mode picker — owns the screen.
 */
export default function ModeCards({ mode, onChange, disabled, modes = PRACTICE_MODES, playFeedback = true }) {
  return (
    <div className="v-modes-wrap">
      <div className="v-modes" role="group" aria-label="Practice mode">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`v-modes__card v-modes__card--${m.id}`}
            aria-pressed={m.id === mode}
            aria-label={m.label}
            title={m.hint}
            disabled={disabled || m.disabled}
            onClick={() => {
              if (playFeedback && m.id !== mode) sfx.tap()
              onChange(m.id)
            }}
          >
            <span className="v-modes__icon" aria-hidden="true">
              {(() => {
                const ModeIcon = ICONS[m.id]
                return <ModeIcon size="1.1em" aria-hidden="true" />
              })()}
            </span>
            <span className="v-modes__text">
              <strong>{m.label}</strong>
              <small>{m.blurb ?? BLURBS[m.id]}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
