import JSZip from 'jszip'
import { MuseScoreFormatError, parseMscx } from './parseMscx.js'
import { writeMusicXml } from './writeMusicXml.js'

/**
 * MuseScore's own files, opened in the browser: .mscz (a zip whose
 * META-INF/container.xml lists the .mscx score inside) or a bare .mscx.
 * The score is converted to MusicXML (parseMscx.js → writeMusicXml.js), so
 * it goes down the same path as any MusicXML file. MuseScore 3 and 4 files
 * are read; anything that can't be read throws a MuseScoreImportError whose
 * message ends with the "export it from MuseScore" fallback.
 */

export const MUSESCORE_EXTENSIONS = ['mscz', 'mscx']

export const MUSESCORE_EXPORT_HINT =
  'In MuseScore, choose File → Export, pick MusicXML (or MIDI), and open that file here instead.'

export class MuseScoreImportError extends Error {
  constructor(reason, { cause } = {}) {
    super(`Couldn’t read this MuseScore file: ${reason}. ${MUSESCORE_EXPORT_HINT}`)
    this.name = 'MuseScoreImportError'
    this.reason = reason
    if (cause) this.cause = cause
  }
}

const MAX_SCORE_BYTES = 30 * 1024 * 1024

/** The .mscx inside an opened .mscz zip, as text. */
export async function mscxFromZip(zip) {
  const container = zip.file('META-INF/container.xml')
  let rootPath = null
  if (container) {
    const xml = await container.async('string')
    // container.xml lists every root file (style, thumbnail, audio settings…); the score is the .mscx.
    rootPath = [...xml.matchAll(/<rootfile[^>]*full-path="([^"]+)"/g)].map((m) => m[1]).find((p) => /\.mscx$/i.test(p)) ?? null
  }
  const entry =
    (rootPath && zip.file(rootPath)) ||
    Object.values(zip.files).find((f) => !f.dir && /\.mscx$/i.test(f.name) && !/^(Excerpts|META-INF)\//i.test(f.name))
  if (!entry) return null
  return entry.async('string')
}

function looksLikeZip(bytes) {
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength))
  return head[0] === 0x50 && head[1] === 0x4b
}

/**
 * MuseScore bytes (.mscz or .mscx) → { musicXml, title, version }.
 * `title` is the score's own title, or '' if it has none.
 */
export async function museScoreToMusicXml(arrayBuffer) {
  let source
  if (looksLikeZip(arrayBuffer)) {
    let zip
    try {
      zip = await JSZip.loadAsync(arrayBuffer)
    } catch (cause) {
      throw new MuseScoreImportError('the file is damaged (it is not a readable .mscz archive)', { cause })
    }
    source = await mscxFromZip(zip)
    if (source == null) throw new MuseScoreImportError('there is no score (.mscx) inside the .mscz archive')
  } else {
    source = new TextDecoder().decode(arrayBuffer)
  }
  if (source.length > MAX_SCORE_BYTES) throw new MuseScoreImportError('the score is too large to open in the browser')

  let model
  try {
    model = parseMscx(source)
  } catch (cause) {
    if (cause instanceof MuseScoreFormatError) throw new MuseScoreImportError(cause.message, { cause })
    throw new MuseScoreImportError('it uses something this importer doesn’t understand', { cause })
  }
  if (!model.staves.some((s) => s.measures.some((events) => events.some((e) => e.kind === 'chord')))) {
    throw new MuseScoreImportError('the score has no notes in it')
  }
  let musicXml
  try {
    musicXml = writeMusicXml(model)
  } catch (cause) {
    throw new MuseScoreImportError('it uses something this importer doesn’t understand', { cause })
  }
  return { musicXml, title: model.title, version: model.version }
}
