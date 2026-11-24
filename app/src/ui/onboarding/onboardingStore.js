const KEY = 'harmonic.onboarding.v1'
const empty = () => ({ welcome: null, seen: [], micAccepted: false })

export function readOnboarding() {
  try {
    const record = JSON.parse(globalThis.localStorage.getItem(KEY))
    if (!record || ![null, 'done', 'dismissed'].includes(record.welcome)
      || !Array.isArray(record.seen) || !record.seen.every((id) => typeof id === 'string')
      || typeof record.micAccepted !== 'boolean') return empty()
    return record
  } catch {
    return empty()
  }
}

function write(record) {
  try {
    globalThis.localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    // Keep the current session usable when storage is unavailable.
  }
  return record
}

export const isSeen = (id, record = readOnboarding()) => record.seen.includes(id)
export const markSeen = (id, record = readOnboarding()) =>
  write({ ...record, seen: [...new Set([...record.seen, id])] })
export const resetTips = (record = readOnboarding()) => write({ ...record, seen: [] })
export const setWelcome = (welcome, record = readOnboarding()) => write({ ...record, welcome })
export const acceptMicrophone = (record = readOnboarding()) => write({ ...record, micAccepted: true })

export function shouldShowWelcome(url, record = readOnboarding()) {
  const params = new URL(url, 'https://harmonic.invalid').searchParams
  return record.welcome === null && !params.has('attempt') && !params.has('invite')
}
