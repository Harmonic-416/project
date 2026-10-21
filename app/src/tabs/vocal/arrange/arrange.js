import { KINDS } from '../../guitar/practice/chordNames.js'
import { beatClock } from '../../guitar/song/transcribe/beatWarp.js'
import { TEMPLATES, chordEmission, chordId, harmonyXml, pathChords, smoothChords } from '../../guitar/song/transcribe/chords.js'
import { SLOTS_PER_BEAT, partXml, scoreXml } from '../../guitar/song/transcribe/scoreXml.js'
import { placeLyrics } from './lyrics.js'

/**
 * A song's tune and chords → a new arrangement of it for voices (TTBB, SATB
 * or two parts), the way an arranger writes a simple a cappella cover:
 *   - the lead singer's melody (leadLine: Basic Pitch's notes on the
 *     separated vocals, cut to one line) goes to one part, moved to the key
 *     that best fits that part's range (bestShift);
 *   - the song's chords are heard again for the arrangement (songChords):
 *     from the beats' pitch profiles with the sung tune added in, in the
 *     song's own scale (songScale), plain triads where they fit, changing
 *     at bar lines and half-bars only — one or two chords a bar, as a
 *     backing group sings them;
 *   - the other parts sing those chords under the tune in block harmony:
 *     a new chord with every melody note that is on an eighth and either
 *     belongs to the chord or is held, and with every chord change; short
 *     passing notes are sung over held harmony. Where the tune rests a
 *     beat or more, the other parts keep singing the chords ("oo"),
 *     restated each bar. A `solo` voicing's backing changes with the
 *     chords alone, restated each bar;
 *   - each chord is voiced by a Viterbi pass over the candidate voicings:
 *     chord tones in each part's range, parts in order and not crossing the
 *     melody, the bass on the root where it can be, the root and third
 *     present, no doubled third or seventh, smooth motion and no parallel
 *     fifths or octaves from one chord to the next.
 * Not a transcription of what the singers on the recording sing: a lead
 * vocal is one line, and Basic Pitch can't reliably pull several voices
 * apart, so the harmony parts are written new from the chords.
 *
 *   note (Basic Pitch's): { startTimeSeconds, durationSeconds, pitchMidi, amplitude }
 *   event: { start, end (sixteenths from the start of bar 1), midi }
 *
 * Pure; unit-tested in app/tests/arrange.test.js.
 */

const TREBLE = '<clef><sign>G</sign><line>2</line></clef>'
const TENOR = '<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>'
const BASS = '<clef><sign>F</sign><line>4</line></clef>'

/**
 * The ensembles, top part first; `low`/`high` are each part's range as MIDI
 * notes. `melody`: where the tune can go. `solo`: the first part is a
 * soloist with the tune and the words, on top; the others a backing group
 * below it that holds each chord plainly (blockChord) on "oo" (while the
 * solo sings) and "ah" (while it rests), restated each bar.
 */
export const VOICINGS = {
  solo_ttbb: {
    label: 'Solo + TTBB',
    voices: [
      { name: 'Solo', low: 53, high: 72, clef: TENOR },
      { name: 'Tenor 1', low: 50, high: 69, clef: TENOR },
      { name: 'Tenor 2', low: 47, high: 65, clef: TENOR },
      { name: 'Baritone', low: 43, high: 62, clef: BASS },
      { name: 'Bass', low: 38, high: 57, clef: BASS },
    ],
    melody: [0],
    solo: true,
  },
  ttbb: {
    label: 'TTBB',
    voices: [
      { name: 'Tenor 1', low: 50, high: 69, clef: TENOR },
      { name: 'Tenor 2', low: 47, high: 65, clef: TENOR },
      { name: 'Baritone', low: 43, high: 62, clef: BASS },
      { name: 'Bass', low: 38, high: 57, clef: BASS },
    ],
    melody: [0, 1],
  },
  satb: {
    label: 'SATB',
    voices: [
      { name: 'Soprano', low: 60, high: 79, clef: TREBLE },
      { name: 'Alto', low: 55, high: 74, clef: TREBLE },
      { name: 'Tenor', low: 48, high: 67, clef: TENOR },
      { name: 'Bass', low: 40, high: 60, clef: BASS },
    ],
    melody: [0],
  },
  tb: {
    label: 'Two parts (TB)',
    voices: [
      { name: 'Tenor', low: 48, high: 69, clef: TENOR },
      { name: 'Bass', low: 40, high: 62, clef: BASS },
    ],
    melody: [0],
  },
}

