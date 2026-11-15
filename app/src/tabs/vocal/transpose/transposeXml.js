/**
 * Transpose a partwise MusicXML score by a number of semitones, the way an
 * engraver would: the key signature moves to the key with the fewest
 * accidentals (keyFit's transposeFifths), and every note moves by the
 * interval between the two keys — a letter name and an alteration, not just
 * a MIDI number — so C major down 3 is A major, its G becomes E and its F#
 * becomes D#. Chord symbols (<harmony>) move with the notes, and the
 * accidentals a file prints are rewritten to match.
 *
 * MIDI files spell every black key as a sharp whatever the key
 * (midi/pitch.js), so for them (`respell`) each note is spelled afresh in the
 * new key instead: diatonic notes from its scale, the others as sharps in a
 * sharp key and flats in a flat one.
 *
 * Everything downstream reads the transposed score: the viewer renders it,
 * and the score model (notation/scoreModel.js) — playback, the cursor, wait
 * mode and pitch scoring — is derived from what was rendered, so they all
 * move together.
 *
 * Plain string handling, like notation/partFilter.js, so it runs in Node
 * tests too. Pure; unit-tested in app/tests/transposeXml.test.js.
 */
import { transposeFifths } from './keyFit.js'

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const STEP_PC = [0, 2, 4, 5, 7, 9, 11]
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const ACCIDENTAL_TEXT = { '-2': 'flat-flat', '-1': 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' }

const PART_RE = /(<part\s[^>]*>)([\s\S]*?)(<\/part>)/g
// The things in a part that carry pitch or key, in document order.
const TOKEN_RE = /<key\b[^>]*>[\s\S]*?<\/key>|<note\b[^>]*>[\s\S]*?<\/note>|<harmony\b[^>]*>[\s\S]*?<\/harmony>/g

const mod = (n, m) => ((n % m) + m) % m

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
  let best = null
  for (let step = 0; step < 7; step += 1) {
    for (let alter = -2; alter <= 2; alter += 1) {
      if (mod(STEP_PC[step] + alter, 12) !== pc) continue
      const change = alter - keyAlter(step, fifths)
      let cost
      if (change === 0) cost = 0
      else if (Math.abs(change) === 1) cost = (change > 0) === (fifths >= 0) ? 1 : 1.5
      else cost = 5
      if (Math.abs(alter) === 2) cost += 5
      // E#, B#, Cb, Fb read as typos outside keys that need them.
      if (change !== 0 && ((alter === 1 && (step === 2 || step === 6)) || (alter === -1 && (step === 0 || step === 3)))) cost += 1
      if (!best || cost < best.cost) best = { step, alter, cost }
    }
  }
  return { step: STEPS[best.step], alter: best.alter }
}

/** MIDI note → { step, alter, octave } spelled in the key of `fifths`. */
export function spellMidi(midi, fifths = 0) {
  const { step, alter } = spellPitchClass(mod(midi, 12), fifths)
  const octave = Math.round((midi - STEP_PC[STEPS.indexOf(step)] - alter) / 12) - 1
  return { step, alter, octave }
}

/** { step, alter, octave } → MIDI note. */
export function pitchToMidi({ step, alter = 0, octave }) {
  return (octave + 1) * 12 + STEP_PC[STEPS.indexOf(step)] + alter
}

/**
 * The interval between key `fifths` and the key it becomes: how many
 * letters to move (`steps`) for `semitones`. C → A (down 3) is down a
 * sixth's worth of letters within the octave: −2 letters.
 */
export function keyInterval(fifths, semitones) {
  const newFifths = transposeFifths(fifths, semitones)
  const letters = mod((newFifths - fifths) * 4, 7) // a fifth up is four letters up
  // The member of that letter class nearest the size of the move.
  const target = (semitones * 7) / 12
  let steps = letters
  while (steps - target > 3.5) steps -= 7
  while (target - steps > 3.5) steps += 7
  return { newFifths, steps }
}

