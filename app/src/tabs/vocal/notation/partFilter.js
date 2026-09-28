/**
 * Rearrange a partwise MusicXML score around one part, so the Vocal tab can
 * practise that part: the viewer is handed either that part alone
 * (extractPart) or every part with it on top (partOnTop). Either way the
 * practised part is the rendered score's first part, and the score model,
 * playback schedule and cursor all follow from rendering it
 * (notation/scoreModel.js).
 *
 * Plain string handling rather than DOMParser so it runs in Node tests too.
 * That's safe here because partwise MusicXML keeps each part in one
 * non-nested <part id="…"> block, listed by a <score-part id="…"> entry.
 */

const PART_RE = /<part\s[^>]*?\bid=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/part>/g
const SCORE_PART_RE = /<score-part\s[^>]*?\bid=(["'])(.*?)\1[^>]*>[\s\S]*?<\/score-part>/g
const PART_GROUP_RE = /<part-group\b[^>]*\/>|<part-group\b[^>]*>[\s\S]*?<\/part-group>/g
const MEASURE_RE = /(<measure\b[^>]*>)([\s\S]*?)(<\/measure>)/g
// Tempo marks: a <direction> carrying <sound tempo>, or a bare <sound tempo/>.
const TEMPO_RE = /<direction\b[^>]*>(?:(?!<\/direction>)[\s\S])*?<sound\b[^>]*\btempo=[\s\S]*?<\/direction>|<sound\b[^>]*\btempo=[^>]*\/>/g

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : match
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

function partBodies(xml) {
  return new Map([...xml.matchAll(PART_RE)].map((m) => [m[2], m[3]]))
}

/**
 * The parts that have notes, in score order: { id, name }, named as in the
 * file (MIDI track name / MusicXML part-name). Blank or repeated names get
 * numbered so every tab reads differently.
 */
export function listParts(xml) {
  const bodies = partBodies(xml)
  const parts = []
  for (const [entry, , id] of xml.matchAll(SCORE_PART_RE)) {
    if (!/<(pitch|unpitched)\b/.test(bodies.get(id) ?? '')) continue
    const raw = entry.match(/<part-name\b[^>]*>([\s\S]*?)<\/part-name>/)?.[1] ?? ''
    parts.push({ id, name: decodeEntities(raw).trim() })
  }
  parts.forEach((part, i) => {
    if (!part.name) part.name = `Part ${i + 1}`
  })
  const counts = new Map()
  for (const part of parts) counts.set(part.name, (counts.get(part.name) ?? 0) + 1)
  const seen = new Map()
  return parts.map((part) => {
    if (counts.get(part.name) === 1) return part
    const n = (seen.get(part.name) ?? 0) + 1
    seen.set(part.name, n)
    return { ...part, name: `${part.name} ${n}` }
  })
}

/**
 * Part `partId`'s body, with tempo marks copied in (measure by measure) from
 * the part that has them when it has none — midiToMusicXml, for one, writes
 * tempo in the first part only. `from` names that part, or is null. Marks
 * land at the start of their measure: exact for the usual opening tempo,
 * approximate for a change partway through a bar.
 */
function bodyWithTempo(xml, partId) {
  const bodies = partBodies(xml)
  const body = bodies.get(partId)
  if (body === undefined) throw new Error(`No part "${partId}" in this score.`)
  if (/\btempo=/.test(body)) return { body, from: null }
  for (const [id, other] of bodies) {
    if (id === partId) continue
    const marks = [...other.matchAll(MEASURE_RE)].map((m) => (m[2].match(TEMPO_RE) ?? []).join(''))
    if (!marks.some(Boolean)) continue
    let i = 0
    return {
      body: body.replace(MEASURE_RE, (m, open, inner, close) => `${open}${marks[i++] ?? ''}${inner}${close}`),
      from: id,
    }
  }
  return { body, from: null }
}

/**
 * The score with just the parts in `order`, in that order. The first one
 * carries the tempo (moved there if another part had it). Part groups
 * (brackets/braces) are dropped since they'd no longer bracket the right parts.
 */
function arrangeParts(xml, order) {
  const [first] = order
  const { body, from } = bodyWithTempo(xml, first)
  const entries = new Map([...xml.matchAll(SCORE_PART_RE)].map((m) => [m[2], m[0]]))
  const parts = new Map([...xml.matchAll(PART_RE)].map((m) => [m[2], m[0]]))
  const partXml = (id) => {
    const whole = parts.get(id)
    if (id === first) return whole.replace(/(<part\b[^>]*>)[\s\S]*(<\/part>)$/, (m, open, close) => `${open}${body}${close}`)
    if (id === from) return whole.replace(TEMPO_RE, '') // it now lives in the first part
    return whole
  }
  const partList = order.map((id) => entries.get(id)).join('\n    ')
  const partsXml = order.map(partXml).join('\n')
  let listPlaced = false
  let partsPlaced = false
  return xml
    .replace(PART_GROUP_RE, '')
    .replace(SCORE_PART_RE, () => {
      if (listPlaced) return ''
      listPlaced = true
      return partList
    })
    .replace(PART_RE, () => {
      if (partsPlaced) return ''
      partsPlaced = true
      return partsXml
    })
}

/** The same score with only part `partId` left in it. */
export function extractPart(xml, partId) {
  return arrangeParts(xml, [partId])
}

/** The whole score with part `partId` moved to the top, the rest in their original order. */
export function partOnTop(xml, partId) {
  const ids = [...xml.matchAll(SCORE_PART_RE)].map((m) => m[2])
  if (!ids.includes(partId)) throw new Error(`No part "${partId}" in this score.`)
  return arrangeParts(xml, [partId, ...ids.filter((id) => id !== partId)])
}
