import { Midi } from '@tonejs/midi'

/** Notation export: MusicXML (or the original MXL) and Standard MIDI files. */

export function safeFilename(title) {
  return title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'score'
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Serialize a score model (see scoreModel.js) to a Standard MIDI File, one
 * track per part. Timing comes from the model's seconds, so repeats are
 * written out and a tempo change becomes a tempo-map entry only if it was
 * the starting tempo — later changes are baked into note times.
 */
export function scoreModelToMidi(model, { title } = {}) {
  const midi = new Midi()
  midi.header.setTempo(model.bpm || 120)
  if (title) midi.header.name = title
  const tracks = new Map()
  for (const note of model.notes) {
    if (!tracks.has(note.partIndex)) {
      const track = midi.addTrack()
      track.name = note.partName ?? `Part ${note.partIndex + 1}`
      tracks.set(note.partIndex, track)
    }
    tracks.get(note.partIndex).addNote({ midi: note.midi, time: note.time, duration: note.duration })
  }
  return new Uint8Array(midi.toArray())
}

export function musicXmlExport(notation) {
  const name = safeFilename(notation.title)
  if (notation.format === 'mxl') {
    return { filename: `${name}.mxl`, blob: new Blob([notation.sourceBytes], { type: 'application/vnd.recordare.musicxml' }) }
  }
  return {
    filename: `${name}.musicxml`,
    blob: new Blob([notation.content], { type: 'application/vnd.recordare.musicxml+xml' }),
  }
}

export function midiExport(notation, scoreModel) {
  const name = safeFilename(notation.title)
  // A MIDI source is exported untouched; everything else is rendered from the score model.
  const bytes =
    notation.format === 'midi' ? new Uint8Array(notation.sourceBytes) : scoreModelToMidi(scoreModel, { title: notation.title })
  return { filename: `${name}.mid`, blob: new Blob([bytes], { type: 'audio/midi' }) }
}

export function exportMusicXml(notation) {
  const { filename, blob } = musicXmlExport(notation)
  downloadBlob(blob, filename)
}

export function exportMidi(notation, scoreModel) {
  const { filename, blob } = midiExport(notation, scoreModel)
  downloadBlob(blob, filename)
}
