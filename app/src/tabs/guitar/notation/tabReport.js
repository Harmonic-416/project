/**
 * What to tell the player after loadGuitarNotation generated tab (its `tab`
 * report, from fretAssign's addGuitarTab): one line per part that had to be
 * fitted to the guitar, and the parts left as notation only. Pure,
 * unit-tested in app/tests/fretAssign.test.js; TabNotice.jsx shows it.
 */

const OCTAVES = { 1: 'an octave', 2: 'two octaves', 3: 'three octaves', 4: 'four octaves' }
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** "moved down an octave to fit the guitar, 3 notes left out of chords", or '' for a part played as written. */
export function describeChanges(part) {
  const changes = []
  if (part.octaveShift) {
    const octaves = Math.abs(part.octaveShift) / 12
    changes.push(`moved ${part.octaveShift < 0 ? 'down' : 'up'} ${OCTAVES[octaves] ?? `${octaves} octaves`} to fit the guitar`)
  }
  if (part.foldedNotes) changes.push(`${count(part.foldedNotes, 'note', 'notes')} moved by an octave to stay on the neck`)
  if (part.mergedStaves) changes.push(`${part.mergedStaves} staves merged into one`)
  if (part.droppedNotes) changes.push(`${count(part.droppedNotes, 'note', 'notes')} left out of chords`)
  return changes.join(', ')
}

/** { generated, changes: ['Voice: moved down an octave…'], notationOnly: ['Drums'] } for a `tab` report. */
export function tabNotice(tab) {
  const parts = tab?.parts ?? []
  return {
    generated: Boolean(tab?.generated),
    changes: parts
      .filter((p) => p.status === 'tabbed' && describeChanges(p))
      .map((p) => `${p.name}: ${describeChanges(p)}`),
    notationOnly: parts.filter((p) => p.status === 'skipped').map((p) => p.name),
  }
}
