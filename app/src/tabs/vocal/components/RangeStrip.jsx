import { FIT_GRACE, noteLabel } from '../transpose/keyFit.js'

/**
 * The singer's range against the song's, on one line of pitch (low on the
 * left): a band for the range they sing comfortably, and a bar from the
 * song's lowest to highest note in the key it is in now — green inside the
 * band, amber within a semitone of an edge (a reach), red past that. One glance answers "is this too high?".
 * `low`/`high` are the song's notes after the current shift; `fifths` spells
 * them in the current key.
 */
export default function RangeStrip({ range, low, high, fifths = 0 }) {
  const from = Math.min(range.low, low) - 2
  const to = Math.max(range.high, high) + 2
  const at = (midi) => `${((midi - from) / (to - from)) * 100}%`
  const width = (a, b) => `${(Math.max(0, b - a) / (to - from)) * 100}%`
  // Within FIT_GRACE of an edge is a reach (amber); past it is out of range (red).
  const reachLow = range.low - FIT_GRACE
  const reachHigh = range.high + FIT_GRACE
  const segments = [
    [low, Math.min(high, reachLow), 'out'],
    [Math.max(low, reachLow), Math.min(high, range.low), 'reach'],
    [Math.max(low, range.low), Math.min(high, range.high), 'in'],
    [Math.max(low, range.high), Math.min(high, reachHigh), 'reach'],
    [Math.max(low, reachHigh), high, 'out'],
  ].filter(([a, b]) => b > a)
  return (
    <div className="range-strip" role="img" aria-label={`Your range ${noteLabel(range.low)} to ${noteLabel(range.high)}; the song goes from ${noteLabel(low, fifths)} to ${noteLabel(high, fifths)}`}>
      <div className="range-strip__track">
        <span className="range-strip__voice" style={{ left: at(range.low), width: width(range.low, range.high) }} />
        {segments.map(([a, b, kind]) => (
          <span key={`${kind}-${a}`} className={`range-strip__song range-strip__song--${kind}`} style={{ left: at(a), width: width(a, b) }} />
        ))}
        <span className="range-strip__tick" style={{ left: at(low) }} />
        <span className="range-strip__tick" style={{ left: at(high) }} />
      </div>
      <div className="range-strip__labels" aria-hidden="true">
        <span style={{ left: at(low) }}>{noteLabel(low, fifths)}</span>
        <span style={{ left: at(high) }}>{noteLabel(high, fifths)}</span>
      </div>
      <p className="range-strip__legend" aria-hidden="true">
        <span className="range-strip__key range-strip__key--voice" /> your range {noteLabel(range.low)}–{noteLabel(range.high)}
        <span className="range-strip__key range-strip__key--song" /> the song
      </p>
    </div>
  )
}
