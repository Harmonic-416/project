import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Getting a song's audio on the server: yt-dlp for a YouTube video's best
 * audio stream, ffmpeg to decode and resample it (what Web Audio does in
 * the browser). Programs come from YT_DLP and FFMPEG, or the PATH.
 */

const YT_DLP = process.env.YT_DLP || 'yt-dlp'
const FFMPEG = process.env.FFMPEG || 'ffmpeg'
export const MAX_SECONDS = 10 * 60

/** Run `command` with `args`, `input` on stdin; resolves to stdout as a Buffer. */
function run(command, args, { input = null, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], signal })
    const out = []
    let err = ''
    child.stdout.on('data', (chunk) => out.push(chunk))
    child.stderr.on('data', (chunk) => {
      err = (err + chunk).slice(-4000)
    })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(Object.assign(new Error(`${command} exited with ${code}`), { stderr: err }))))
    child.stdin.on('error', () => {}) // the program may stop reading early
    if (input) child.stdin.end(input)
    else child.stdin.end()
  })
}

/** A video's { title, duration, live, artist, track, channel } without downloading it (artist and track only for music). */
export async function videoInfo(id, { signal } = {}) {
  const json = await run(YT_DLP, ['--no-warnings', '--no-playlist', '--skip-download', '--dump-single-json', `https://www.youtube.com/watch?v=${id}`], { signal })
  const { title, duration, is_live: live, artist = null, track = null, channel = '' } = JSON.parse(json.toString('utf8'))
  return { title, duration, live: Boolean(live), artist, track, channel }
}

const ATTEMPTS = 3 // YouTube now and then answers a download with HTTP 403; the next try usually works

/** The video's best audio stream, saved in `dir`; resolves to its path. */
export async function downloadAudio(id, dir, { signal } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await run(
        YT_DLP,
        ['--no-warnings', '--no-playlist', '--no-progress', '-f', 'bestaudio', '--max-filesize', '100M', '-o', join(dir, 'audio.%(ext)s'), `https://www.youtube.com/watch?v=${id}`],
        { signal },
      )
      break
    } catch (err) {
      if (attempt >= ATTEMPTS || signal?.aborted) throw err
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt))
    }
  }
  const file = readdirSync(dir).find((name) => name.startsWith('audio.') && !name.endsWith('.part'))
  if (!file) throw new Error('yt-dlp left no audio file')
  return join(dir, file)
}

const floats = (buffer) => new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength - (buffer.byteLength % 4)))

/** A file decoded by ffmpeg: { left, right } at 44.1 kHz and `song`, mono at 22.05 kHz. */
export async function decodeFile(path, { signal } = {}) {
  const stereo = floats(await run(FFMPEG, ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', '44100', '-'], { signal }))
  const song = floats(await run(FFMPEG, ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', '22050', '-'], { signal }))
  const left = new Float32Array(stereo.length / 2)
  const right = new Float32Array(stereo.length / 2)
  for (let i = 0; i < left.length; i += 1) {
    left[i] = stereo[2 * i]
    right[i] = stereo[2 * i + 1]
  }
  return { left, right, song }
}

/** [left, right] at 44.1 kHz → mono at 22.05 kHz, by ffmpeg (arrangeAudio's `toModelRate`). */
export async function toModelRate([left, right]) {
  const interleaved = new Float32Array(left.length * 2)
  for (let i = 0; i < left.length; i += 1) {
    interleaved[2 * i] = left[i]
    interleaved[2 * i + 1] = right[i]
  }
  const input = Buffer.from(interleaved.buffer)
  return floats(await run(FFMPEG, ['-v', 'error', '-f', 'f32le', '-ac', '2', '-ar', '44100', '-i', '-', '-f', 'f32le', '-ac', '1', '-ar', '22050', '-'], { input }))
}
