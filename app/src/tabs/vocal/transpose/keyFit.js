/**
 * Key fit: which transposition puts a part where a singer can sing it.
 * Pure (no DOM, no audio); unit-tested in app/tests/keyFit.test.js. Used by
 * the Vocal tab's transpose control (one part against the singer's range)
 * and by the arranger (every part against its voice in the ensemble).
 *
 *   note:  { midi, duration } — duration in any unit (seconds, sixteenths);
 *          only the proportions matter
 *   range: { low, high } — MIDI notes the singer sings comfortably
 *
 * Every shift in −12 … +12 is scored, lower is better:
 *   - tessitura: how far, on average by time, the notes sit outside the
 *     middle of the range. Where a song *lives* matters more than one note
 *     at its edge, so this is weighted by how long each note is held;
 *   - outside: time spent past the range, with a soft margin — a semitone
 *     over is a stretch, three is a strain — so it grows faster the further out;
 *   - peak: the single furthest note past the range, whatever its length.
 *     A short high note out of reach still breaks a performance;
 *   - the move itself: a little per semitone of key change (an octave is the
 *     same key, so it costs only its distance), and a little per accidental
 *     in the new key signature, so between equal fits the smaller move to
 *     the friendlier key wins.
 */

const TESSITURA_WEIGHT = 1
const OUTSIDE_WEIGHT = 3
const PEAK_WEIGHT = 0.8
const MARGIN = 1 // semitones past the range that still count as a stretch, not a strain
const STRETCH = 0.4 // cost per semitone within the margin, relative to past it
const KEY_STEP_COST = 0.06 // per semitone the key moves (an octave away is the same key)
const DISTANCE_COST = 0.025 // per semitone the notes move at all: an octave is a new register, if not a new key
const ACCIDENTAL_COST = 0.03 // per sharp or flat in the new key signature
const SWEET_SPOT = 0.2 // the band this far in from each end of the range is the sweet spot

export const MIN_SHIFT = -12
export const MAX_SHIFT = 12

export const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
export const STEP_PC = [0, 2, 4, 5, 7, 9, 11]
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const MAJOR_NAMES = { '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#' }

const distanceOutside = (midi, low, high) => (midi < low ? low - midi : midi > high ? midi - high : 0)
const soft = (d) => (d <= MARGIN ? STRETCH * d : STRETCH * MARGIN + (d - MARGIN))
const mod12 = (n) => ((n % 12) + 12) % 12

/**
 * The key signature `fifths` becomes when the music moves `semitones`:
 * the spelling with the fewest accidentals (−6 … 6). Six either way is a
 * tie (F# / Gb); it keeps the side the key was on, flats for a flat key.
 */
export function transposeFifths(fifths, semitones) {
  const moved = fifths + 7 * semitones
  let best = mod12(moved)
  if (best > 6) best -= 12
  if (best === 6 && fifths < 0) best = -6
  if (best === -6 && fifths > 0) best = 6
  return best
}

/** 'Bb' for −2 (major), 'G minor' for −2 in minor. */
export function keyName(fifths, mode = 'major') {
  if (mode === 'minor') return `${MAJOR_NAMES[Math.max(-7, Math.min(7, fifths + 3))] ?? '?'} minor`
  return MAJOR_NAMES[fifths] ?? '?'
}

/** "−3", "+2", "0" — with a real minus sign. */
export function signed(n) {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'
}

/** "Transposed −3 (to A)", or "Original key (C)" without a move; `fifths`/`mode` are the written key. */
export function transposeLabel(shift, { fifths = 0, mode = 'major' } = {}) {
  if (!shift) return `Original key (${keyName(fifths, mode)})`
  return `Transposed ${signed(shift)} (to ${keyName(transposeFifths(fifths, shift), mode)})`
}