// ── The tune ─────────────────────────────────────────────────────────────

const MIN_SECONDS = 0.08 // shorter than this is a slide or a consonant, not a note
const OVERLAP_SLACK = 0.03 // notes overlapping by less than this follow one another
const SAME_ONSET = 0.08 // seconds: a stronger note starting this soon after replaces the one before
const OVERTONES = [12, 19, 24] // an octave, a twelfth, two octaves: what a voice's overtones sound like as notes

const strength = (n) => n.amplitude * Math.min(n.end - n.start, 1)

/**
 * The lead singer's line from Basic Pitch's `notes` on the separated
 * vocals: one note at a time, as [{ start, end (seconds), midi, amplitude }].
 * Where notes overlap, the overtones of a sung note go, and of two voices
 * the stronger one sings.
 */
export function leadLine(notes) {
  const sorted = notes
    .filter((n) => n.durationSeconds >= MIN_SECONDS)
    .map((n) => ({ start: n.startTimeSeconds, end: n.startTimeSeconds + n.durationSeconds, midi: n.pitchMidi, amplitude: n.amplitude ?? 0.5 }))
    .sort((a, b) => a.start - b.start || b.amplitude - a.amplitude)
  const line = []
  for (const note of sorted) {
    const last = line.at(-1)
    if (!last || note.start >= last.end - OVERLAP_SLACK) {
      line.push(note)
      continue
    }
    const above = note.midi - last.midi
    if (OVERTONES.includes(above) && note.amplitude < last.amplitude * 1.5) continue
    const lastIsOvertone = OVERTONES.includes(-above) && last.amplitude < note.amplitude * 1.5
    if (lastIsOvertone && note.start - last.start < SAME_ONSET) {
      line[line.length - 1] = note
      continue
    }
    if (!lastIsOvertone && strength(note) <= strength(last)) continue
    if (note.start - last.start < SAME_ONSET) line[line.length - 1] = note
    else {
      last.end = note.start
      line.push(note)
    }
  }
  return line.filter((n) => n.end - n.start >= MIN_SECONDS)
}

/** `line` (leadLine's) on the beat grid: one note per sixteenth, each ending by the next, at least a sixteenth long. */
export function placeLine(line, toSlot) {
  const placed = []
  for (const n of line) {
    const start = toSlot(n.start)
    if (placed.length && placed.at(-1).start >= start) continue
    placed.push({ start, end: toSlot(n.end), midi: n.midi })
  }
  return placed.map((e, i) => ({ ...e, end: Math.min(Math.max(e.end, e.start + 1), placed[i + 1]?.start ?? Infinity) }))
}

const EIGHTH = SLOTS_PER_BEAT / 2
const BREATH = SLOTS_PER_BEAT // a gap of a beat or more before the next note is a rest; a shorter one, the note held

const STEP = 2 // semitones: a stray sixteenth this close to its neighbour is part of it

/**
 * The tune without Basic Pitch's stray sixteenths: a sixteenth-long note
 * that runs straight on from (or into) a note of the same pitch is the
 * one note, split; one that starts off the eighth-note grid and runs
 * straight on from a note within a tone of it (or into one) is a scoop or
 * a wobble, not a note of its own, and is given to that neighbour. A
 * sixteenth on the grid, or jumping further, is a sung note and stays.
 */
export function tidy(events) {
  const out = []
  let carry = null // where the next note starts, when a stray was given to it
  events.forEach((e, i) => {
    const previous = out.at(-1)
    const next = events[i + 1]
    const start = carry ?? e.start
    carry = null
    const short = e.end - e.start === 1 && start === e.start
    const offGrid = e.start % EIGHTH !== 0
    const near = (other) => other && Math.abs(other.midi - e.midi) <= STEP
    const fromPrevious = previous && previous.end === e.start
    const intoNext = next && next.start === e.end
    if (short && fromPrevious && previous.midi === e.midi) previous.end = e.end
    else if (short && intoNext && next.midi === e.midi) carry = e.start
    else if (short && offGrid && fromPrevious && near(previous)) previous.end = e.end
    else if (short && offGrid && intoNext && near(next)) carry = e.start
    else out.push({ ...e, start })
  })
  return out
}

/**
 * The tune's notes of an eighth or more that start off the eighth-note
 * grid moved onto it, where that keeps them in order: Basic Pitch hears
 * an onset a sixteenth early or late far more often than a singer sings
 * one, and the line reads as the singer sang it, not as syncopation.
 */
