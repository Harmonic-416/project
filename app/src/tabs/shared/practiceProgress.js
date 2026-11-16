const empty = Object.freeze({ streak: 0, lastDay: null, stars: {} })

/** 'YYYY-MM-DD' in local time. */
function dayKey(date = new Date()) {
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

export { dayKey }

export function createPracticeProgress(key) {
  const listeners = new Set()
  let cache = null

  function loadProgress() {
    if (cache) return cache
    try {
      const saved = JSON.parse(storage()?.getItem(key) ?? 'null')
      cache = saved && typeof saved === 'object' ? { ...empty, ...saved, stars: { ...(saved.stars ?? {}) } } : empty
    } catch {
      cache = empty
    }
    return cache
  }

  function save(next) {
    cache = next
    try {
      storage()?.setItem(key, JSON.stringify(next))
    } catch {
      // Blocked storage: kept for this visit.
    }
    listeners.forEach((fn) => fn())
  }

  function subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  /** The streak as of `today`: it lapses once a whole day goes by without practice. */
  function currentStreak(progress = loadProgress(), today = new Date()) {
    const key = dayKey(today)
    if (progress.lastDay === key || progress.lastDay === previousDay(key)) return progress.streak
    return 0
  }

  /** Did something today? */
  function practisedToday(progress = loadProgress(), today = new Date()) {
    return progress.lastDay === dayKey(today)
  }

  /** Marks today as a practice day, extending or restarting the streak. */
  function recordActivity(today = new Date()) {
    const progress = loadProgress()
    const key = dayKey(today)
    if (progress.lastDay === key) return progress.streak
    const streak = progress.lastDay === previousDay(key) ? progress.streak + 1 : 1
    save({ ...progress, streak, lastDay: key })
    return streak
  }

  /** Keeps the best stars (0–3) for activity `id`, and counts as practice today. */
  function recordStars(id, stars, today = new Date()) {
    recordActivity(today)
    const progress = loadProgress()
    if ((progress.stars[id] ?? 0) >= stars && id in progress.stars) return
    save({ ...progress, stars: { ...progress.stars, [id]: Math.max(progress.stars[id] ?? 0, stars) } })
  }

  function bestStars(id, progress = loadProgress()) {
    return progress.stars[id] ?? null
  }

  /** For tests: forget the cached copy so the next read comes from storage. */
  function resetProgressCache() {
    cache = null
  }

  return { loadProgress, subscribe, currentStreak, practisedToday, recordActivity, recordStars, bestStars, resetProgressCache }
}
