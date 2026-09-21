// Quantization grid + duration<->notation helpers used by midiToMusicXml.
// Isolated from the converter so the grid resolution or decomposition
// strategy can be swapped/improved independently later.

// MusicXML <divisions> value: how many divisions per quarter note.
// 4 divisions/quarter = 16th-note grid resolution.
export const DIVISIONS_PER_QUARTER = 4
export const SMALLEST_UNIT_DIVISIONS = 1 // one 16th note

// Largest-to-smallest table of (divisions -> notated type/dots) at
// DIVISIONS_PER_QUARTER = 4. Used for greedy duration decomposition.
const DURATION_TABLE = [
  { divisions: 16, type: 'whole', dots: 0 },
  { divisions: 12, type: 'half', dots: 1 },
  { divisions: 8, type: 'half', dots: 0 },
  { divisions: 6, type: 'quarter', dots: 1 },
  { divisions: 4, type: 'quarter', dots: 0 },
  { divisions: 3, type: 'eighth', dots: 1 },
  { divisions: 2, type: 'eighth', dots: 0 },
  { divisions: 1, type: '16th', dots: 0 },
]

/** Round a tick value to the nearest grid step, in the given ticks-per-quarter. */
export function quantizeTicksToGrid(ticks, ppq) {
  const gridTicks = ppq / DIVISIONS_PER_QUARTER
  return Math.round(ticks / gridTicks) * gridTicks
}

/** Convert a tick duration (in source ppq) to our fixed-resolution division units. */
export function ticksToDivisions(ticks, ppq) {
  return Math.round((ticks / ppq) * DIVISIONS_PER_QUARTER)
}

/**
 * Greedily break an arbitrary division length into a sequence of notated
 * chunks (each independently representable as a single <note>/<rest>).
 * Most grid-aligned durations resolve to exactly one chunk; only unusual
 * leftover lengths (rare post-quantization) produce more than one, and in
 * that case adjacent chunks are NOT tied — a known simplification.
 */
export function decomposeDuration(totalDivisions) {
  const chunks = []
  let remaining = totalDivisions
  while (remaining > 0) {
    const entry = DURATION_TABLE.find((d) => d.divisions <= remaining)
    if (!entry) break // shouldn't happen; table bottoms out at 1
    chunks.push(entry)
    remaining -= entry.divisions
  }
  return chunks
}
