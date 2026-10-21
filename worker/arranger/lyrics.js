import { spawn } from 'node:child_process'

/**
 * The words a song's singer sings, with when each is sung, for the
 * arranger's lyrics (app/src/tabs/vocal/arrange/lyrics.js puts them under
 * the notes):
 *   heard     Whisper (transformers.js on ONNX Runtime, word timestamps)
 *             on the separated vocals: every word with its time, though
 *             sung words are often misheard;
 *   official  the song's published lyrics from LRCLIB (lrclib.net, free,
 *             no key), found by the video's artist and track, when there
 *             are any: the right words, which alignLyrics then times with
 *             Whisper's.
 * Whisper's model (WHISPER_MODEL, default whisper-small) is downloaded
 * from Hugging Face once and cached.
 */

const MODEL = process.env.WHISPER_MODEL || 'onnx-community/whisper-small_timestamped'
const FFMPEG = process.env.FFMPEG || 'ffmpeg'
let recognizer = null

/** Mono 22.05 kHz → 16 kHz (Whisper's rate), by ffmpeg. */
function to16k(samples) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ['-v', 'error', '-f', 'f32le', '-ac', '1', '-ar', '22050', '-i', '-', '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'])
    const out = []
    child.stdout.on('data', (chunk) => out.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited with ${code}`))
      const buffer = Buffer.concat(out)
      resolve(new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength - (buffer.byteLength % 4))))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength))
  })
}

/** [{ text, start, end }] (seconds): the words Whisper hears in `vocals` (mono, 22.05 kHz). */
export async function hearWords(vocals, { cacheDir } = {}) {
  if (!recognizer) {
    const { env, pipeline } = await import('@huggingface/transformers')
    if (cacheDir) env.cacheDir = cacheDir
    recognizer = await pipeline('automatic-speech-recognition', MODEL, { dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' } })
  }
  const audio = await to16k(vocals)
  const { chunks = [] } = await recognizer(audio, { language: 'english', task: 'transcribe', return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 })
  return chunks
    .map(({ text, timestamp: [start, end] }) => ({ text: text.trim(), start, end: end ?? start + 0.3 }))
    .filter((w) => w.text && Number.isFinite(w.start))
}

/**
 * The song's published lyrics: { text, synced } (synced: [{ time, line }]
 * or null) from LRCLIB, or null. `artist` and `track` are the video's
 * (yt-dlp's `artist`/`track` for music, else guessed from its title);
 * `duration` (seconds) picks the right recording.
 */
export async function officialLyrics({ artist, track, duration }, { signal } = {}) {
  if (!track) return null
  const query = new URLSearchParams({ track_name: track, ...(artist ? { artist_name: artist } : {}) })
  try {
    const response = await fetch(`https://lrclib.net/api/search?${query}`, { signal, headers: { 'User-Agent': 'Harmonic arranger (CSE 416 project)' } })
    if (!response.ok) return null
    const results = (await response.json()).filter((r) => r.plainLyrics && !r.instrumental)
    if (!results.length) return null
    // The recording closest in length, preferring one with timed lines.
    results.sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration) || Boolean(b.syncedLyrics) - Boolean(a.syncedLyrics))
    const best = results[0]
    if (duration && Math.abs(best.duration - duration) > 15) return null
    const synced = best.syncedLyrics
      ? best.syncedLyrics.split('\n').flatMap((row) => {
          const m = row.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/)
          return m ? [{ time: Number(m[1]) * 60 + Number(m[2]), line: m[3] }] : []
        })
      : null
    return { text: best.plainLyrics, synced }
  } catch (err) {
    if (signal?.aborted) throw err
    return null
  }
}

/** "Weezer - Song (Official Video) [HD]" → { artist: 'Weezer', track: 'Song' }, for videos yt-dlp knows no track of. */
export function guessTrack(title, channel = '') {
  const clean = title.replace(/\s*[([][^)\]]*(official|video|audio|lyrics?|hd|4k|remaster|live|visualizer)[^)\]]*[)\]]/gi, '').trim()
  const dash = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash) return { artist: dash[1].trim(), track: dash[2].trim() }
  return { artist: channel.replace(/\s*-\s*Topic$/, '').replace(/VEVO$/i, '').trim(), track: clean }
}