/** The alteration `fifths`' key signature gives letter `step` (index into STEPS). */
function keyAlter(step, fifths) {
  const letter = STEPS[step]
  const order = SHARP_ORDER.indexOf(letter)
  if (fifths > 0) return order < fifths ? 1 : 0
  if (fifths < 0) return 6 - order < -fifths ? -1 : 0
  return 0
}

/**
 * How pitch class `pc` is spelled in the key of `fifths`: its scale note if
 * it has one, otherwise the nearest letter raised (sharp keys) or lowered
 * (flat keys), avoiding E#/B#/Cb/Fb and double accidentals. { step, alter }.
 */
export function spellPitchClass(pc, fifths = 0) {
  // C major has no side; it borrows Eb, Ab and Bb, and raises to C#, F# and G#… as music usually does.
  const sharpSide = fifths > 0 || (fifths === 0 && ![3, 8, 10].includes(pc))
  let best = null
  for (let step = 0; step < 7; step += 1) {
    for (let alter = -2; alter <= 2; alter += 1) {
      if (mod12(STEP_PC[step] + alter) !== pc) continue
      const change = alter - keyAlter(step, fifths)
      let cost
      if (change === 0) cost = 0
      else if (Math.abs(change) === 1) cost = (change > 0) === sharpSide ? 1 : 1.5
      else cost = 5
      if (Math.abs(alter) === 2) cost += 5
      // E#, B#, Cb, Fb read as typos outside keys that need them.
      if (change !== 0 && ((alter === 1 && (step === 2 || step === 6)) || (alter === -1 && (step === 0 || step === 3)))) cost += 1
      if (!best || cost < best.cost) best = { step, alter, cost }
    }
  }
  return { step: STEPS[best.step], alter: best.alter }
}

/** 'G' for 67, spelled as the key of `fifths` spells it ('Bb' in F, 'A#' in B). Octave left off. */
export function pitchName(midi, fifths = 0) {
  const { step, alter } = spellPitchClass(mod12(midi), fifths)
  return `${step}${alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter)}`
}

/** 'G4' for 67 (the octave of the written note: Cb5 sounds as B4). */
export function noteLabel(midi, fifths = 0) {
  const { step, alter } = spellPitchClass(mod12(midi), fifths)
  return `${pitchName(midi, fifths)}${Math.round((midi - STEP_PC[STEPS.indexOf(step)] - alter) / 12) - 1}`
}

/**
 * The duration-weighted cost of moving `notes` by `shift` into `range`,
 * broken down ({ cost, tessitura, outside, peak, move }). `fifths` is the
 * written key, for the accidentals of the new one.
 */
export function scoreShift(notes, range, shift, { fifths = 0 } = {}) {
  const { low, high } = range
  const inset = Math.round((high - low) * SWEET_SPOT)
  const sweetLow = low + inset
  const sweetHigh = high - inset
  let total = 0
  let tessitura = 0
  let outside = 0
  let peak = 0
  for (const note of notes) {
    const weight = Math.max(0, note.duration)
    const p = note.midi + shift
    total += weight
    tessitura += weight * distanceOutside(p, sweetLow, sweetHigh)
    const d = distanceOutside(p, low, high)
    outside += weight * soft(d)
    peak = Math.max(peak, d)
  }
  if (total > 0) {
    tessitura /= total
    outside /= total
  }
  const steps = mod12(shift)
  const accidentals = Math.abs(transposeFifths(fifths, shift))
  const move = KEY_STEP_COST * Math.min(steps, 12 - steps) + DISTANCE_COST * Math.abs(shift) + ACCIDENTAL_COST * accidentals
  const cost = TESSITURA_WEIGHT * tessitura + OUTSIDE_WEIGHT * outside + PEAK_WEIGHT * soft(peak) + move
  return { cost, tessitura, outside, peak, move }
}

/** The shifts to try: −12 … 12, or only whole octaves (`octavesOnly`, keeping the key). */
export function candidateShifts({ minShift = MIN_SHIFT, maxShift = MAX_SHIFT, octavesOnly = false } = {}) {
  const shifts = []
  for (let s = minShift; s <= maxShift; s += 1) if (!octavesOnly || mod12(s) === 0) shifts.push(s)
  return shifts
}