export function snapToEighths(events) {
  const out = []
  events.forEach((e, i) => {
    const snapped = Math.round(e.start / EIGHTH) * EIGHTH
    const previous = out.at(-1)
    const next = events[i + 1]
    const room = (!previous || snapped > previous.start) && (!next || snapped < next.start)
    const start = snapped !== e.start && room && e.end - e.start >= EIGHTH ? snapped : e.start
    out.push({ ...e, start, end: Math.max(e.end, start + 1) })
  })
  return out.map((e, i) => ({ ...e, end: Math.min(e.end, out[i + 1]?.start ?? Infinity) }))
}

/** The tune sung legato: a note followed by a gap shorter than a beat is held to the next note (Basic Pitch lets go early). */
export function legato(events) {
  return events.map((e, i) => {
    const next = events[i + 1]
    const gap = next ? next.start - e.end : 0
    return gap > 0 && gap < BREATH ? { ...e, end: next.start } : e
  })
}

const outside = (midi, { low, high }) => (midi < low ? low - midi : midi > high ? midi - high : 0)
const KEY_COST = 0.15 // per semitone the key moves: a little out of range beats a new key

/**
 * The transposition (semitones, −24 … 24) that best fits `events` (the
 * tune) in `voice`'s range: least singing outside it, weighted by length,
 * then the nearest key (an octave away is the same key), then the middle
 * of the range. `octavesOnly` keeps the song's key.
 */
export function bestShift(events, voice, { octavesOnly = false } = {}) {
  const total = events.reduce((sum, e) => sum + (e.end - e.start), 0) || 1
  const mean = events.reduce((sum, e) => sum + e.midi * (e.end - e.start), 0) / total
  const centre = (voice.low + voice.high) / 2
  let best = { shift: 0, cost: Infinity }
  for (let shift = -24; shift <= 24; shift += 1) {
    const steps = ((shift % 12) + 12) % 12
    if (octavesOnly && steps) continue
    const away = events.reduce((sum, e) => sum + outside(e.midi + shift, voice) * (e.end - e.start), 0) / total
    const cost = away + KEY_COST * Math.min(steps, 12 - steps) + 0.01 * Math.abs(mean + shift - centre)
    if (cost < best.cost) best = { shift, cost }
  }
  return best.shift
}

const REACH = 4 // semitones past a part's range a note may go before it's taken for an octave error

/**
 * A tune's note moved by octaves to within REACH of `voice`'s range: one
 * that far out is Basic Pitch hearing an overtone (or a note an octave
 * low), and no singer of that part could sing it as written anyway.
 */
export function reach(midi, voice) {
  let p = midi
  while (p > voice.high + REACH && p - 12 >= voice.low - REACH) p -= 12
  while (p < voice.low - REACH && p + 12 <= voice.high + REACH) p += 12
  return p
}

// ── The key ──────────────────────────────────────────────────────────────

// Krumhansl–Kessler key profiles.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5] // C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const KIND = Object.fromEntries(KINDS.map((k) => [k.quality, k]))

const correlation = (a, b) => {
  const ma = a.reduce((s, v) => s + v, 0) / 12
  const mb = b.reduce((s, v) => s + v, 0) / 12
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < 12; i += 1) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

/**
 * The key of a tune (`events`) over its `chords` (one per beat, or null):
 * { tonic (0…11), minor, fifths (the key signature), name ('Eb major') },
 * by the Krumhansl–Schmuckler method on how long each pitch class sounds,
 * the tune's and the chords' alike.
 */
export function estimateKey(events, chords) {
  const weight = new Array(12).fill(0)
  for (const e of events) weight[e.midi % 12] += (e.end - e.start) / SLOTS_PER_BEAT
  for (const chord of chords) {
    if (!chord) continue
    for (const interval of KIND[chord.kind].intervals) weight[(chord.root + interval) % 12] += 1
  }
  let best = { tonic: 0, minor: false, score: -Infinity }
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const rotated = weight.map((_, i) => weight[(i + tonic) % 12])
    for (const [minor, profile] of [[false, MAJOR], [true, MINOR]]) {
      const score = correlation(rotated, profile)
      if (score > best.score) best = { tonic, minor, score }
    }
  }
  const { tonic, minor } = best
  const fifths = MAJOR_FIFTHS[minor ? (tonic + 3) % 12 : tonic]
  const name = `${(fifths < 0 ? FLAT_NAMES : SHARP_NAMES)[tonic]} ${minor ? 'minor' : 'major'}`
  return { tonic, minor, fifths, name }
}

