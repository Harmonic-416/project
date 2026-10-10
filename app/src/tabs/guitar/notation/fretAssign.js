/**
 * MIDI → tab. A MIDI file has pitches but no strings or frets, and most
 * pitches can be played in several places on the neck. Like FretPath, pick
 * a position for every note (or chord) with a Viterbi search over the whole
 * line: keep the hand's movement along the neck small, prefer open strings
 * and low positions, and never stretch past a four-fret span. Pure, so it
 * runs in Node (app/tests/fretAssign.test.js).
 *
 * Strings use tab numbering: 1 = high e … 6 = low E.
 */

/** Open-string MIDI notes, strings 1 … 6 (standard tuning). */
export const STANDARD_TUNING = [64, 59, 55, 50, 45, 40]

const MAX_FRET = 15
const MAX_STRETCH = 4 // frets between the lowest and highest fretted note of a chord
const MAX_CANDIDATES = 48 // shapes kept per chord, cheapest first

/** Where a pitch can be played: [{ string, fret }]. */
function positionsFor(midi, tuning) {
  const positions = []
  tuning.forEach((open, i) => {
    const fret = midi - open
    if (fret >= 0 && fret <= MAX_FRET) positions.push({ string: i + 1, fret })
  })
  return positions
}

/** The fret the hand sits at for a shape (its lowest fretted note), or null for open strings only. */
function handAt(shape) {
  let low = null
  for (const { fret } of shape) if (fret > 0 && (low === null || fret < low)) low = fret
  return low
}

function span(shape) {
  const fretted = shape.filter((p) => p.fret > 0).map((p) => p.fret)
  return fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0
}

/** The cost of a shape on its own: high up the neck, wide, past the 12th fret; open strings help. */
function shapeCost(shape) {
  const hand = handAt(shape) ?? 0
  let cost = 0.25 * hand + 0.6 * span(shape)
  for (const { fret } of shape) {
    if (fret > 12) cost += 1.5
    if (fret === 0) cost -= 0.3
  }
  return cost
}

/** Every playable shape for a set of pitches (one note per string), cheapest first. */
function shapesFor(midis, tuning) {
  const options = midis.map((midi) => positionsFor(midi, tuning))
  if (options.some((o) => !o.length)) return []
  const shapes = []
  const pick = (i, used, shape) => {
    if (i === options.length) {
      shapes.push([...shape])
      return
    }
    for (const position of options[i]) {
      if (used.has(position.string)) continue
      shape.push(position)
      if (span(shape) <= MAX_STRETCH) {
        used.add(position.string)
        pick(i + 1, used, shape)
        used.delete(position.string)
      }
      shape.pop()
    }
  }
  pick(0, new Set(), [])
  return shapes.sort((a, b) => shapeCost(a) - shapeCost(b)).slice(0, MAX_CANDIDATES)
}

/** Moving the hand between two shapes; open-string shapes need no move. */
function moveCost(from, to) {
  const a = handAt(from)
  const b = handAt(to)
  return a === null || b === null ? 0 : Math.abs(a - b)
}

/**
 * A position for every note: `groups` is [[midi, …], …] (one array per
 * onset; several pitches = a chord). Returns, per group, positions aligned
 * with its pitches, or null where a group can't be played (out of range,
 * or more notes than strings) — the search restarts after it.
 */
export function assignFrets(groups, { tuning = STANDARD_TUNING } = {}) {
  const result = new Array(groups.length).fill(null)
  let i = 0
  while (i < groups.length) {
    // One playable stretch at a time.
    const stretch = []
    while (i < groups.length) {
      const shapes = shapesFor(groups[i], tuning)
      if (!shapes.length) {
        i += 1
        break
      }
      stretch.push({ index: i, shapes })
      i += 1
    }
    if (!stretch.length) continue

    let costs = stretch[0].shapes.map(shapeCost)
    const back = [stretch[0].shapes.map(() => -1)]
    for (let s = 1; s < stretch.length; s += 1) {
      const previous = stretch[s - 1].shapes
      const next = []
      const from = []
      for (const shape of stretch[s].shapes) {
        let best = Infinity
        let bestFrom = 0
        previous.forEach((p, k) => {
          const cost = costs[k] + moveCost(p, shape)
          if (cost < best) {
            best = cost
            bestFrom = k
          }
        })
        next.push(best + shapeCost(shape))
        from.push(bestFrom)
      }
      costs = next
      back.push(from)
    }

    let k = costs.indexOf(Math.min(...costs))
    for (let s = stretch.length - 1; s >= 0; s -= 1) {
      result[stretch[s].index] = stretch[s].shapes[k]
      k = back[s][k]
    }
  }
  return result
}

