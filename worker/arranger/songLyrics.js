import { alignLyrics } from '../../app/src/tabs/vocal/arrange/lyrics.js'
import { guessTrack, hearWords, officialLyrics } from './lyrics.js'

/**
 * The lyrics for one video, as arrangeAudio's `lyrics` hook: the published
 * lyrics are looked up (LRCLIB) as soon as the video is known, and
 * `hear(vocals)` runs Whisper on the separated vocals and lines the two up
 * (alignLyrics). Lyrics are a bonus: if anything fails, the arrangement
 * goes on without them. `source()` says what was used afterwards:
 * 'official' (LRCLIB's words, timed by Whisper), 'heard' (Whisper's alone)
 * or null.
 */
export function lyricsFor(info, { cacheDir, log = () => {} }) {
  const named = info.track ? { artist: info.artist, track: info.track } : guessTrack(info.title, info.channel)
  const published = officialLyrics({ ...named, duration: info.duration }).catch(() => null)
  let source = null
  return {
    async hear(vocals) {
      try {
        const [heard, official] = await Promise.all([hearWords(vocals, { cacheDir }), published])
        const aligned = alignLyrics(heard, official)
        log(`lyrics: ${heard.length} words heard, ${official ? 'published lyrics found' : 'no published lyrics'} (${named.artist ?? '?'} – ${named.track})`)
        source = aligned.words.length ? aligned.source : null
        return aligned.words
      } catch (err) {
        log('lyrics failed:', err)
        return null
      }
    },
    source: () => source,
  }
}