// ── The chords ───────────────────────────────────────────────────────────

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
const OUT_OF_SCALE = 0.12 // a chord with a note outside the song's scale …
const ROOT_OUT_OF_SCALE = 0.2 // … or its root outside it (a passing chord, or noise)
const SEVENTH = 0.03 // a seventh chord where a plain triad would do: a backing group holds triads
const NO_CHORD = 0.4 // a beat matching no chord better than this (penalties included) has none: where the band is unclear, the group holds on
const CHANGE_AT_BAR = 0.04 // changing chord at a bar line, …
const CHANGE_AT_HALF = 0.12 // … halfway through a bar, …
const CHANGE_ELSEWHERE = 1 // … or on another beat (all but ruled out: a beat's perfect fit)

const chordTones = (chord) => KIND[chord.kind].intervals.map((i) => (chord.root + i) % 12)

/**
 * How much of each pitch class was sung on each beat: `line` (leadLine's,
 * in seconds) against the beat clock's `toBeats`, as an array per beat
 * of twelve seconds-long weights (sparse: beats without singing are
 * undefined).
 */
export function sungByBeat(line, toBeats, beats) {
  const out = new Array(beats)
  for (const note of line) {
    const from = toBeats(note.start)
    const to = toBeats(note.end)
    for (let b = Math.max(0, Math.floor(from)); b < Math.min(beats, Math.ceil(to)); b += 1) {
      const within = Math.min(to, b + 1) - Math.max(from, b)
      if (within <= 0) continue
      ;(out[b] ??= new Array(12).fill(0))[((note.midi % 12) + 12) % 12] += within
    }
  }
  return out
}

/**
 * The seven notes the song is made of: the major (or harmonic minor)
 * scale holding the most of the beats' pitch profiles (chords.js's
 * beatChroma) and of the sung tune (`sung`, sungByBeat's), each as a
 * share of its whole — the tune counts as much as the rest of the band,
 * since a singer's notes are heard cleanly where a mix's profile is
 * blurred by drums and distortion. A scale rather than a key: a song in
 * F Dorian (Fm, B♭, E♭, A♭) is made of E♭ major's notes whatever its
 * tonic, and a key guessed from the tune alone can land a fifth away
 * and mis-spell every chord. A Set of pitch classes, or null with
 * nothing heard.
 */
export function songScale(profiles, sung = []) {
  const share = (vectors) => {
    const total = new Array(12).fill(0)
    for (const v of vectors) if (v) for (let pc = 0; pc < 12; pc += 1) total[pc] += v[pc]
    const sum = total.reduce((a, b) => a + b, 0)
    return sum > 0 ? total.map((m) => m / sum) : null
  }
  const band = share(profiles.filter((p) => p.energy > 0).map((p) => p.chroma))
  const tune = share(sung)
  if (!band && !tune) return null
  const mass = Array.from({ length: 12 }, (_, pc) => (band?.[pc] ?? 0) + (tune?.[pc] ?? 0))
  let best = null
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const pcs = MAJOR_SCALE.map((i) => (tonic + i) % 12)
    const held = pcs.reduce((sum, pc) => sum + mass[pc], 0)
    if (!best || held > best.held) best = { held, pcs }
  }
  return new Set(best.pcs)
}

/**
 * The song's chord on each beat, for the arrangement: from the beats'
 * pitch profiles (chords.js's beatChroma) and the song's `scale`
 * (songScale's), the templates' fit with a bonus for chords in the scale,
 * smoothed so the chord changes at a bar line, less readily halfway
 * through a bar, and hardly ever elsewhere — one chord a bar or two, as
 * a backing group holds them, where the beat-by-beat recognition
 * (recognizeChords) follows every passing harmony. `bars` as
 * arrangeSong's. Returns beat chords.
 */
export function songChords(profiles, scale, { beatsPerBar = 4, firstDownbeat = 0, sung = null } = {}) {
  const inScale = (pc) => !scale || scale.has(pc)
  const bonus = TEMPLATES.map(({ root, kind }) => {
    const fit = chordTones({ root, kind }).every(inScale) ? 0 : inScale(root) ? -OUT_OF_SCALE : -ROOT_OUT_OF_SCALE
    return fit - (KIND[kind].intervals.length > 3 ? SEVENTH : 0)
  })
  const position = (t) => (((t - firstDownbeat) % beatsPerBar) + beatsPerBar) % beatsPerBar
  const halfBar = beatsPerBar % 2 === 0 ? beatsPerBar / 2 : null
  const changeCost = (t) => (position(t) === 0 ? CHANGE_AT_BAR : position(t) === halfBar ? CHANGE_AT_HALF : CHANGE_ELSEWHERE)
  // chords.js's "no chord" bar is set for a guitar draft naming every passing chord; a backing group would rather hold the chord through an unclear beat.
  const emission = chordEmission(sung ? heardWithTune(profiles, sung) : profiles, bonus).map((row) => (row.at(-1) === 1 ? row : [...row.slice(0, -1), NO_CHORD]))
  return pathChords(smoothChords(emission, changeCost))
}

