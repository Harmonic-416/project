import { describe, expect, it } from 'vitest'
import { fetchVideoInfo, parseYouTube } from '../src/tabs/vocal/arrange/youtube.js'

const ID = 'dQw4w9WgXcQ'
const WATCH = `https://www.youtube.com/watch?v=${ID}`

describe('YouTube links', () => {
  it('reads every common form of a video link', () => {
    for (const link of [
      WATCH,
      `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}&feature=share`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `youtube.com/watch?v=${ID}`,
      `  youtu.be/${ID}  `,
    ]) {
      expect(parseYouTube(link), link).toEqual({ id: ID, url: WATCH })
    }
  })

  it('turns down what isn’t a YouTube video', () => {
    for (const text of ['', 'not a link', 'https://vimeo.com/123456', 'https://www.youtube.com/', `https://www.youtube.com/watch?v=short`, 'https://www.youtube.com/@weezer', `javascript:alert('${ID}')`, `https://evil.example/watch?v=${ID}`]) {
      expect(parseYouTube(text), text).toBeNull()
    }
  })

  it('gets the title from oEmbed, and nothing when YouTube says nothing', async () => {
    const ok = async (url) => {
      expect(url).toBe(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(WATCH)}`)
      return { ok: true, json: async () => ({ title: 'A Song', author_name: 'A Band', thumbnail_url: 'https://i.ytimg.com/x.jpg' }) }
    }
    expect(await fetchVideoInfo({ id: ID, url: WATCH }, { fetchImpl: ok })).toEqual({ title: 'A Song', author: 'A Band', thumbnail: 'https://i.ytimg.com/x.jpg' })
    expect(await fetchVideoInfo({ id: ID, url: WATCH }, { fetchImpl: async () => ({ ok: false }) })).toBeNull()
    expect(await fetchVideoInfo({ id: ID, url: WATCH }, { fetchImpl: async () => { throw new TypeError('offline') } })).toBeNull()
  })
})
