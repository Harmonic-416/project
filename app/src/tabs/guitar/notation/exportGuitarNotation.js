import * as alphaTab from '@coderline/alphatab'
import { downloadBlob, safeFilename } from '../../vocal/notation/exportNotation.js'

/** Guitar notation export: Standard MIDI File and Guitar Pro 7, both via alphaTab. */

/**
 * The score as a Standard MIDI File (format 1, one track per instrument), from
 * alphaTab's own MIDI generator — the same events alphaSynth plays. A MIDI
 * source is exported untouched, as the Vocal tab does.
 */
export function guitarMidiBytes(notation, settings = new alphaTab.Settings()) {
  if (notation.format === 'midi') return new Uint8Array(notation.sourceBytes)
  const midiFile = new alphaTab.midi.MidiFile()
  midiFile.format = alphaTab.midi.MidiFileFormat.MultiTrack
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midiFile, true)
  new alphaTab.midi.MidiFileGenerator(notation.score, settings, handler).generate()
  return midiFile.toBinary()
}

export function guitarProBytes(notation, settings = new alphaTab.Settings()) {
  return new alphaTab.exporter.Gp7Exporter().export(notation.score, settings)
}

export function exportGuitarMidi(notation) {
  const blob = new Blob([guitarMidiBytes(notation)], { type: 'audio/midi' })
  downloadBlob(blob, `${safeFilename(notation.title)}.mid`)
}

export function exportGuitarPro(notation) {
  const blob = new Blob([guitarProBytes(notation)], { type: 'application/octet-stream' })
  downloadBlob(blob, `${safeFilename(notation.title)}.gp`)
}