/**
 * Several parts at once, each against its own range, with weights (the
 * arranger gives the tune the most): [{ notes, range, weight }]. Returns
 * the best shift and every candidate's summed cost, lowest first.
 */
export function bestCombinedShift(parts, { fifths = 0, ...options } = {}) {
  const sounding = parts.filter((p) => p.notes.length && (p.weight ?? 1) > 0)
  if (!sounding.length) return { shift: 0, candidates: [] }
  const weightSum = sounding.reduce((sum, p) => sum + (p.weight ?? 1), 0)
  const candidates = candidateShifts(options).map((shift) => {
    let cost = 0
    let move = 0
    for (const part of sounding) {
      const s = scoreShift(part.notes, part.range, shift, { fifths })
      const w = (part.weight ?? 1) / weightSum
      cost += w * (s.cost - s.move)
      move = s.move // the same for every part
    }
    return { shift, cost: cost + move }
  })
  // Stable on ties: the earlier (smaller |shift| first) candidate wins.
  const ordered = [...candidates].sort((a, b) => a.cost - b.cost || Math.abs(a.shift) - Math.abs(b.shift) || a.shift - b.shift)
  return { shift: ordered[0].shift, candidates: ordered }
}

/**
 * The transposition that best fits one part's `notes` into `range`:
 * { shift, key (the new key's name), reason, lowest, highest (the part's
 * notes after the move), fits (every note within the range), candidates }.
 * `fifths`/`mode` describe the written key. With no notes, no move.
 */
export function fitKey(notes, range, { fifths = 0, mode = 'major', ...options } = {}) {
  const pitched = notes.filter((n) => Number.isFinite(n.midi))
  if (!pitched.length) {
    return { shift: 0, key: keyName(fifths, mode), reason: 'Nothing to sing in this part.', lowest: null, highest: null, fits: true, candidates: [] }
  }
  const { shift, candidates } = bestCombinedShift([{ notes: pitched, range }], { fifths, ...options })
  const lowest = Math.min(...pitched.map((n) => n.midi))
  const highest = Math.max(...pitched.map((n) => n.midi))
  const newFifths = transposeFifths(fifths, shift)
  return {
    shift,
    key: keyName(newFifths, mode),
    reason: explainShift({ shift, lowest, highest, range, fifths, newFifths }),
    lowest: lowest + shift,
    highest: highest + shift,
    fits: lowest + shift >= range.low && highest + shift <= range.high,
    candidates,
  }
}

/**
 * One sentence on why: "Moves the song down 3 so the high G becomes E."
 * Down is about the top note, up about the bottom one; when notes are still
 * out of reach at the best fit, it says so.
 */
export function explainShift({ shift, lowest, highest, range, fifths = 0, newFifths = transposeFifths(fifths, shift) }) {
  const newLow = lowest + shift
  const newHigh = highest + shift
  const leftover =
    newHigh > range.high && newLow < range.low
      ? ' This part spans more than your range, so a few notes stay out of reach.'
      : newHigh > range.high
        ? ' A few notes still sit above your range.'
        : newLow < range.low
          ? ' A few notes still sit below your range.'
          : ''
  if (shift === 0) return `${leftover ? 'Best as written.' : 'Already sits well in your range.'}${leftover}`
  // An octave keeps the note's name, so name the octave too.
  const octave = Math.abs(shift) === 12
  const amount = octave ? 'an octave' : `${Math.abs(shift)}`
  const name = octave ? noteLabel : pitchName
  const sentence =
    shift < 0
      ? `Moves the song down ${amount} so the high ${name(highest, fifths)} becomes ${name(newHigh, newFifths)}.`
      : `Moves the song up ${amount} so the low ${name(lowest, fifths)} becomes ${name(newLow, newFifths)}.`
  return `${sentence}${leftover}`
}
