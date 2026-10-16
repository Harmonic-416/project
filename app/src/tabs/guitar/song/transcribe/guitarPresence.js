import { loadRuntime } from './onnx.js'

/**
 * Is there a guitar in this song, and where does it play? Decided on the
 * guitar the separator pulled out (separate.js), not on the whole song:
 * in a full mix a guitar under keys and synths is too buried for anything
 * to name it (YAMNet heard guitar in 0% of The Killers' "Caution", and in
 * only 5% of Red Hot Chili Peppers' guitar-led "By The Way").
 *
 * Separation always returns something. Where the song has a guitar, the
 * stem is loud against the song; where it hasn't, it's other instruments
 * leaking through — quieter, and they sound like what they are. So a
 * stretch counts as guitar when the stem is loud enough and Google's
 * YAMNet (public/yamnet/), which names the sounds in every 0.96 s every
 * 0.48 s from AudioSet's 521 classes, doesn't clearly hear a voice, synth,
 * keys, drums or electronic music in it. (Asking it to hear *guitar*
 * doesn't work: it named the guitar of "Caution", isolated, in 2% of it.)
 *
 * YAMNet on the whole song only tells a recording of just a guitar (no
 * voice, no drums), which needs no separating.
 *
 * Pure apart from yamnetScores(); unit-tested in app/tests/guitarPresence.test.js.
 */

export const YAMNET_RATE = 16000
export const HOP_SECONDS = 0.48
const CLASSES = 521
export const GUITAR_CLASSES = [135, 136, 138, 139, 140, 141] // Guitar, Electric, Acoustic, Steel, Tapping, Strum
const VOICE_CLASSES = [0, 24, 25, 31] // Speech, Singing, Choir, Rapping
const DRUM_CLASSES = [157, 159, 160, 163, 167] // Drum kit, Drum, Snare, Bass drum, Hi-hat
// What other instruments leaking into the guitar stem sound like: voices, keys and synths, drums,
// electronic genres (Hip hop, Electronic, House, Techno, Dubstep, Drum and bass, Electronica, EDM, Trance).
export const NOT_GUITAR_CLASSES = [...VOICE_CLASSES, 147, 148, 149, 150, 153, ...DRUM_CLASSES, 212, 234, 235, 236, 237, 238, 239, 240, 242]

// Set on real songs, 2026-10-16. The separated guitar against the whole song, median (10th–90th
// percentile): YOASOBI cover −6.8 dB (−10.3 … −4.8), "By The Way" −9.7 (−12.8 … −5.8), "Caution"
// −16.5 (−34.5 … −10.0) — all three with a guitar part. YAMNet heard nothing but "Music" in the stems.
const HEARD = 0.15 // a class score that counts as heard in a frame
const SOLO_SHARE = 0.6 // guitar heard in this much of a recording, and no voice or drums: a guitar on its own
const OTHERS_SHARE = 0.1
const STEM_LEVEL = -25 // dB against the song: quieter than this, the stem is only leakage
const MIN_PRESENCE = 0.1 // guitar in less of the song than this: no guitar part to teach

const BASE = import.meta.env?.BASE_URL ?? '/'
const MODEL_URL = `${BASE}yamnet/yamnet.onnx`
let session = null

/**
 * YAMNet's scores for 16 kHz mono `samples`: { frames, scores } with
 * `scores` frames × 521, frame i covering i × 0.48 s … + 0.96 s. `model`
 * (URL or bytes) and `runtime` (an onnxruntime module) are for the tests.
 */
export async function yamnetScores(samples, { model = MODEL_URL, runtime } = {}) {
  const { ort, providers } = runtime ? { ort: runtime } : await loadRuntime()
  // A small model: the CPU is as quick as the GPU, and keeps the GPU free for the separator.
  session ??= await ort.InferenceSession.create(model, providers ? { executionProviders: ['wasm'] } : undefined)
  const input = samples.length >= 15360 ? samples : Float32Array.from({ length: 15360 }, (_, i) => samples[i] ?? 0)
  const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [input.length]) })
  const scores = output[session.outputNames[0]].data
  return { frames: scores.length / CLASSES, scores }
}

/** Per frame, the strongest of `classes`. */
export function curveOf({ frames, scores }, classes) {
  const curve = new Float32Array(frames)
  for (let f = 0; f < frames; f += 1) {
    let top = 0
    for (const c of classes) top = Math.max(top, scores[f * CLASSES + c])
    curve[f] = top
  }
  return curve
}

const shareHeard = (curve) => (curve.length ? curve.filter((v) => v >= HEARD).length / curve.length : 0)

/**
 * What a recording is, from YAMNet's scores for all of it: 'solo' (a
 * guitar on its own: guitar heard in most of it, no voice, no drums) or
 * 'band'. Returns { kind, guitar, voice, drums } (shares of frames heard).
 */
export function screenRecording(yamnet) {
  const guitar = shareHeard(curveOf(yamnet, GUITAR_CLASSES))
  const voice = shareHeard(curveOf(yamnet, VOICE_CLASSES))
  const drums = shareHeard(curveOf(yamnet, DRUM_CLASSES))
  const kind = guitar >= SOLO_SHARE && voice < OTHERS_SHARE && drums < OTHERS_SHARE ? 'solo' : 'band'
  return { kind, guitar, voice, drums }
}

/** RMS level (dB) of 16 kHz `samples` in each YAMNet frame. */
export function frameLevels(samples, frames) {
  const hop = HOP_SECONDS * YAMNET_RATE
  const size = 2 * hop
  const levels = new Float32Array(frames)
  for (let f = 0; f < frames; f += 1) {
    let sum = 0
    const start = f * hop
    const end = Math.min(samples.length, start + size)
    for (let i = start; i < end; i += 1) sum += samples[i] * samples[i]
    levels[f] = 10 * Math.log10(sum / Math.max(1, end - start) + 1e-12)
  }
  return levels
}

/**
 * Where the separated guitar really is guitar: per YAMNet frame, the stem
 * at least STEM_LEVEL dB against the song, and YAMNet not hearing something
 * else in it (a voice, keys, a synth, drums, electronic music) more than it
 * hears guitar; then single frames either way smoothed over (a strum's gap,
 * a stray leak). Returns { active (Uint8Array per frame), presence (share of
 * the song's sounding frames with guitar), enough (worth a tab) }.
 */
export function guitarFrames({ stemYamnet, stemLevels, songLevels }) {
  const guitar = curveOf(stemYamnet, GUITAR_CLASSES)
  const other = curveOf(stemYamnet, NOT_GUITAR_CLASSES)
  const frames = guitar.length
  const raw = new Uint8Array(frames)
  let sounding = 0
  for (let f = 0; f < frames; f += 1) {
    const loud = songLevels[f] > -60
    if (loud) sounding += 1
    const somethingElse = other[f] >= HEARD && other[f] > guitar[f]
    raw[f] = loud && stemLevels[f] - songLevels[f] >= STEM_LEVEL && !somethingElse ? 1 : 0
  }
  const active = new Uint8Array(frames)
  for (let f = 0; f < frames; f += 1) {
    const around = (raw[f - 1] ?? raw[f]) + raw[f] + (raw[f + 1] ?? raw[f])
    active[f] = around >= 2 ? 1 : 0
  }
  const on = active.reduce((sum, v) => sum + v, 0)
  const presence = sounding ? on / sounding : 0
  return { active, presence, enough: presence >= MIN_PRESENCE }
}
