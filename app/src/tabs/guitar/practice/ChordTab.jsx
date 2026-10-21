import { STRING_NAMES } from './chords.js'
import './ChordTab.css'

/** Six-line tab for one chord, high e on top like real tab. */
function ChordTab({ chord }) {
  const lines = STRING_NAMES.map((name, i) => ({
    name: i === 5 ? 'e' : name,
    fret: chord.frets[i],
  })).reverse()
  return (
    <pre className="practice__tab" aria-label={`${chord.name} as tab`}>
      {lines.map(({ name, fret }) => `${name}|--${fret < 0 ? 'x' : fret}--|`).join('\n')}
    </pre>
  )
}

export default ChordTab