const TUNE_WEIGHT = 0.6 // of a beat's profile (unit length): what the singer's note adds to it

/**
 * The beats' profiles with the sung tune added in (`sung`, sungByBeat's):
 * the singer's note is the one pitch heard for certain on a beat, and
 * nearly always a note of the chord.
 */
export function heardWithTune(profiles, sung) {
  return profiles.map((profile, b) => {
    const voice = sung[b]
    if (!voice) return profile
    const total = voice.reduce((a, v) => a + v, 0)
    if (!total) return profile
    const mixed = profile.chroma.map((c, pc) => c + (TUNE_WEIGHT * voice[pc]) / total)
    const norm = Math.hypot(...mixed)
    return { ...profile, chroma: mixed.map((c) => c / norm), energy: Math.max(profile.energy, 1) }
  })
}

/**
 * Without the beats' profiles: `chords` (recognizeChords', one a beat)
 * held by the half-bar — each half-bar's commonest chord on all its beats.
 */
export function gridChords(chords, { beatsPerBar = 4, firstDownbeat = 0 } = {}) {
  const half = beatsPerBar % 2 === 0 ? beatsPerBar / 2 : beatsPerBar
  const out = chords.slice()
  for (let from = ((firstDownbeat % half) + half) % half - half; from < chords.length; from += half) {
    const window = chords.slice(Math.max(from, 0), from + half)
    if (!window.length) continue
    const counts = new Map()
    for (const chord of window) counts.set(chord?.id ?? null, (counts.get(chord?.id ?? null) ?? 0) + 1)
    const top = [...counts.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]
    const chord = window.find((c) => (c?.id ?? null) === top) ?? null
    for (let b = Math.max(from, 0); b < Math.min(from + half, chords.length); b += 1) out[b] = chord
  }
  return out
}

// ── The harmony ──────────────────────────────────────────────────────────

/**
 * Where the harmony parts sing a new chord, and what over: [{ start, end,
 * chord, melody (the tune's note at the start, or null), low, high (the
 * tune's lowest and highest pitch in the segment, or null) }], chord null
 * for silence. `chordAt(slot)` is the chord on the beat a sixteenth is in.
 */
export function harmonySegments(melody, chordAt, { measures, beatsPerBar, followTune = true, everyBar = false }) {
  const perBar = beatsPerBar * SLOTS_PER_BEAT
  const total = measures * perBar
  const sounding = (slot) => melody.find((e) => e.start <= slot && e.end > slot) ?? null
  const starts = new Set([0])
  let previous
  for (let slot = 0; slot < total; slot += SLOTS_PER_BEAT) {
    const chord = chordAt(slot)
    if (chord?.id !== previous?.id) starts.add(slot)
    previous = chord
  }
  melody.forEach((note, i) => {
    const chord = chordAt(note.start)
    const onEighth = note.start % (SLOTS_PER_BEAT / 2) === 0
    if (followTune && onEighth && chord && (chordTones(chord).includes(note.midi % 12) || note.end - note.start >= SLOTS_PER_BEAT)) starts.add(note.start)
    // A rest of a beat or more: the harmony goes on, voiced afresh without the tune.
    const next = melody[i + 1]?.start ?? total
    if (next - note.end >= SLOTS_PER_BEAT) starts.add(note.end)
  })
  // While the tune rests (or, `everyBar`, always), the chords are restated every bar.
  for (let bar = perBar; bar < total; bar += perBar) if (everyBar || !sounding(bar)) starts.add(bar)

  const ordered = [...starts].filter((s) => s < total).sort((a, b) => a - b)
  return ordered.map((start, i) => {
    const end = ordered[i + 1] ?? total
    const over = melody.filter((e) => e.start < end && e.end > start)
    return {
      start,
      end,
      chord: chordAt(start),
      melody: sounding(start)?.midi ?? null,
      low: over.length ? Math.min(...over.map((e) => e.midi)) : null,
      high: over.length ? Math.max(...over.map((e) => e.midi)) : null,
    }
  })
}