/** A pitch moved `semitones` by `steps` letters; falls back to spelling by key when the alteration would run past a double. */
export function transposePitch(pitch, semitones, steps, newFifths) {
  const midi = pitchToMidi(pitch) + semitones
  const index = STEPS.indexOf(pitch.step) + steps
  const step = mod(index, 7)
  const octave = pitch.octave + Math.floor(index / 7)
  const alter = midi - pitchToMidi({ step: STEPS[step], alter: 0, octave })
  if (Math.abs(alter) > 2) return spellMidi(midi, newFifths)
  return { step: STEPS[step], alter, octave }
}

const tag = (xml, name) => xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1]?.trim()

function setPitch(noteXml, { step, alter, octave }) {
  return noteXml.replace(/<pitch\b[^>]*>[\s\S]*?<\/pitch>/, (pitchXml) => {
    const open = pitchXml.match(/^<pitch\b[^>]*>/)[0]
    const alterXml = alter ? `<alter>${alter}</alter>` : ''
    return `${open}<step>${step}</step>${alterXml}<octave>${octave}</octave></pitch>`
  })
}

/** A printed accidental, rewritten to the new alteration (attributes such as cautionary kept). */
function setAccidental(noteXml, alter) {
  return noteXml.replace(/(<accidental\b[^>]*>)[\s\S]*?(<\/accidental>)/, (m, open, close) => `${open}${ACCIDENTAL_TEXT[alter]}${close}`)
}

function moveChordStep(harmonyXml, which, semitones, steps, newFifths) {
  const stepRe = new RegExp(`<${which}-step\\b[^>]*>\\s*([A-G])\\s*</${which}-step>(\\s*<${which}-alter\\b[^>]*>\\s*(-?[\\d.]+)\\s*</${which}-alter>)?`)
  return harmonyXml.replace(stepRe, (m, letter, alterPart, alterValue) => {
    const moved = transposePitch({ step: letter, alter: Number(alterValue ?? 0), octave: 4 }, semitones, steps, newFifths)
    const alterXml = moved.alter ? `<${which}-alter>${moved.alter}</${which}-alter>` : ''
    return `<${which}-step>${moved.step}</${which}-step>${alterXml}`
  })
}

const CLEF_RE = /<clef\b[^>]*>[\s\S]*?<\/clef>/g
const TREBLE_8VB = '<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>'
const TREBLE = '<clef><sign>G</sign><line>2</line></clef>'
// A treble part whose notes average below the staff (under E4) reads better
// in the tenor's treble-8vb clef; one in treble-8vb averaging A4 or above
// (on the staff an octave up, it would float above it) in plain treble.
const OCTAVE_DOWN_BELOW = 64
const OCTAVE_BACK_FROM = 69

/**
 * A one-staff treble part moved down into a man's range would sit on
 * ledger lines below the staff; a tenor's treble-8vb clef puts it back on
 * the staff (and the other way round when a tenor part moves up). Parts
 * with other clefs, several staves or clef changes are left as written.
 */
function fitClef(body) {
  if (/<staves>\s*([2-9]|\d\d)/.test(body)) return body
  const clefs = body.match(CLEF_RE) ?? []
  if (clefs.length !== 1) return body
  const [clef] = clefs
  const sign = tag(clef, 'sign')
  const line = tag(clef, 'line') ?? '2'
  if (sign !== 'G' || line !== '2') return body
  const octaveChange = Number(tag(clef, 'clef-octave-change') ?? 0)
  const pitches = [...body.matchAll(/<pitch\b[^>]*>([\s\S]*?)<\/pitch>/g)].map((m) =>
    pitchToMidi({ step: tag(m[1], 'step'), alter: Number(tag(m[1], 'alter') ?? 0), octave: Number(tag(m[1], 'octave')) }),
  )
  if (!pitches.length) return body
  const mean = pitches.reduce((sum, p) => sum + p, 0) / pitches.length
  if (octaveChange === 0 && mean < OCTAVE_DOWN_BELOW) return body.replace(clef, TREBLE_8VB)
  if (octaveChange === -1 && mean >= OCTAVE_BACK_FROM) return body.replace(clef, TREBLE)
  return body
}

