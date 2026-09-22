import { Midi } from '@tonejs/midi'

/** Thin wrapper around @tonejs/midi so callers don't depend on its API directly. */
export async function parseMidiFile(arrayBuffer) {
  const midi = new Midi(arrayBuffer)
  if (midi.tracks.every((track) => track.notes.length === 0)) {
    throw new Error('This MIDI file has no notes.')
  }
  return midi
}
