import { midiToNoteName } from '../../../vocal/audio/pitchDetector.js'
import { classifyGuitarCents } from './noteJudge.js'

export function guitarNoteTarget(note) {
  const pitch = midiToNoteName(note.midi)
  if (!Number.isInteger(note.string) || note.string < 1 || note.string > 6 || !Number.isInteger(note.fret) || note.fret < 0) return pitch
  return `string ${note.string}, ${note.fret === 0 ? 'open' : `fret ${note.fret}`} (${pitch})`
}

/** Show only meaningful measured deviations, rounded to avoid false precision. */
export function pitchOffsetText(cents) {
  if (!Number.isFinite(cents) || Math.abs(cents) < 20 || Math.abs(cents) > 50) return null
  const amount = Math.round(Math.abs(cents) / 5) * 5
  return `about ${amount} cents ${cents > 0 ? 'sharp' : 'flat'}`
}

/** Coaching uses measured evidence and the target position shown in the score. */
export function guitarCoaching(result, entry) {
  if (!result || result.verdict === 'skipped') return null
  if (entry.kind === 'single') {
    const target = guitarNoteTarget(entry.notes[0])
    if (result.verdict === 'hit') {
      const offset = pitchOffsetText(result.cents)
      if (!offset) return 'Target pitch heard.'
      const pitch = midiToNoteName(entry.notes[0].midi)
      const check = entry.notes[0].fret > 0
        ? 'Check the open string in the tuner. Then fret gently just behind the fret and try again.'
        : 'Check the open string in the tuner if it keeps sounding off.'
      return `Heard ${pitch}, ${offset}. ${check}`
    }
    if (result.detected == null) return `Pick ${target} on its own and let it ring.`
    const heard = midiToNoteName(Math.round(result.detected))
    const octave = classifyGuitarCents(result.cents) === 'octave'
    return `Heard ${heard}${octave ? ' in a different octave' : ''}. Check ${target}.`
  }
  const unclear = entry.notes.find((note) => result.uncertain?.includes(note.string))
  if (result.verdict === 'hit') {
    return unclear ? `To check the overlapping pitch, pick ${guitarNoteTarget(unclear)} alone.` : null
  }
  const missing = entry.notes.filter((note) => result.strings?.[note.string] === 'bad')
  const extra = result.extra ?? []
  const muted = entry.mutedStrings?.find(({ midi }) => extra.includes(midi))
  if (muted && result.sounding > 0) {
    const first = Math.max(...entry.notes.map(({ string }) => string))
    return `Heard an extra ${midiToNoteName(muted.midi)} that may be open string ${muted.string}. Start the strum on string ${first} and leave string ${muted.string} quiet.`
  }
  const shifted = missing.flatMap((note) => extra
    .filter((midi) => Math.abs(midi - note.midi) === 1)
    .map((midi) => ({ note, midi })))
  if (shifted.length === 1) {
    const [{ note, midi }] = shifted
    return `Heard a possible ${midiToNoteName(midi)} and couldn’t confirm ${guitarNoteTarget(note)}. Check that fret, then pick the string alone without changing the chord shape.`
  }
  if (missing.length) {
    const target = guitarNoteTarget(missing[0])
    const reason = missing[0].fret === 0
      ? 'Check whether a fretting finger is touching it or the strum missed it.'
      : 'Check the fret and let the string ring on its own while holding the chord shape.'
    return `Couldn’t clearly hear ${target}${missing.length > 1 ? ` and ${missing.length - 1} other expected ${missing.length === 2 ? 'pitch' : 'pitches'}` : ''}. ${reason}`
  }
  if (extra.length) {
    return `Heard a possible extra ${midiToNoteName(extra[0])}. Strum only the marked strings.`
  }
  if (result.sounding === result.total && result.total > 0) {
    return 'The expected pitches were present, but the overall strum was unclear. Try an even strum, then check each string individually if it keeps happening.'
  }
  return 'Pick the marked strings one at a time, then strum the chord again.'
}
