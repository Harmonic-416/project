import { model } from '@coderline/alphatab'
import { MAX_SHIFT, MIN_SHIFT, signed, transposeFifths } from '../../vocal/transpose/keyFit.js'

function* pitchedStaves(score) {
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      if (!staff.isPercussion) yield staff
    }
  }
}

function* pitchedNotes(staff) {
  for (const bar of staff.bars) {
    for (const voice of bar.voices) {
      for (const beat of voice.beats) {
        for (const note of beat.notes) {
          if (!note.isPercussion && (note.isStringed || note.isPiano)) yield note
        }
      }
    }
  }
}

export function guitarShiftLimits(score) {
  let min = MIN_SHIFT
  let max = MAX_SHIFT
  const include = (pitch) => {
    min = Math.max(min, -pitch)
    max = Math.min(max, 127 - pitch)
  }
  for (const staff of pitchedStaves(score)) {
    for (const pitch of staff.tuning) include(pitch)
    for (const note of pitchedNotes(staff)) {
      include(note.realValue)
      include(note.calculateRealValue(false, true))
      if (note.isTrill) include(note.trillValue)
    }
  }
  // A source score that already exceeds the normal range can still open as written.
  return { min: Math.min(min, 0), max: Math.max(max, 0) }
}

function shiftChordName(name, shift) {
  const roots = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  return name.replace(/(^|\/)([A-G])([#b♯♭]?)/g, (_, prefix, root, accidental) => {
    const alteration = accidental === '#' || accidental === '♯' ? 1 : accidental ? -1 : 0
    return prefix + model.Tuning.getTextForTuning(24 + roots[root] + alteration + shift, false)
  })
}

/** One derived score supplies the renderer, MIDI generator and practice timeline. */
export function transposeGuitarScore(original, shift, limits = guitarShiftLimits(original)) {
  if (!Number.isInteger(shift) || shift < limits.min || shift > limits.max) {
    throw new RangeError('This shift would put pitches outside the supported range.')
  }
  if (!shift) return original

  const score = model.JsonConverter.jsObjectToScore(model.JsonConverter.scoreToJsObject(original))
  for (const bar of score.masterBars) bar.keySignature = transposeFifths(bar.keySignature, shift)
  for (const staff of pitchedStaves(score)) {
    if (staff.tuning.length) {
      staff.stringTuning = new model.Tuning(`Tuning ${signed(shift)}`, staff.tuning.map((pitch) => pitch + shift), false)
    }
    for (const note of pitchedNotes(staff)) {
      if (note.isPiano) {
        const pitch = note.octave * 12 + note.tone + shift
        note.octave = Math.floor(pitch / 12)
        note.tone = pitch % 12
      }
      if (note.isTrill) note.trillValue += shift
      note.accidentalMode = model.NoteAccidentalMode.Default
    }
    for (const chord of staff.chords?.values() ?? []) chord.name = shiftChordName(chord.name, shift)
  }
  return score
}
