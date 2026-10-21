/**
 * A YouTube link, as the arranger takes it: which video it is, and its
 * title and channel (YouTube's oEmbed endpoint, which answers browsers
 * directly). The audio itself is not fetched: YouTube's terms forbid
 * downloading it, and the Vocal tab never sends a song anywhere, so the
 * recording is a file the user has (ArrangePanel.jsx). The link names the
 * arrangement and shows which performance it was made from.
 *
 * parseYouTube is pure; unit-tested in app/tests/youtube.test.js.
 */

const ID = /^[A-Za-z0-9_-]{11}$/
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'])

/**
 * `text` → { id, url } for a YouTube video (watch, youtu.be, shorts, live,
 * embed and YouTube Music links, with or without https://), or null.
 * `url` is the plain watch link.
 */
export function parseYouTube(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  let url
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol)) return null
  const host = url.hostname.toLowerCase()
  let id = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1]
  else if (HOSTS.has(host)) {
    const [first, second] = url.pathname.split('/').filter(Boolean)
    if (first === 'watch') id = url.searchParams.get('v')
    else if (['shorts', 'live', 'embed', 'v'].includes(first)) id = second
  }
  return id && ID.test(id) ? { id, url: `https://www.youtube.com/watch?v=${id}` } : null
}

/** The video's { title, author, thumbnail } from oEmbed, or null if YouTube doesn't say (private, removed, offline). */
export async function fetchVideoInfo(video, { signal, fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(video.url)}`, { signal })
    if (!response.ok) return null
    const { title, author_name: author, thumbnail_url: thumbnail } = await response.json()
    return title ? { title, author: author ?? '', thumbnail: thumbnail ?? null } : null
  } catch (err) {
    if (signal?.aborted) throw err
    return null
  }
}
