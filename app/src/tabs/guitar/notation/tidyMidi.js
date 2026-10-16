import { DIVISIONS_PER_QUARTER, decomposeDuration, quantizeTicksToGrid, ticksToDivisions } from '../../vocal/midi/quantize.js'

/**
 * MIDI made from a recording (Basic Pitch and other transcribers) tidied so
 * the MIDI → MusicXML converter (vocal/midi/midiToMusicXml.js) writes it
 * faithfully. That converter expects each note to end before the next one
 * in its track begins, and a note's length to be one written value: a note
 * still ringing when the next starts delays or drops it, and an odd length
 * is split into notes struck again. A recording breaks both all the time —
 * strings ring on, a bass holds under the melody, lengths are whatever was
 * played.
 *
 * So, per track and on the converter's own sixteenth-note grid, each note
 * is shortened to end by the next onset and by the barline, to the longest
 * single written value that fits. Every note keeps its onset (its `ticks`,
 * which lyrics are matched by) and its pitch; only lengths get shorter.
 * Mutates and returns `midi` (a @tonejs/midi Midi). Unit-tested in
 * app/tests/tidyMidi.test.js.
 */
export function tidyMidiForTab(midi) {
  const ppq = midi.header.ppq
  const [numerator, denominator] = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
  const perMeasure = Math.round(numerator * (4 / denominator) * DIVISIONS_PER_QUARTER) // as midiToMusicXml
  const ticksPerDivision = ppq / DIVISIONS_PER_QUARTER
  const division = (ticks) => ticksToDivisions(quantizeTicksToGrid(ticks, ppq), ppq)

  for (const track of midi.tracks) {
    const onsets = [...new Set(track.notes.map((note) => division(note.ticks)))].sort((a, b) => a - b)
    for (const note of track.notes) {
      const start = division(note.ticks)
      const end = Math.max(start + 1, division(note.ticks + note.durationTicks)) // as midiToMusicXml
      const next = onsets.find((onset) => onset > start) ?? Infinity
      const barline = (Math.floor(start / perMeasure) + 1) * perMeasure
      const length = decomposeDuration(Math.min(end, next, barline) - start)[0].divisions
      note.durationTicks = (start + length) * ticksPerDivision - note.ticks
    }
  }
  return midi
}
