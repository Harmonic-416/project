import { fft } from '../../practice/chordDetect.js'
import { loadRuntime } from './onnx.js'

/**
 * Beats and bars of a recording, in the browser: Beat This! (Foscarin,
 * Schlüter & Widmer, ISMIR 2024), the 2.1M-parameter "small0" model (MIT,
 * public/beat-this/), on ONNX Runtime Web. The model was exported from the
 * official checkpoint with a fixed 1500-frame input (an export with a
 * variable length gave wrong beats past a few seconds), and agrees with
 * PyTorch to 1e-5 (see public/beat-this/README.md). Everything around the
 * model follows the reference code (CPJKU/beat_this) so its predictions
 * match:
 *
 *   - the input: a log-mel spectrogram, as preprocessing.py's LogMelSpect
 *     (22050 Hz mono, 1024-point Hann STFT every 441 samples = 50 fps,
 *     magnitude ÷ √1024, 128 slaney mels from 30 Hz to 11 kHz, log1p(1000·x));
 *   - the chunking: 1500-frame windows overlapping by a 6-frame border,
 *     earlier windows winning (inference.py's split_piece and
 *     aggregate_prediction, "keep_first");
 *   - the peaks: local maxima within ±3 frames with a logit above 0, peaks
 *     a frame apart merged, each downbeat moved onto its nearest beat
 *     (postprocessor.py's "minimal" postprocessing).
 *
 * Pure apart from trackBeats(), which loads the model; unit-tested in
 * app/tests/beats.test.js.
 */

export const SAMPLE_RATE = 22050
export const FPS = 50
export const N_MELS = 128
export const CHUNK = 1500
export const BORDER = 6

const N_FFT = 1024
const HOP = 441
const N_FREQS = N_FFT / 2 + 1
const F_MIN = 30
const F_MAX = 11000

// The slaney mel scale, as torchaudio has it (linear below 1 kHz, logarithmic above).
const F_SP = 200 / 3
const MIN_LOG_HZ = 1000
const MIN_LOG_MEL = MIN_LOG_HZ / F_SP
const LOG_STEP = Math.log(6.4) / 27
const hzToMel = (hz) => (hz >= MIN_LOG_HZ ? MIN_LOG_MEL + Math.log(hz / MIN_LOG_HZ) / LOG_STEP : hz / F_SP)
const melToHz = (mel) => (mel >= MIN_LOG_MEL ? MIN_LOG_HZ * Math.exp(LOG_STEP * (mel - MIN_LOG_MEL)) : F_SP * mel)

/**
 * The mel filterbank, [frequency bin][mel] row-major (513 × 128), as
 * torchaudio.functional.melscale_fbanks builds it with these settings and
 * no normalisation: overlapping triangles peaking at 1.
 */
export function melFilterbank() {
  const top = Math.floor(SAMPLE_RATE / 2)
  const mMin = hzToMel(F_MIN)
  const mMax = hzToMel(F_MAX)
  const points = Array.from({ length: N_MELS + 2 }, (_, i) => melToHz(mMin + ((mMax - mMin) * i) / (N_MELS + 1)))
  const bank = new Float32Array(N_FREQS * N_MELS)
  for (let f = 0; f < N_FREQS; f += 1) {
    const hz = (top * f) / (N_FREQS - 1)
    for (let m = 0; m < N_MELS; m += 1) {
      const rising = (hz - points[m]) / (points[m + 1] - points[m])
      const falling = (points[m + 2] - hz) / (points[m + 2] - points[m + 1])
      bank[f * N_MELS + m] = Math.max(0, Math.min(rising, falling))
    }
  }
  return bank
}

let bankCache = null

/** Per mel band, the bins it covers and their weights — the bank is mostly zeros. */
function melBands() {
  if (bankCache) return bankCache
  const bank = melFilterbank()
  bankCache = Array.from({ length: N_MELS }, (_, m) => {
    let first = -1
    let last = -1
    for (let f = 0; f < N_FREQS; f += 1) {
      if (bank[f * N_MELS + m] > 0) {
        if (first < 0) first = f
        last = f
      }
    }
    const weights = first < 0 ? new Float32Array(0) : Float32Array.from({ length: last - first + 1 }, (_, i) => bank[(first + i) * N_MELS + m])
    return { first: Math.max(first, 0), weights }
  })
  return bankCache
}