const KEEP = 40 // candidate voicings per chord, best first

/** The candidate voicings of one segment for the parts `harmony` (indices), as [{ pitches (by part, the tune's part null), cost }]. */
function candidates(segment, voices, tune, harmony, solo = false) {
  const tones = chordTones(segment.chord)
  const kind = segment.chord.kind
  const [root, third, fifth, seventh] = tones
  const hasThird = kind !== 'sus2' && kind !== 'sus4'
  const options = harmony.map((v) => {
    const out = []
    for (let p = voices[v].low; p <= voices[v].high; p += 1) if (tones.includes(p % 12)) out.push(p)
    return out
  })
  const results = []
  const pitches = new Array(voices.length).fill(null)
  const lowest = voices.length - 1
  const local = () => {
    let cost = 0
    const sung = pitches.map((p, v) => (v === tune ? segment.melody : p))
    // Parts in order, apart enough, and not crossing the tune.
    for (const v of harmony) {
      const p = pitches[v]
      if (!solo && segment.high !== null && v < tune && p <= segment.high) cost += 20
      if (!solo && segment.low !== null && v > tune && p >= segment.low) cost += 20
      const centre = (voices[v].low + voices[v].high) / 2
      cost += 0.04 * Math.abs(p - centre) + 0.4 * Math.max(0, voices[v].low + 2 - p, p - (voices[v].high - 2))
    }
    for (let v = 0; v + 1 < voices.length; v += 1) {
      const [a, b] = [sung[v], sung[v + 1]]
      if (a === null || b === null) continue
      if (solo && (v === tune || v + 1 === tune)) continue // the soloist sits anywhere
      if (a <= b) cost += 20
      const room = v + 1 === lowest ? 19 : 12
      if (a - b > room) cost += 1.5 * (a - b - room)
    }
    // The bass on the root, or else an inversion.
    const bass = sung[lowest]
    if (bass !== null) {
      const pc = bass % 12
      cost += pc === root ? 0 : pc === third && hasThird ? 1.2 : pc === fifth ? 2 : 2.5
    }
    // The chord complete, without the wrong doublings.
    const count = (pc) => sung.filter((p) => p !== null && p % 12 === pc).length
    if (!count(root)) cost += 3
    if (hasThird && !count(third)) cost += 2.5
    if (!count(fifth)) cost += 0.4
    if (seventh !== undefined && !count(seventh)) cost += 1
    if (hasThird && count(third) > 1) cost += 1.2
    if (seventh !== undefined && count(seventh) > 1) cost += 3
    return cost
  }
  const walk = (k) => {
    if (k === harmony.length) {
      results.push({ pitches: pitches.slice(), cost: local() })
      return
    }
    for (const p of options[k]) {
      // Each part below the one before it (the parts in `harmony` run top to bottom).
      if (k > 0 && p >= pitches[harmony[k - 1]]) continue
      pitches[harmony[k]] = p
      walk(k + 1)
    }
    pitches[harmony[k]] = null
  }
  walk(0)
  return results.sort((a, b) => a.cost - b.cost).slice(0, KEEP)
}

/** Moving from one voicing to the next: how far the parts go (the bass may leap), and parallel fifths and octaves. */
function motionCost(before, after, voices, harmony) {
  let cost = 0
  for (const v of harmony) {
    const move = Math.abs(after[v] - before[v])
    const weight = v === voices.length - 1 ? 0.5 : 1
    cost += weight * (0.12 * move + 0.25 * Math.max(0, move - 7))
  }
  for (let a = 0; a < voices.length; a += 1) {
    for (let b = a + 1; b < voices.length; b += 1) {
      if ([before[a], before[b], after[a], after[b]].includes(null)) continue
      const was = (before[a] - before[b]) % 12
      const is = (after[a] - after[b]) % 12
      const same = (after[a] - before[a]) * (after[b] - before[b]) > 0
      if (same && was === is && (is === 0 || is === 7)) cost += 1.5
    }
  }
  return cost
}

/**
 * The harmony parts' pitches for `segments` (harmonySegments'), as one
 * array per segment (by part; the tune's part and silent segments null),
 * chosen together by a Viterbi pass over each stretch of sung chords.
 */
