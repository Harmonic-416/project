import JSZip from 'jszip'
import { parseMidiFile } from '../midi/parseMidi.js'
import { midiToMusicXml } from '../midi/midiToMusicXml.js'

/**
 * Notation import. Everything the Vocal tab can open goes through here and
 * comes out as `{ format, title, content, sourceBytes }`, where `content` is
 * always a MusicXML string — what SheetMusicViewer hands to OSMD and what
 * the cloud library stores.
 *
 *   MIDI      → midiToMusicXml (our converter)  → MusicXML string
 *   MusicXML  → validated text                  → MusicXML string
 *   MXL       → unzipped, root file located     → MusicXML string
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

/** MXL = zip; META-INF/container.xml names the root score file. */
export async function unzipMxl(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const container = zip.file('META-INF/container.xml')
  const rootPath = container
    ? (await container.async('string')).match(/<rootfile[^>]*full-path="([^"]+)"/)?.[1]
    : null
  const entry =
    (rootPath && zip.file(rootPath)) ||
    Object.values(zip.files).find(
      (file) => !file.dir && !file.name.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(file.name),
    )
  if (!entry) throw new Error('This MXL archive has no MusicXML file inside.')
  return entry.async('string')
}

function validateMusicXml(text) {
  if (/<score-timewise[\s>]/.test(text)) {
    throw new Error('Timewise MusicXML is not supported yet — export the file as partwise.')
  }
  if (!/<score-partwise[\s>]/.test(text)) {
    throw new Error('This file is not MusicXML (no <score-partwise> root).')
  }
  return text
}

export async function loadNotation(arrayBuffer, filename, { title } = {}) {
  const format = detectNotationFormat(filename, arrayBuffer)
  const resolvedTitle = title ?? titleFromFilename(filename)

  if (format === 'midi') {
    const midi = await parseMidiFile(arrayBuffer)
    const { musicXml } = midiToMusicXml(midi)
    return { format, title: resolvedTitle, content: musicXml, sourceBytes: arrayBuffer }
  }

  if (format === 'mxl') {
    const content = validateMusicXml(await unzipMxl(arrayBuffer))
    return { format, title: resolvedTitle, content, sourceBytes: arrayBuffer }
  }

  const content = validateMusicXml(new TextDecoder().decode(arrayBuffer))
  return { format: 'musicxml', title: resolvedTitle, content, sourceBytes: arrayBuffer }
}
