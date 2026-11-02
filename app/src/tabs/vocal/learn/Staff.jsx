/**
 * A small treble staff for the Learn view: quarter-note heads on C4–C5
 * (scale steps 0–7, see learnLogic.js), each optionally lit, coloured, or
 * labelled underneath. Drawn by hand so single notes can be highlighted.
 */

const LINE_GAP = 10
const BOTTOM_LINE_Y = 70 // E4
const FIRST_NOTE_X = 64
const NOTE_GAP = 46
const STEM = 30
const HEIGHT = 124

/** y of a scale step (0 = C4, 2 = E4 on the bottom line). */
const stepY = (step) => BOTTOM_LINE_Y - (step - 2) * (LINE_GAP / 2)

/**
 * steps:  scale steps to draw, in order
 * active: index of the note to light up (or null)
 * marks:  per note, 'good' | 'bad' | 'next' | null
 * labels: per note, text under it (or null)
 * hidden: draw the empty staff only
 */
export default function Staff({ steps, active = null, marks = [], labels = [], hidden = false, label }) {
  const width = FIRST_NOTE_X + Math.max(steps.length, 1) * NOTE_GAP
  return (
    <svg
      className="learn-staff"
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMinYMid meet"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1="4" x2={width - 4} y1={BOTTOM_LINE_Y - i * LINE_GAP} y2={BOTTOM_LINE_Y - i * LINE_GAP} className="learn-staff__line" />
      ))}
      <line x1={width - 4} x2={width - 4} y1={BOTTOM_LINE_Y - 4 * LINE_GAP} y2={BOTTOM_LINE_Y} className="learn-staff__line" />
      <text x="8" y={BOTTOM_LINE_Y + 9} className="learn-staff__clef">
        𝄞
      </text>
      {!hidden &&
        steps.map((step, i) => {
          const x = FIRST_NOTE_X + i * NOTE_GAP + NOTE_GAP / 2 - 10
          const y = stepY(step)
          const stemUp = step < 6
          const state = i === active ? 'active' : marks[i]
          return (
            <g key={i} className={`learn-staff__note${state ? ` learn-staff__note--${state}` : ''}`}>
              {step === 0 && <line x1={x - 11} x2={x + 11} y1={y} y2={y} className="learn-staff__line" />}
              <ellipse cx={x} cy={y} rx="6.4" ry="4.6" transform={`rotate(-20 ${x} ${y})`} />
              {stemUp ? (
                <line x1={x + 5.8} x2={x + 5.8} y1={y - 1} y2={y - STEM} className="learn-staff__stem" />
              ) : (
                <line x1={x - 5.8} x2={x - 5.8} y1={y + 1} y2={y + STEM} className="learn-staff__stem" />
              )}
              {labels[i] && (
                <text x={x} y={HEIGHT - 6} textAnchor="middle" className="learn-staff__label">
                  {labels[i]}
                </text>
              )}
            </g>
          )
        })}
    </svg>
  )
}
