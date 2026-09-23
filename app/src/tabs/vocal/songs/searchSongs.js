/**
 * Client-side filtering for the online song browser. The catalog is small
 * enough to fetch once and filter in memory, so searching stays instant and
 * costs no extra round trips; move this to a server-side query only once the
 * catalog outgrows a single fetch.
 */

/** True when the song's title or artist contains `query`, case-insensitively. */
export function matchesQuery(item, query) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return `${item.title ?? ''} ${item.artist ?? ''}`.toLowerCase().includes(needle)
}

/** The subset of `items` matching `query`, in the order given. */
export function filterSongs(items, query) {
  if (!items) return []
  return items.filter((item) => matchesQuery(item, query))
}
