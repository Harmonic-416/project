/**
 * Small formatting helpers for Home. Pure, unit-tested in
 * app/tests/homeFormat.test.js.
 */

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function timeAgo(when, now = Date.now()) {
  const then = typeof when === 'number' ? when : new Date(when).getTime()
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** A friend's { display_name, avatar_url } shaped like a signed-in user, for <Avatar>. */
export function personAsUser(person) {
  return {
    email: '',
    user_metadata: { full_name: person?.display_name ?? '', avatar_url: person?.avatar_url ?? null },
  }
}

/** "62%" with at most one decimal. */
export function percent(value) {
  return `${Math.round(Number(value) * 10) / 10}%`
}

/** "Ben", "Ben and Ana", "Ben, Ana and 2 others". */
export function namesList(names) {
  const clean = names.map((n) => n || 'a friend')
  if (clean.length <= 1) return clean[0] ?? ''
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`
  if (clean.length === 3) return `${clean[0]}, ${clean[1]} and ${clean[2]}`
  return `${clean[0]}, ${clean[1]} and ${clean.length - 2} others`
}

/** "note 4" or "notes 4–9" (1-based) from note-timeline indexes, for trouble spots. */
export function noteRange({ from, to }) {
  return from === to ? `note ${from + 1}` : `notes ${from + 1}–${to + 1}`
}

const INSTRUMENT_LABEL = { guitar: 'Guitar', voice: 'Vocal' }

/** "Guitar · Lead": the part only when it adds something ("Guitar · Guitar" is just "Guitar"). */
export function songMeta(instrument, partName) {
  const label = INSTRUMENT_LABEL[instrument] ?? instrument
  return partName && partName.trim().toLowerCase() !== label.toLowerCase() ? `${label} · ${partName}` : label
}