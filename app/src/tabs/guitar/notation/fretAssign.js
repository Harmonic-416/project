/**
 * Notes → tab. A MIDI file, or MusicXML written for any instrument, has
 * pitches but no strings or frets, and most pitches can be played in
 * several places on the neck. Like FretPath, pick
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
const NOTE_RE = /<note\b[^>]*>[\s\S]*?<\/note>/g
// What moves time along inside a part, in document order. `<note\b` doesn't match <notations> or <notehead>.
const TOKEN_RE =
  /<measure\b[^>]*>|<attributes\b[^>]*>[\s\S]*?<\/attributes>|<note\b[^>]*>[\s\S]*?<\/note>|<backup\b[^>]*>[\s\S]*?<\/backup>|<forward\b[^>]*>[\s\S]*?<\/forward>/g
const CLEF_RE = /<clef\b[^>]*>[\s\S]*?<\/clef>/g

const numberIn = (xml, tag) => {
  const value = xml.match(new RegExp(`<${tag}>\\s*(-?[\\d.]+)\\s*</${tag}>`))?.[1]
  return value === undefined ? null : Number(value)
}

/** The written pitch of a note as a MIDI number, or null for a rest or an unpitched note. */
function pitchOf(noteXml) {
  const step = noteXml.match(/<step>\s*([A-G])\s*<\/step>/)?.[1]
  const octave = numberIn(noteXml, 'octave')
  if (!step || octave === null) return null
  return (octave + 1) * 12 + STEP_SEMITONES[step] + Math.round(numberIn(noteXml, 'alter') ?? 0)
}

/** Semitones from written to sounding pitch, from an <attributes> block's <transpose>, or null if it has none. */
function transposeIn(attributesXml) {
  const transpose = attributesXml.match(/<transpose\b[^>]*>([\s\S]*?)<\/transpose>/)?.[1]
  if (transpose === undefined) return null
  return (numberIn(transpose, 'chromatic') ?? 0) + 12 * (numberIn(transpose, 'octave-change') ?? 0)
}

/**
 * Every note of a part in document order, with when it sounds: notes in
 * different voices (joined by <backup>) that start together share a `key`,
 * so they're fretted as one chord. `midi` is the sounding pitch (written +
 * <transpose>, as alphaTab reads it); null for rests and unpitched notes.
 */
function readNotes(body) {
  const notes = []
  let measure = -1
  let cursor = 0
  let transpose = 0
  let chordOnset = 0
  let graceRun = 0
  let lastKey = null
  for (const [token] of body.matchAll(TOKEN_RE)) {
    if (token.startsWith('<measure')) {
      measure += 1
      cursor = 0
      continue
    }
    if (token.startsWith('<attributes')) {
      transpose = transposeIn(token) ?? transpose
      continue
    }
    const duration = numberIn(token, 'duration') ?? 0
    if (token.startsWith('<backup')) {
      cursor -= duration
      continue
    }
    if (token.startsWith('<forward')) {
      cursor += duration
      continue
    }
    const chord = /<chord\s*\/>/.test(token)
    const grace = /<grace\b/.test(token)
    const onset = chord ? chordOnset : cursor
    if (!chord) chordOnset = cursor
    if (!chord && !grace) cursor += duration
    if (grace && !chord) graceRun += 1
    const at = Math.max(measure, 0)
    const key = chord && lastKey ? lastKey : grace ? `${at}:${onset}:g${graceRun}` : `${at}:${onset}`
    lastKey = key
    const written = /<rest\b/.test(token) ? null : pitchOf(token)
    notes.push({
      xml: token,
      chord,
      grace,
      key,
      order: [at, onset, grace ? 0 : 1, grace ? graceRun : 0],
      cue: /<cue\s*\/>/.test(token),
      unpitched: /<unpitched\b/.test(token),
      midi: written === null ? null : written + transpose,
      tieStart: /<tie\s+type="start"/.test(token),
      tieStop: /<tie\s+type="stop"/.test(token),
    })
  }
  return notes
}

const byOrder = (a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2] || a.order[3] - b.order[3]

/** The lowest and highest pitches the neck can play in `tuning`. */
const rangeOf = (tuning) => [Math.min(...tuning), Math.max(...tuning) + MAX_FRET]

/**
 * The whole-octave shift that puts the most of a part's notes on the neck,
 * the smallest shift on a tie (0 when everything already fits).
 */
export function octaveShiftFor(pitches, { tuning = STANDARD_TUNING } = {}) {
  const [low, high] = rangeOf(tuning)
  let best = 0
  let bestFit = -1
  for (const shift of [0, -12, 12, -24, 24, -36, 36, -48, 48]) {
    const fit = pitches.filter((p) => p + shift >= low && p + shift <= high).length
    if (fit > bestFit) {
      best = shift
      bestFit = fit
    }
  }
  return best
}