export function voiceSegments(segments, voices, tune, { solo = false } = {}) {
  const harmony = voices.map((_, v) => v).filter((v) => v !== tune)
  const out = segments.map(() => null)
  let i = 0
  while (i < segments.length) {
    if (!segments[i].chord) {
      i += 1
      continue
    }
    let j = i
    while (j < segments.length && segments[j].chord) j += 1
    // Segments i … j - 1 sing without a break.
    const layers = []
    for (let s = i; s < j; s += 1) {
      const options = candidates(segments[s], voices, tune, harmony, solo)
      const withTune = (pitches) => pitches.map((p, v) => (v === tune ? segments[s].melody : p))
      if (s === i) layers.push(options.map((o) => ({ ...o, total: o.cost, from: -1 })))
      else {
        layers.push(
          options.map((o) => {
            let best = { total: Infinity, from: -1 }
            layers.at(-1).forEach((prev, k) => {
              const total = prev.total + o.cost + motionCost(prev.pitches, withTune(o.pitches), voices, harmony)
              if (total < best.total) best = { total, from: k }
            })
            return { ...o, ...best }
          }),
        )
      }
      // With the tune's pitch filled in, for the motion to the next segment.
      layers.at(-1).forEach((o) => {
        o.pitches = withTune(o.pitches)
      })
    }
    let k = layers.at(-1).reduce((best, o, n, all) => (o.total < all[best].total ? n : best), 0)
    for (let s = j - 1; s >= i; s -= 1) {
      const chosen = layers[s - i][k]
      out[s] = chosen.pitches.map((p, v) => (v === tune ? null : p))
      k = chosen.from
    }
    i = j
  }
  return out
}

/**
 * `chord` sung plainly by `backing` (voices, top part first): the bass on
 * the root in its lowest octave that lets the chord sit in everyone's
 * range, the other parts stacked close above it (third, fifth, then the
 * seventh or the root again). Returns the pitches by part, top first.
 */
export function blockChord(chord, backing) {
  const [root, ...rest] = chordTones(chord)
  const upper = [...rest, root].slice(0, backing.length - 1) // what the parts above the bass sing, lowest first
  const bass = backing.at(-1)
  let best = null
  for (let b = bass.low; b <= bass.high; b += 1) {
    if (b % 12 !== root) continue
    const pitches = [b]
    for (const pc of upper) {
      let p = pitches.at(-1) + 1
      while (p % 12 !== pc) p += 1
      pitches.push(p)
    }
    const byPart = pitches.reverse() // top first, like `backing`
    const out = byPart.reduce((sum, p, v) => sum + outside(p, backing[v]), 0)
    if (!best || out < best.out) best = { byPart, out }
    if (out === 0) break // the lowest octave that fits
  }
  return best.byPart
}

// ── The score ────────────────────────────────────────────────────────────

