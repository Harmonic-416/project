// The Vocal tab's light progress, kept on this device only: a daily streak
// (any finished lesson, test, warm-up or practice run counts) and the best
// stars per activity. Nothing goes to the account.

const KEY = 'harmonic.vocal.progress'
const EMPTY = Object.freeze({ streak: 0, lastDay: null, stars: {} })

const listeners = new Set()
let cache = null

/** 'YYYY-MM-DD' in local time. */
export function dayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function previousDay(key) {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d - 1))
}

function storage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadProgress() {
  if (cache) return cache
  try {
    const saved = JSON.parse(storage()?.getItem(KEY) ?? 'null')
    cache = saved && typeof saved === 'object' ? { ...EMPTY, ...saved, stars: { ...(saved.stars ?? {}) } } : EMPTY
  } catch {
    cache = EMPTY
  }
  return cache
}

function save(next) {
  cache = next
  try {
    storage()?.setItem(KEY, JSON.stringify(next))
  } catch {
    // Blocked storage: kept for this visit.
  }
  listeners.forEach((fn) => fn())
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The streak as of `today`: it lapses once a whole day goes by without practice. */
export function currentStreak(progress = loadProgress(), today = new Date()) {
  const key = dayKey(today)
  if (progress.lastDay === key || progress.lastDay === previousDay(key)) return progress.streak
  return 0
}

/** Did something today? */
export function practisedToday(progress = loadProgress(), today = new Date()) {
  return progress.lastDay === dayKey(today)
}

/** Marks today as a practice day, extending or restarting the streak. */
export function recordActivity(today = new Date()) {
  const progress = loadProgress()
  const key = dayKey(today)
  if (progress.lastDay === key) return progress.streak
  const streak = progress.lastDay === previousDay(key) ? progress.streak + 1 : 1
  save({ ...progress, streak, lastDay: key })
  return streak
}

/** Keeps the best stars (0–3) for activity `id`, and counts as practice today. */
export function recordStars(id, stars, today = new Date()) {
  recordActivity(today)
  const progress = loadProgress()
  if ((progress.stars[id] ?? 0) >= stars && id in progress.stars) return
  save({ ...progress, stars: { ...progress.stars, [id]: Math.max(progress.stars[id] ?? 0, stars) } })
}

export function bestStars(id, progress = loadProgress()) {
  return progress.stars[id] ?? null
}

/** For tests: forget the cached copy so the next read comes from storage. */
export function resetProgressCache() {
  cache = null
}
