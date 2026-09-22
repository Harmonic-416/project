import { parseMidiFile } from '../midi/parseMidi.js'
import { midiToMusicXml } from '../midi/midiToMusicXml.js'

/**
 * Notation import. Everything the Vocal tab can open goes through here and
 * comes out as `{ format, title, content, sourceBytes }`, where `content` is
 * what SheetMusicViewer hands to OSMD: a MusicXML string, or — for compressed
 * .mxl — a binary string that OSMD unzips itself.
 *
 *   MIDI      → midiToMusicXml (our converter)  → MusicXML string
 *   MusicXML  → validated text                  → MusicXML string
 *   MXL       → raw zip bytes                   → binary string
 */

export const NOTATION_EXTENSIONS = ['mid', 'midi', 'musicxml', 'xml', 'mxl']

export const NOTATION_ACCEPT = [
  ...NOTATION_EXTENSIONS.map((ext) => `.${ext}`),
  'audio/midi',
  'audio/x-midi',
  'application/vnd.recordare.musicxml+xml',
  'application/vnd.recordare.musicxml',
].join(',')

export function titleFromFilename(filename) {
  const base = filename.replace(/\.[a-z0-9]+$/i, '')
  return base.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Container format from the extension first, then a byte sniff. */
export function detectNotationFormat(filename, bytes) {
  const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
  if (ext === 'mid' || ext === 'midi') return 'midi'
  if (ext === 'mxl') return 'mxl'
  if (ext === 'musicxml' || ext === 'xml') return 'musicxml'
  const head = String.fromCharCode(...new Uint8Array(bytes).subarray(0, 4))
  if (head === 'MThd') return 'midi'
  if (head.startsWith('PK')) return 'mxl'
  return 'musicxml'
}

function toBinaryString(bytes) {
  const u8 = new Uint8Array(bytes)
  let out = ''
  for (let i = 0; i < u8.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  }
  return out
}

export async function loadNotation(arrayBuffer, filename) {
  const format = detectNotationFormat(filename, arrayBuffer)
  const title = titleFromFilename(filename)

  if (format === 'midi') {
    const midi = await parseMidiFile(arrayBuffer)
    const { musicXml } = midiToMusicXml(midi)
    return { format, title, content: musicXml, sourceBytes: arrayBuffer }
  }

  if (format === 'mxl') {
    return { format, title, content: toBinaryString(arrayBuffer), sourceBytes: arrayBuffer }
  }

  const text = new TextDecoder().decode(arrayBuffer)
  if (/<score-timewise[\s>]/.test(text)) {
    throw new Error('Timewise MusicXML is not supported yet — export the file as partwise.')
  }
  if (!/<score-partwise[\s>]/.test(text)) {
    throw new Error('This file is not MusicXML (no <score-partwise> root).')
  }
  return { format: 'musicxml', title, content: text, sourceBytes: arrayBuffer }
}