/**
 * The score moved `semitones` (any integer; 0 returns it unchanged).
 * `respell`: spell every note afresh in the new key (for MIDI-born scores).
 */
export function transposeMusicXml(xml, semitones, { respell = false } = {}) {
  if (!semitones || !xml) return xml
  return xml.replace(PART_RE, (whole, open, body, close) => {
    let fifths = 0
    let interval = keyInterval(0, semitones)
    const moved = body.replace(TOKEN_RE, (token) => {
      if (token.startsWith('<key')) {
        const written = Number(tag(token, 'fifths'))
        if (!Number.isFinite(written)) return token // a non-traditional key: left as written
        fifths = written
        interval = keyInterval(fifths, semitones)
        return token.replace(/(<fifths\b[^>]*>)\s*-?\d+\s*(<\/fifths>)/, `$1${interval.newFifths}$2`)
      }
      if (token.startsWith('<harmony')) {
        const rooted = moveChordStep(token, 'root', semitones, interval.steps, interval.newFifths)
        return moveChordStep(rooted, 'bass', semitones, interval.steps, interval.newFifths)
      }
      const pitchXml = token.match(/<pitch\b[^>]*>([\s\S]*?)<\/pitch>/)?.[1]
      if (!pitchXml) return token // rests and unpitched percussion
      const pitch = {
        step: tag(pitchXml, 'step'),
        alter: Math.round(Number(tag(pitchXml, 'alter') ?? 0)),
        octave: Number(tag(pitchXml, 'octave')),
      }
      if (!STEPS.includes(pitch.step) || !Number.isFinite(pitch.octave)) return token
      const next = respell
        ? spellMidi(pitchToMidi(pitch) + semitones, interval.newFifths)
        : transposePitch(pitch, semitones, interval.steps, interval.newFifths)
      return setAccidental(setPitch(token, next), next.alter)
    })
    return `${open}${fitClef(moved)}${close}`
  })
}

/** The first key in the score: { fifths, mode } (C major when it has none). */
export function readKey(xml) {
  const key = xml?.match(/<key\b[^>]*>([\s\S]*?)<\/key>/)?.[1] ?? ''
  const fifths = Number(tag(key, 'fifths'))
  const mode = tag(key, 'mode') === 'minor' ? 'minor' : 'major'
  return { fifths: Number.isFinite(fifths) ? fifths : 0, mode }
}

/**
 * Part `partId`'s notes (the first part's when null), for fitting its key:
 * [{ midi, duration }] with duration in quarter notes (<duration> over the
 * part's <divisions>). Rests and unpitched notes are left out; a grace note
 * has no length, so it counts only as a note to reach.
 */
export function readPartNotes(xml, partId = null) {
  if (!xml) return []
  const parts = [...xml.matchAll(PART_RE)]
  const match = partId == null ? parts[0] : parts.find((m) => m[1].match(/\bid=(["'])(.*?)\1/)?.[2] === partId)
  if (!match) return []
  const notes = []
  let divisions = 1
  for (const [token] of match[2].matchAll(/<divisions>\s*([\d.]+)\s*<\/divisions>|<note\b[^>]*>[\s\S]*?<\/note>/g)) {
    if (token.startsWith('<divisions')) {
      divisions = Number(tag(token, 'divisions')) || 1
      continue
    }
    const pitchXml = token.match(/<pitch\b[^>]*>([\s\S]*?)<\/pitch>/)?.[1]
    if (!pitchXml) continue
    const midi = pitchToMidi({ step: tag(pitchXml, 'step'), alter: Number(tag(pitchXml, 'alter') ?? 0), octave: Number(tag(pitchXml, 'octave')) })
    if (!Number.isFinite(midi)) continue
    notes.push({ midi, duration: /<grace\b/.test(token) ? 0 : Number(tag(token, 'duration') ?? 0) / divisions })
  }
  return notes
}