// ── MusicXML ─────────────────────────────────────────────────────────────

const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B']
const ALTERS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]
const PART_RE = /(<part\s[^>]*>)([\s\S]*?)(<\/part>)/g
const NOTE_RE = /<note>[\s\S]*?<\/note>/g

function pitchOf(noteXml) {
  const step = noteXml.match(/<step>([A-G])<\/step>/)?.[1]
  const octave = Number(noteXml.match(/<octave>(-?\d+)<\/octave>/)?.[1])
  if (!step || !Number.isFinite(octave)) return null
  const alter = Number(noteXml.match(/<alter>(-?\d+)<\/alter>/)?.[1] ?? 0)
  return (octave + 1) * 12 + STEP_SEMITONES[step] + alter
}

function staffDetails(tuning) {
  const lines = [...tuning]
    .reverse() // staff-tuning line 1 is the lowest string
    .map(
      (midi, i) =>
        `<staff-tuning line="${i + 1}"><tuning-step>${STEPS[midi % 12]}</tuning-step>${
          ALTERS[midi % 12] ? '<tuning-alter>1</tuning-alter>' : ''
        }<tuning-octave>${Math.floor(midi / 12) - 1}</tuning-octave></staff-tuning>`,
    )
    .join('')
  return `<staff-details><staff-lines>${tuning.length}</staff-lines>${lines}</staff-details>`
}

const GUITAR_CLEF = '<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>'

/**
 * Add tab to MusicXML that has none (what midiToMusicXml writes): every
 * part whose notes all fit on the guitar gets a string and fret on each
 * note, a six-string tuning and the guitar clef, so alphaTab draws it as
 * tab + notation. Parts with a note that can't be played stay notation only.
 * Returns { musicXml, tabbedParts }.
 */
export function addGuitarTab(musicXml, { tuning = STANDARD_TUNING } = {}) {
  let tabbedParts = 0
  const out = musicXml.replace(PART_RE, (whole, open, body, close) => {
    const notes = [...body.matchAll(NOTE_RE)].map((m) => m[0])
    const groups = []
    const owner = [] // note index → [group, position in group], or null for rests
    for (const note of notes) {
      const midi = /<rest\b/.test(note) ? null : pitchOf(note)
      if (midi === null) {
        owner.push(null)
        continue
      }
      if (/<chord\s*\/>/.test(note) && groups.length) groups[groups.length - 1].push(midi)
      else groups.push([midi])
      owner.push([groups.length - 1, groups[groups.length - 1].length - 1])
    }
    if (!groups.length) return whole
    const shapes = assignFrets(groups, { tuning })
    if (shapes.some((shape) => shape === null)) return whole

    let n = 0
    let tabbed = body.replace(NOTE_RE, (note) => {
      const at = owner[n]
      n += 1
      if (!at) return note
      const { string, fret } = shapes[at[0]][at[1]]
      const technical = `<notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations>`
      // <notations> comes before <lyric> in a MusicXML note.
      return /<lyric\b/.test(note) ? note.replace(/<lyric\b/, `${technical}<lyric`) : note.replace(/<\/note>$/, `${technical}</note>`)
    })
    tabbed = tabbed.replace(/<clef>[\s\S]*?<\/clef>/, `${GUITAR_CLEF}${staffDetails(tuning)}`)
    tabbedParts += 1
    return `${open}${tabbed}${close}`
  })
  return { musicXml: out, tabbedParts }
}