/** torch's "reflect" padding: the signal mirrored about its first and last samples. */
function reflect(i, length) {
  if (length === 1) return 0
  let j = i
  while (j < 0 || j >= length) j = j < 0 ? -j : 2 * (length - 1) - j
  return j
}

/**
 * The model's input for mono 22050 Hz `samples`: { frames, data }, `data`
 * being frames × 128 log-mel values, row-major (as LogMelSpect).
 */
export function logMelSpectrogram(samples) {
  const frames = 1 + Math.floor(samples.length / HOP)
  const data = new Float32Array(frames * N_MELS)
  if (!samples.length) return { frames: 0, data: new Float32Array(0) }
  const bands = melBands()
  const window = Float64Array.from({ length: N_FFT }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT))
  const re = new Float64Array(N_FFT)
  const im = new Float64Array(N_FFT)
  const magnitude = new Float64Array(N_FREQS)
  const scale = 1 / Math.sqrt(N_FFT)
  for (let t = 0; t < frames; t += 1) {
    const start = t * HOP - N_FFT / 2
    for (let n = 0; n < N_FFT; n += 1) {
      re[n] = samples[reflect(start + n, samples.length)] * window[n]
      im[n] = 0
    }
    fft(re, im)
    for (let k = 0; k < N_FREQS; k += 1) magnitude[k] = Math.hypot(re[k], im[k]) * scale
    for (let m = 0; m < N_MELS; m += 1) {
      const { first, weights } = bands[m]
      let sum = 0
      for (let i = 0; i < weights.length; i += 1) sum += magnitude[first + i] * weights[i]
      data[t * N_MELS + m] = Math.log1p(1000 * sum)
    }
  }
  return { frames, data }
}

/**
 * Where the windows start, for a piece of `frames` frames (split_piece):
 * every CHUNK − 2·BORDER frames from −BORDER, the last moved to end with
 * the piece. Each window: { start, from, to, left, right } — the frames
 * [from, to) it takes, and the zero frames padded before and after.
 */
export function splitPiece(frames, { chunk = CHUNK, border = BORDER } = {}) {
  const starts = []
  for (let start = -border; start < frames - border; start += chunk - 2 * border) starts.push(start)
  if (frames > chunk - 2 * border) starts[starts.length - 1] = frames - (chunk - border)
  return starts.map((start) => ({
    start,
    from: Math.max(start, 0),
    to: Math.min(start + chunk, frames),
    left: Math.max(0, -start),
    right: Math.max(0, Math.min(border, start + chunk - frames)),
  }))
}

/**
 * The windows' predictions joined into one per frame (aggregate_prediction,
 * "keep_first"): each window's border dropped, earlier windows winning
 * where they overlap. `predictions[i]` is window i's logits, as long as
 * the window (padding included). Frames no window covers get −1000.
 */
export function aggregatePrediction(windows, predictions, frames, { chunk = CHUNK, border = BORDER } = {}) {
  const piece = new Float32Array(frames).fill(-1000)
  for (let i = windows.length - 1; i >= 0; i -= 1) {
    const { start } = windows[i]
    const kept = predictions[i].subarray(border, predictions[i].length - border)
    const at = start + border
    const end = Math.min(start + chunk - border, frames, at + kept.length)
    for (let f = Math.max(at, 0); f < end; f += 1) piece[f] = kept[f - at]
  }
  return piece
}

/** Frames whose logit is the highest within ±3 frames and above 0, with peaks a frame apart merged into their mean. */
export function pickPeaks(logits) {
  const peaks = []
  for (let f = 0; f < logits.length; f += 1) {
    if (!(logits[f] > 0)) continue
    let isMax = true
    for (let g = Math.max(0, f - 3); g <= Math.min(logits.length - 1, f + 3); g += 1) {
      if (logits[g] > logits[f]) {
        isMax = false
        break
      }
    }
    if (isMax) peaks.push(f)
  }
  // deduplicate_peaks(width=1): a peak within a frame of the group's running mean joins the group.
  const merged = []
  let mean = null
  let count = 0
  for (const f of peaks) {
    if (mean !== null && f - mean <= 1) {
      count += 1
      mean += (f - mean) / count
    } else {
      if (mean !== null) merged.push(mean)
      mean = f
      count = 1
    }
  }
  if (mean !== null) merged.push(mean)
  return merged
}

