import { STRING_NAMES } from './chords.js'
import './StringStates.css'

const STATE_TEXT = { good: 'rang clean', bad: 'buzzed or wrong', idle: 'not heard yet', muted: "don't play" }

/**
 * Six circles, low E to high e, lit by what was heard on each string (F34):
 * green = clean, red = problem, grey = nothing yet. Strings the chord doesn't
 * use are shown faded.
 */
function StringStates({ chord, strings }) {
  return (
    <div className="string-states">
      <span className="string-states__label">Live string state</span>
      <ul className="string-states__row">
        {STRING_NAMES.map((name, i) => {
          const state = chord.frets[i] < 0 ? 'muted' : strings[i]
          return (
            <li
              key={i}
              className={`string-states__dot string-states__dot--${state}`}
              title={`${name} string: ${STATE_TEXT[state]}`}
            >
              {name}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default StringStates