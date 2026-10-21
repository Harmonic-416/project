import { chordTransition } from './chordTransition.js'
import './ChordTransition.css'

// The same box as ChordDiagram.
const LEFT = 26
const STRING_GAP = 30
const TOP = 44
const FRET_GAP = 42
const FRETS_SHOWN = 4
const WIDTH = LEFT * 2 + STRING_GAP * 5
const HEIGHT = TOP + FRET_GAP * FRETS_SHOWN + 30

/**
 * A chord change shown instead of filmed: the dots are fingers, numbered,
 * and they slide from the `from` shape to the `to` shape as `phase` flips
 * between 'from' and 'to'. A finger that stays put (an anchor) glows; one
 * that's only in one chord fades in or out.
 */
function ChordTransition({ from, to, phase }) {
  const x = (string) => LEFT + string * STRING_GAP
  const y = (fret) => TOP + (fret - 0.5) * FRET_GAP
  const chord = phase === 'to' ? to : from
  const moves = chordTransition(from, to)

  return (
    <svg className="chord-transition" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Changing from ${from.name} to ${to.name}`}>
      {Array.from({ length: FRETS_SHOWN + 1 }, (_, f) => (
        <line
          key={`fret-${f}`}
          className={f === 0 ? 'chord-transition__nut' : 'chord-transition__fret'}
          x1={LEFT}
          x2={LEFT + 5 * STRING_GAP}
          y1={TOP + f * FRET_GAP}
          y2={TOP + f * FRET_GAP}
        />
      ))}
      {Array.from({ length: 6 }, (_, s) => (
        <line key={`string-${s}`} className="chord-transition__string" x1={x(s)} x2={x(s)} y1={TOP} y2={TOP + FRETS_SHOWN * FRET_GAP} />
      ))}
      {chord.frets.map((fret, s) =>
        fret === 0 ? (
          <circle key={`open-${s}`} className="chord-transition__open" cx={x(s)} cy={TOP - 18} r={7} />
        ) : fret < 0 ? (
          <text key={`mute-${s}`} className="chord-transition__mute" x={x(s)} y={TOP - 13}>
            ✕
          </text>
        ) : null,
      )}
      {moves.map(({ finger, from: start, to: end, kind }) => {
        const spot = (phase === 'to' ? end : start) ?? (phase === 'to' ? start : end)
        const shown = phase === 'to' ? Boolean(end) : Boolean(start)
        return (
          <g
            key={finger}
            className={`chord-transition__dot chord-transition__dot--${kind}`}
            style={{ transform: `translate(${x(spot.string)}px, ${y(spot.fret)}px)`, opacity: shown ? 1 : 0 }}
          >
            <circle r={12} />
            <text y={4.5}>{finger}</text>
          </g>
        )
      })}
      <text className="chord-transition__name" x={WIDTH / 2} y={HEIGHT - 8}>
        {chord.name}
      </text>
    </svg>
  )
}

export default ChordTransition
