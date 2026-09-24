import { STRING_NAMES, dotLabel } from './chords.js'
import './ChordDiagram.css'

// Drawing size (SVG units; the SVG scales to its container).
const LEFT = 26
const STRING_GAP = 30
const TOP = 44
const FRET_GAP = 42
const FRETS_SHOWN = 4
const WIDTH = LEFT * 2 + STRING_GAP * 5
const HEIGHT = TOP + FRET_GAP * FRETS_SHOWN + 30

/**
 * Chord box: six strings (low E on the left), the nut, four frets, a dot per
 * fretted string, ○ for open and ✕ for muted strings above the nut.
 * `labelMode` picks what the dots say (F35); `pulse` makes the dots throb
 * while the Hint is playing (F31).
 */
function ChordDiagram({ chord, labelMode, pulse = false }) {
  const x = (i) => LEFT + i * STRING_GAP
  const markerY = TOP - 18

  return (
    <svg
      className={`chord-diagram ${pulse ? 'chord-diagram--pulse' : ''}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${chord.name} chord diagram`}
    >
      {/* frets (the first one is the thick nut) */}
      {Array.from({ length: FRETS_SHOWN + 1 }, (_, f) => (
        <line
          key={`fret-${f}`}
          className={f === 0 ? 'chord-diagram__nut' : 'chord-diagram__fret'}
          x1={x(0)}
          x2={x(5)}
          y1={TOP + f * FRET_GAP}
          y2={TOP + f * FRET_GAP}
        />
      ))}

      {/* strings */}
      {STRING_NAMES.map((_, i) => (
        <line key={`string-${i}`} className="chord-diagram__string" x1={x(i)} x2={x(i)} y1={TOP} y2={TOP + FRETS_SHOWN * FRET_GAP} />
      ))}

      {/* open ○ / muted ✕ markers above the nut */}
      {chord.frets.map((fret, i) =>
        fret === 0 ? (
          <circle key={`open-${i}`} className="chord-diagram__open" cx={x(i)} cy={markerY} r={7} />
        ) : fret < 0 ? (
          <text key={`mute-${i}`} className="chord-diagram__mute" x={x(i)} y={markerY + 5}>
            ✕
          </text>
        ) : null,
      )}

      {/* finger dots */}
      {chord.frets.map((fret, i) =>
        fret > 0 ? (
          <g key={`dot-${i}`} className="chord-diagram__dot" style={{ animationDelay: `${i * 60}ms` }}>
            <circle cx={x(i)} cy={TOP + (fret - 0.5) * FRET_GAP} r={12} />
            <text x={x(i)} y={TOP + (fret - 0.5) * FRET_GAP + 4.5}>
              {dotLabel(chord, i, labelMode)}
            </text>
          </g>
        ) : null,
      )}

      {/* string names under the diagram */}
      {STRING_NAMES.map((name, i) => (
        <text key={`name-${i}`} className="chord-diagram__name" x={x(i)} y={HEIGHT - 8}>
          {name}
        </text>
      ))}
    </svg>
  )
}

export default ChordDiagram