/** A pitch moved by octaves until it's on the neck. */
function fold(pitch, [low, high]) {
  let p = pitch
  while (p < low) p += 12
  while (p > high) p -= 12
  return p
}

/**
 * The pitches of a chord the guitar can actually fret (a list of distinct
 * pitches): all of them if possible; otherwise the lowest and highest, with
 * inner notes added back from the top while a shape still exists; at least
 * the top note.
 */
export function playableChord(pitches, { tuning = STANDARD_TUNING } = {}) {
  const sorted = [...new Set(pitches)].sort((a, b) => a - b)
  if (shapesFor(sorted, tuning).length) return sorted
  const top = sorted[sorted.length - 1]
  let kept = shapesFor([sorted[0], top], tuning).length ? [sorted[0], top] : [top]
  for (const pitch of sorted.slice(1, -1).reverse()) {
    const tryKept = [...kept, pitch].sort((a, b) => a - b)
    if (shapesFor(tryKept, tuning).length) kept = tryKept
  }
  return kept
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

/** A dropped note that leaves its voice empty at that moment: a rest of the same length. */
function asRest(noteXml) {
  return noteXml
    .replace(/<pitch>[\s\S]*?<\/pitch>/, '<rest/>')
    .replace(/<tie\b[^>]*\/>/g, '')
    .replace(/<(accidental|stem|notehead|beam|notations)\b[^>]*>[\s\S]*?<\/\1>/g, '')
}

/** A kept note: moved by `shift` semitones (whole octaves) if fitted, with its string and fret added. */
function tabbedNote(noteXml, shift, { string, fret }, dropChord) {
  let note = dropChord ? noteXml.replace(/<chord\s*\/>/, '') : noteXml
  if (shift) note = note.replace(/<octave>\s*(-?\d+)\s*<\/octave>/, (_, octave) => `<octave>${Number(octave) + shift / 12}</octave>`)
  const technical = `<notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations>`
  // <notations> comes before <lyric>, <play> and <listen> in a MusicXML note.
  const before = note.search(/<(lyric|play|listen)\b/)
  return before >= 0 ? `${note.slice(0, before)}${technical}${note.slice(before)}` : note.replace(/<\/note>$/, `${technical}</note>`)
}

/**
 * Fret one part (see addGuitarTab). Returns the new body and what was done,
 * or null to leave the part as it is.
 */
function tabPart(body, tuning) {
  const notes = readNotes(body)
  const pitched = notes.filter((n) => n.midi !== null && !n.cue)
  if (!pitched.length || notes.some((n) => n.unpitched)) return null

  // Fit to the neck: the best whole-octave shift, then any note still off it folded in.
  const range = rangeOf(tuning)
  const shift = octaveShiftFor(
    pitched.map((n) => n.midi),
    { tuning },
  )
  let foldedNotes = 0
  for (const n of pitched) {
    n.fitted = fold(n.midi + shift, range)
    if (n.fitted !== n.midi + shift) foldedNotes += 1
  }

  // Chords in time order; a tied-over note keeps the string and fret of the note it continues.
  const groups = new Map()
  for (const n of [...pitched].sort(byOrder)) {
    if (!groups.has(n.key)) groups.set(n.key, [])
    groups.get(n.key).push(n)
  }
  const open = new Map() // pitch → the note whose tie is still open
  for (const members of groups.values()) {
    for (const n of members) {
      if (n.tieStop && open.has(n.midi)) n.origin = open.get(n.midi)
      if (n.tieStart) open.set(n.midi, n)
      else if (n.tieStop) open.delete(n.midi)
    }
  }

  const searched = []
  for (const members of groups.values()) {
    const fresh = members.filter((n) => !n.origin)
    if (!fresh.length) continue
    const kept = playableChord(
      fresh.map((n) => n.fitted),
      { tuning },
    )
    const playing = []
    for (const n of fresh) {
      if (kept.includes(n.fitted) && !playing.some((p) => p.fitted === n.fitted)) playing.push(n)
      else n.dropped = true
    }
    searched.push(playing)
  }
  const shapes = assignFrets(
    searched.map((group) => group.map((n) => n.fitted)),
    { tuning },
  )
  searched.forEach((group, g) => group.forEach((n, i) => (n.position = shapes[g]?.[i] ?? null)))
  for (const members of groups.values()) {
    for (const n of members) {
      if (!n.origin) continue
      n.dropped = n.origin.dropped
      n.position = n.origin.position
    }
  }
  if (pitched.some((n) => !n.dropped && !n.position)) return null

  // A chord (one note and the <chord/> notes after it) losing every note keeps its time as a rest.
  const promote = new Set() // notes that become the first of their chord
  const restInstead = new Set()
  for (let i = 0; i < notes.length; ) {
    let end = i + 1
    while (end < notes.length && notes[end].chord) end += 1
    const run = notes.slice(i, end)
    const survivors = run.filter((n) => !n.dropped)
    if (run[0].dropped && survivors.length) promote.add(survivors[0])
    if (run[0].dropped && !survivors.length && !run[0].grace) restInstead.add(run[0])
    i = end
  }

  let n = 0
  let tabbed = body.replace(NOTE_RE, (xml) => {
    const note = notes[n]
    n += 1
    if (restInstead.has(note)) return asRest(xml)
    if (note.dropped) return ''
    if (note.midi === null || note.cue) return xml
    return tabbedNote(xml, note.fitted - note.midi, note.position, promote.has(note))
  })

  // One six-string staff: a second staff (a piano's left hand) is folded into the first.
  const staves = numberIn(body, 'staves') ?? 1
  if (staves > 1) {
    tabbed = tabbed.replace(/<staves>\s*\d+\s*<\/staves>/g, '').replace(/<staff>\s*\d+\s*<\/staff>/g, '')
  }
  tabbed = tabbed.replace(/<staff-details\b[^>]*>[\s\S]*?<\/staff-details>/g, '')
  let clefs = 0
  tabbed = tabbed.replace(CLEF_RE, (clef) => {
    const number = Number(clef.match(/\bnumber="(\d+)"/)?.[1] ?? 1)
    if (number > 1) return ''
    clefs += 1
    return clefs === 1 ? `${GUITAR_CLEF}${staffDetails(tuning)}` : GUITAR_CLEF
  })
  if (!clefs) {
    const header = `${GUITAR_CLEF}${staffDetails(tuning)}`
    tabbed = /<\/attributes>/.test(tabbed)
      ? tabbed.replace(/<\/attributes>/, `${header}</attributes>`)
      : tabbed.replace(/(<measure\b[^>]*>)/, `$1<attributes>${header}</attributes>`)
  }

  return {
    body: tabbed,
    octaveShift: shift,
    foldedNotes,
    droppedNotes: pitched.filter((p) => p.dropped).length,
    mergedStaves: staves > 1 ? staves : 0,
  }
}

/** Part id → name, from the score's <part-list>. */
function partNames(musicXml) {
  const names = new Map()
  for (const [, id, inner] of musicXml.matchAll(/<score-part\s[^>]*?\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/score-part>/g)) {
    names.set(id, inner.match(/<part-name\b[^>]*>([\s\S]*?)<\/part-name>/)?.[1]?.trim() || id)
  }
  return names
}

/**
 * Add tab to partwise MusicXML: every pitched part gets a string and fret on
 * each note, a six-string tuning and the guitar clef, so alphaTab draws it
 * as tab + notation. Works on files from any source: voices joined by
 * <backup> are fretted as one chord, tied notes stay on their string, and
 * pitches are read as they sound (<transpose>).
 *
 * A part that doesn't fit the guitar as written is fitted to it: moved by
 * whole octaves to suit the neck (notes still off it are folded in), chords
 * with no fingering simplified to their bass and top notes and what fits in
 * between, and a second staff folded into the first.
 *
 * Left as they are: parts that already have tab (their own <fret> or
 * <staff-tuning>), percussion (<unpitched>), and the part ids in
 * `skipParts` (MIDI drum tracks).
 *
 * Returns { musicXml, tabbedParts, parts }, with parts:
 * [{ id, name, status: 'tabbed' | 'kept' | 'skipped', octaveShift, foldedNotes, droppedNotes, mergedStaves }].
 */
export function addGuitarTab(musicXml, { tuning = STANDARD_TUNING, skipParts = [] } = {}) {
  const names = partNames(musicXml)
  const parts = []
  const out = musicXml.replace(PART_RE, (whole, open, body, close) => {
    const id = open.match(/\bid=["']([^"']+)["']/)?.[1] ?? ''
    const report = { id, name: names.get(id) ?? id, status: 'skipped', octaveShift: 0, foldedNotes: 0, droppedNotes: 0, mergedStaves: 0 }
    parts.push(report)
    if (/<fret>/.test(body) || /<staff-tuning\b/.test(body)) {
      report.status = 'kept'
      return whole
    }
    if (skipParts.includes(id) || /<sign>\s*percussion\s*<\/sign>/.test(body)) return whole
    const result = tabPart(body, tuning)
    if (!result) return whole
    const { body: tabbed, ...changes } = result
    Object.assign(report, changes, { status: 'tabbed' })
    return `${open}${tabbed}${close}`
  })
  return { musicXml: out, tabbedParts: parts.filter((p) => p.status === 'tabbed').length, parts }
}