const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The arrangement. `notes` are Basic Pitch's on the separated vocals,
 * `chords` the song's chord on each beat (chords.js), `profiles` the
 * beats' pitch profiles they came from (beatChroma's; the chords are heard
 * again from them for the arrangement, songChords — without them, `chords`
 * are held by the half-bar), `bars` its beats
 * (beats.js: { beats, beatsPerBar, firstDownbeat }). Options: `voicing`
 * (a VOICINGS key), `melodyPart` (the part that sings the tune, one of
 * that voicing's `melody`), `keepKey` (move the tune by octaves only),
 * `title`. `words` (lyrics.js's, timed in the recording) are written under
 * the tune, and under the other parts where they sing with it; where they
 * hold the chords alone, they sing "oo". A `solo` voicing's backing holds
 * each chord as a plain block chord (blockChord) under the soloist, on
 * "oo" while the soloist sings and "ah" while it rests, words or not,
 * changing only with the chords and restated each bar. Returns { musicXml, parts: [{
 * name, events }], voicing, melodyPart (the part with the tune), shift
 * (semitones the song moved), key, bpm, beatsPerBar, measures, lyrics
 * (whether any words were placed) }, or null when no singing was heard.
 */
export function arrangeSong({ notes, chords, bars, words = null, profiles = null }, { voicing = 'ttbb', melodyPart = 0, keepKey = false, title = '' } = {}) {
  const ensemble = VOICINGS[voicing]
  if (!ensemble) throw new Error(`No such voicing: ${voicing}`)
  const tune = ensemble.melody.includes(melodyPart) ? melodyPart : ensemble.melody[0]
  const { voices } = ensemble
  const line = leadLine(notes)
  if (!line.length) return null

  const beatsPerBar = bars.beatsPerBar ?? 4
  const firstDownbeat = bars.firstDownbeat ?? 0
  const { toBeats, period } = beatClock(bars.beats)
  // Bar 1 is a bar before the tune comes in (a long intro is left out).
  const earliest = toBeats(line[0].start)
  const origin = firstDownbeat + (Math.floor((earliest + 0.5 / SLOTS_PER_BEAT - firstDownbeat) / beatsPerBar) - 1) * beatsPerBar
  const toSlot = (seconds) => Math.round((toBeats(seconds) - origin) * SLOTS_PER_BEAT)
  const placed = legato(snapToEighths(tidy(placeLine(line, toSlot))))
  // The song's chords for the arrangement, heard again with the tune, in the song's own scale.
  const heard = sungByBeat(line, toBeats, chords.length)
  const track =
    profiles?.length && profiles.length === chords.length
      ? songChords(profiles, songScale(profiles, heard), { beatsPerBar, firstDownbeat, sung: heard })
      : gridChords(chords, { beatsPerBar, firstDownbeat })

  const shift = bestShift(placed, voices[tune], { octavesOnly: keepKey })
  const steps = ((shift % 12) + 12) % 12
  const tuned = placed.map((e) => ({ ...e, midi: reach(e.midi + shift, voices[tune]) }))
  const melody = words?.length ? placeLyrics(tuned, words, toSlot) : tuned
  const moved = (chord) => (chord ? { root: (chord.root + steps) % 12, kind: chord.kind, id: chordId((chord.root + steps) % 12, chord.kind) } : null)
  const perBar = beatsPerBar * SLOTS_PER_BEAT
  const measures = Math.ceil(melody.at(-1).end / perBar) + 1 // and a bar after it ends
  const chordAt = (slot) => moved(track[origin + Math.floor(slot / SLOTS_PER_BEAT)] ?? null)

  const solo = Boolean(ensemble.solo)
  const segments = harmonySegments(melody, chordAt, { measures, beatsPerBar, followTune: !solo, everyBar: solo })
  const voiced = solo
    ? segments.map((s) => (s.chord ? [null, ...blockChord(s.chord, voices.slice(1))] : null))
    : voiceSegments(segments, voices, tune)
  // The other parts sing the tune's syllable when they start with it, and "oo" holding chords on their own.
  // A backing group holds each chord on "oo" under the soloist, and "ah" while the soloist rests.
  const lyricAt = new Map(melody.filter((e) => e.lyric).map((e) => [e.start, e.lyric]))
  const sung = lyricAt.size > 0
  const soloSings = (s) => melody.some((e) => e.start < s.end && e.end > s.start)
  const harmonyLyric = (i) => {
    const s = segments[i]
    if (solo) {
      if (soloSings(s)) return { text: 'oo', syllabic: 'single' }
      return i === 0 || soloSings(segments[i - 1]) || !voiced[i - 1] ? { text: 'ah', syllabic: 'single' } : null
    }
    if (!sung) return null
    if (s.melody !== null) return lyricAt.get(s.start) ?? null
    return i === 0 || segments[i - 1].melody !== null || !voiced[i - 1] ? { text: 'oo', syllabic: 'single' } : null
  }
  const parts = voices.map((voice, v) => ({
    name: voice.name,
    events:
      v === tune
        ? melody
        : segments.flatMap((s, i) => {
            if (!voiced[i]) return []
            const lyric = harmonyLyric(i)
            return [{ start: s.start, end: s.end, midi: voiced[i][v], ...(lyric ? { lyric } : {}) }]
          }),
  }))

  const beatChords = Array.from({ length: measures * beatsPerBar }, (_, b) => chordAt(b * SLOTS_PER_BEAT))
  const key = estimateKey(melody, beatChords)
  const harmonies = []
  beatChords.forEach((chord, b) => {
    if (chord && chord.id !== beatChords[b - 1]?.id) harmonies.push({ slot: b * SLOTS_PER_BEAT, xml: harmonyXml(chord) })
  })
  const bpm = 60 / period
  const xml = parts.map((part, v) => ({
    id: `P${v + 1}`,
    name: part.name,
    xml: partXml(part.events, {
      id: `P${v + 1}`,
      beatsPerBar,
      measures,
      clef: voices[v].clef,
      fifths: key.fifths,
      tempo: bpm,
      harmonies: v === 0 ? harmonies : [],
    }),
  }))
  let musicXml = scoreXml(xml)
  if (title) musicXml = musicXml.replace('<score-partwise version="4.0">', `<score-partwise version="4.0"><work><work-title>${escapeXml(title)}</work-title></work>`)
  return { musicXml, parts, voicing, melodyPart: tune, shift, key, bpm, beatsPerBar, measures, lyrics: sung }
}
