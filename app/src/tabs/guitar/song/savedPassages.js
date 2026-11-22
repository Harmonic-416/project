import { clampTempo } from '../../../audio/tempo/tempo.js'

export function savedPassagesKey(fingerprint, userId) {
  return fingerprint ? `harmonic.guitar.passages:${userId ?? 'guest'}:${fingerprint}` : null
}

export function readSavedPassages(key, barCount) {
  const empty = { passages: [], lastId: null }
  if (!key) return empty
  let data
  const stored = globalThis.localStorage.getItem(key)
  try {
    data = JSON.parse(stored)
  } catch {
    return empty
  }
  if (!Array.isArray(data?.passages)) return empty
  const passages = data.passages.filter((item) =>
    typeof item?.id === 'string' && typeof item.name === 'string' && item.name.trim() &&
    Number.isInteger(item.first) && Number.isInteger(item.last) &&
    item.first >= 0 && item.first <= item.last && item.last < barCount &&
    typeof item.tempo === 'number' && item.tempo === clampTempo(item.tempo) &&
    typeof item.loop === 'boolean',
  )
  return { passages, lastId: passages.some(({ id }) => id === data.lastId) ? data.lastId : null }
}

export function writeSavedPassages(key, data) {
  globalThis.localStorage.setItem(key, JSON.stringify(data))
}

/** Include each printed bar touched by the half-open playback range. */
export function barsTouchedByRange(bars, range) {
  if (!range || range.endTick <= range.startTick) return null
  const touched = bars.filter(({ start, end }) => start < range.endTick && end > range.startTick)
  if (!touched.length) return null
  const indexes = touched.map(({ index }) => index)
  return { first: Math.min(...indexes), last: Math.max(...indexes) }
}