/** Beat and downbeat times in seconds from the model's per-frame logits, each downbeat moved onto its nearest beat. */
export function beatsFromLogits(beatLogits, downbeatLogits) {
  const beats = pickPeaks(beatLogits).map((f) => f / FPS)
  const downbeats = []
  for (const frame of pickPeaks(downbeatLogits)) {
    const time = frame / FPS
    if (!beats.length) break
    let nearest = beats[0]
    for (const beat of beats) if (Math.abs(beat - time) < Math.abs(nearest - time)) nearest = beat
    if (!downbeats.includes(nearest)) downbeats.push(nearest)
  }
  return { beats, downbeats: downbeats.sort((a, b) => a - b) }
}

/**
 * Beats the model skipped put back: a gap between two beats that's a whole
 * number (2 or more) of the usual beat length, give or take 15%, gets the
 * missing beats evenly spaced in it. A quiet bar or a break can lose a beat
 * or two, and the bars after it would all slip by that much.
 */
export function fillBeatGaps(beats) {
  if (beats.length < 3) return beats
  const gaps = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b)
  const period = gaps[gaps.length >> 1]
  const out = [beats[0]]
  for (let i = 1; i < beats.length; i += 1) {
    const gap = beats[i] - beats[i - 1]
    const missing = Math.round(gap / period)
    if (missing >= 2 && Math.abs(gap / missing - period) <= 0.15 * period) {
      for (let k = 1; k < missing; k += 1) out.push(beats[i - 1] + (gap * k) / missing)
    }
    out.push(beats[i])
  }
  return out
}

/**
 * The bar structure: beats per bar (the commonest count of beats between
 * downbeats, 2 to 7; 4 if there are too few downbeats to say) and the index
 * of the beat the first full bar starts on.
 */
export function barsOf(beats, downbeats) {
  const indexes = downbeats.map((d) => beats.indexOf(d)).filter((i) => i >= 0)
  const counts = new Map()
  for (let i = 1; i < indexes.length; i += 1) {
    const gap = indexes[i] - indexes[i - 1]
    if (gap >= 2 && gap <= 7) counts.set(gap, (counts.get(gap) ?? 0) + 1)
  }
  let beatsPerBar = 4
  let best = 0
  for (const [gap, count] of counts) {
    if (count > best || (count === best && gap === 4)) {
      beatsPerBar = gap
      best = count
    }
  }
  return { beatsPerBar, firstDownbeat: indexes[0] ?? 0 }
}

const BASE = import.meta.env?.BASE_URL ?? '/'
const MODEL_URL = `${BASE}beat-this/small0.onnx`
let session = null

/** Let the page paint (the progress bar) between windows: each one blocks the main thread for a moment. */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Beats of mono 22050 Hz `samples`: { beats, downbeats } in seconds, plus
 * barsOf()'s { beatsPerBar, firstDownbeat }. `onProgress` gets 0 … 1;
 * `signal` (an AbortSignal) stops between windows. `model` (URL or bytes)
 * and `runtime` (an onnxruntime module) are for the tests, which run in Node.
 */
export async function trackBeats(samples, { onProgress, signal, model = MODEL_URL, runtime } = {}) {
  // A small model: the CPU (WebAssembly) runs it in a moment and leaves the GPU to the separator.
  const ort = runtime ?? (await loadRuntime()).ort
  session ??= await ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
  const loaded = session
  const spect = logMelSpectrogram(samples)
  const windows = splitPiece(spect.frames)
  const beatParts = []
  const downbeatParts = []
  for (const [i, w] of windows.entries()) {
    signal?.throwIfAborted()
    // The exported graph takes exactly CHUNK frames: a shorter window (a short piece) is padded with silence.
    const length = w.left + (w.to - w.from) + w.right
    const input = new Float32Array(CHUNK * N_MELS)
    input.set(spect.data.subarray(w.from * N_MELS, w.to * N_MELS), w.left * N_MELS)
    const output = await loaded.run({ [loaded.inputNames[0]]: new ort.Tensor('float32', input, [1, CHUNK, N_MELS]) })
    beatParts.push(output.beat.data.slice(0, length))
    downbeatParts.push(output.downbeat.data.slice(0, length))
    onProgress?.((i + 1) / windows.length)
    await breathe()
  }
  const found = beatsFromLogits(
    aggregatePrediction(windows, beatParts, spect.frames),
    aggregatePrediction(windows, downbeatParts, spect.frames),
  )
  const beats = fillBeatGaps(found.beats)
  return { beats, downbeats: found.downbeats, ...barsOf(beats, found.downbeats) }
}
