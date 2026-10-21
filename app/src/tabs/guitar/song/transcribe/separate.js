import { fft } from '../../practice/chordDetect.js'
import { loadRuntime } from './onnx.js'

/**
 * The guitar of a song, on its own: Meta's HTDemucs 6-source model
 * (htdemucs_6s — drums, bass, other, vocals, guitar, piano; MIT), in the
 * export AudioWeb made for browsers (fp16 weights, attention in chunks for
 * a lower memory peak, 55 MB), run by ONNX Runtime Web on the graphics card
 * where there is one (onnx.js). Every window's guitar is checked, and if
 * the card fails or returns garbage, the rest of the song is separated on
 * the CPU instead of the job failing.
 *
 * That export leaves the spectrogram to the caller, so this module does it
 * exactly as HTDemucs does (demucs/htdemucs.py `_spec`, `_ispec`, and
 * demucs/spec.py): a 4096-point STFT every 1024 samples, normalized, with a
 * periodic Hann window and reflect padding; the model's frequency branch
 * comes back as a spectrogram, turned into sound and added to its time
 * branch. A song is cut into the model's 7.8 s windows overlapping by a
 * quarter and blended with triangular weights (demucs/apply.py
 * `apply_model`).
 *
 * The pure parts (spectrogram, windows, blending) are unit-tested in
 * app/tests/separate.test.js.
 */

export const SAMPLE_RATE = 44100
export const SEGMENT = 343980 // samples: the 7.8 s window the model was exported for
export const SOURCES = ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano']
const NFFT = 4096
const HOP = NFFT / 4
const BINS = NFFT / 2 // the Nyquist bin is dropped
export const FRAMES = Math.ceil(SEGMENT / HOP) // 336
const OVERLAP = 0.25

const MODEL_URL = 'https://huggingface.co/Andremi/audioweb-models/resolve/953d0a9e46fd364860c9413ee4c7a9aa4fbcae4b/demucs_htdemucs_6s_s78_fp16w_ca.onnx'

const HANN = Float64Array.from({ length: NFFT }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / NFFT)) // periodic, as torch.hann_window
const SCALE = 1 / Math.sqrt(NFFT) // torch.stft(normalized=True)

/** `x` padded by `left` and `right` samples mirrored about its ends (torch's "reflect"). */
function reflect(x, left, right) {
  const n = x.length
  const out = new Float64Array(left + n + right)
  for (let i = 0; i < left; i += 1) out[i] = x[left - i]
  out.set(x, left)
  for (let j = 0; j < right; j += 1) out[left + n + j] = x[n - 2 - j]
  return out
}

/**
 * One channel's spectrogram, as HTDemucs._spec: written into `into` (the
 * model's `spec` input, [channels, BINS, FRAMES, 2] row-major) for channel
 * `channel`. `x` is SEGMENT samples.
 */
export function spectrogram(x, into, channel) {
  const le = Math.ceil(x.length / HOP)
  const pad = (HOP / 2) * 3
  // HTDemucs's own padding, then torch.stft's center padding.
  const signal = reflect(reflect(x, pad, pad + le * HOP - x.length), NFFT / 2, NFFT / 2)
  const re = new Float64Array(NFFT)
  const im = new Float64Array(NFFT)
  for (let t = 0; t < le; t += 1) {
    const start = (t + 2) * HOP // frames 2 … le + 1 of the le + 4 torch makes
    for (let i = 0; i < NFFT; i += 1) {
      re[i] = signal[start + i] * HANN[i]
      im[i] = 0
    }
    fft(re, im)
    for (let f = 0; f < BINS; f += 1) {
      const at = ((channel * BINS + f) * le + t) * 2
      into[at] = re[f] * SCALE
      into[at + 1] = im[f] * SCALE
    }
  }
}

/**
 * The model's frequency branch for one source back to sound, as
 * HTDemucs._ispec: `freq` is its [4, BINS, FRAMES] output for that source
 * (channel 0 re, im, channel 1 re, im); returns [left, right] of `length`
 * samples.
 */
export function inverseSpectrogram(freq, offset, length) {
  const le = Math.ceil(length / HOP)
  const frames = le + 4 // two silent frames each side
  const pad = (HOP / 2) * 3
  const total = HOP * le + 2 * pad
  const channels = []
  for (let c = 0; c < 2; c += 1) {
    const out = new Float64Array(total + NFFT) // with torch.istft's centre padding
    const envelope = new Float64Array(total + NFFT)
    const re = new Float64Array(NFFT)
    const im = new Float64Array(NFFT)
    for (let t = 0; t < frames; t += 1) {
      const frame = t - 2
      re.fill(0)
      im.fill(0)
      if (frame >= 0 && frame < le) {
        for (let f = 0; f < BINS; f += 1) {
          // Conjugated, to invert with the forward FFT; ×√N undoes the normalization.
          re[f] = freq[offset + ((2 * c) * BINS + f) * le + frame] / SCALE
          im[f] = -freq[offset + ((2 * c + 1) * BINS + f) * le + frame] / SCALE
        }
        for (let f = 1; f < BINS; f += 1) {
          re[NFFT - f] = re[f]
          im[NFFT - f] = -im[f]
        }
      }
      fft(re, im)
      const start = t * HOP
      for (let i = 0; i < NFFT; i += 1) {
        out[start + i] += (re[i] / NFFT) * HANN[i]
        envelope[start + i] += HANN[i] * HANN[i]
      }
    }
    const x = new Float32Array(length)
    for (let i = 0; i < length; i += 1) {
      const j = NFFT / 2 + pad + i // drop torch's centre padding, then HTDemucs's
      x[i] = envelope[j] > 1e-11 ? out[j] / envelope[j] : 0
    }
    channels.push(x)
  }
  return channels
}

/** Where each window starts: SEGMENT samples, a quarter overlapping, the last running past the end. */
export function windowsFor(length, segment = SEGMENT) {
  const stride = Math.round(segment * (1 - OVERLAP))
  const starts = []
  for (let start = 0; start < length; start += stride) {
    starts.push(start)
    if (start + segment >= length) break
  }
  return starts
}

/** The triangular weight of each sample in a window (apply_model's, transition power 1). */
export function windowWeight(segment = SEGMENT) {
  const half = segment >> 1
  const weight = new Float32Array(segment)
  for (let i = 0; i < segment; i += 1) weight[i] = i < half ? i + 1 : segment - i
  const top = Math.max(...weight.subarray(half - 1, half + 1))
  for (let i = 0; i < segment; i += 1) weight[i] /= top
  return weight
}

/**
 * Blending windows back into one signal: `pieces` are [{ start, channels:
 * [left, right] }] (each `segment` long), weighted by windowWeight and
 * divided by the total weight.
 */
export function overlapAdd(pieces, length, segment = SEGMENT) {
  const weight = windowWeight(segment)
  const out = [new Float32Array(length), new Float32Array(length)]
  const total = new Float32Array(length)
  for (const { start, channels } of pieces) {
    for (let i = 0; i < segment && start + i < length; i += 1) {
      total[start + i] += weight[i]
      for (let c = 0; c < 2; c += 1) out[c][start + i] += weight[i] * channels[c][i]
    }
  }
  for (let i = 0; i < length; i += 1) {
    if (total[i] > 0) {
      out[0][i] /= total[i]
      out[1][i] /= total[i]
    }
  }
  return out
}

let separator = null // { session, gpu }, opened once and kept for the next song

/**
 * The model, on the graphics card when `providers` offers one and it takes
 * the model, otherwise on the CPU: { session, gpu }. Without `providers`
 * (the tests' runtime), ONNX Runtime's default.
 */
async function openSeparator(ort, model, providers) {
  if (!providers) return { session: await ort.InferenceSession.create(model), gpu: false }
  if (providers.includes('webgpu')) {
    try {
      return { session: await ort.InferenceSession.create(model, { executionProviders: ['webgpu'] }), gpu: true }
    } catch (err) {
      console.warn('[transcribe] The graphics card can’t run the separator; using the CPU.', err)
    }
  }
  return { session: await ort.InferenceSession.create(model, { executionProviders: ['wasm'] }), gpu: false }
}

/** The model on one window (`mix` and its `spec`): source `source` (an index into SOURCES), [left, right]. */
async function stemOf({ session }, ort, mix, spec, source) {
  const output = await session.run({
    mix: new ort.Tensor('float32', mix, [1, 2, SEGMENT]),
    spec: new ort.Tensor('float32', spec, [1, 2, BINS, FRAMES, 2]),
  })
  const time = output.time.data
  const [l, r] = inverseSpectrogram(output.freq.data, source * 4 * BINS * FRAMES, SEGMENT)
  for (let k = 0; k < SEGMENT; k += 1) {
    l[k] += time[(source * 2) * SEGMENT + k]
    r[k] += time[(source * 2 + 1) * SEGMENT + k]
  }
  return [l, r]
}

const finite = (channels) => channels.every((samples) => samples.every(Number.isFinite))

/**
 * One source of `left`/`right` (44.1 kHz) as [left, right]: `source` is one
 * of SOURCES ('guitar' for the drafts, 'vocals' for the Vocal tab's
 * arrangements). `onProgress`
 * gets 0 … 1; `signal` (an AbortSignal) stops it between windows;
 * `onDevice('gpu' | 'cpu')` says where it runs, and again if the graphics
 * card gives out (lost, out of memory, or numbers that overflowed) and the
 * rest of the song goes to the CPU. `model` (URL or bytes), `runtime` (an
 * onnxruntime module) and `providers` are for the tests, which run in Node.
 */
export async function separateSource([left, right], { source = 'guitar', onProgress, onDevice, signal, model = MODEL_URL, runtime, providers: testProviders } = {}) {
  const index = SOURCES.indexOf(source)
  if (index < 0) throw new Error(`No such source: ${source}`)
  const { ort, providers } = runtime ? { ort: runtime, providers: testProviders } : await loadRuntime()
  // The tests' runtimes are their own; the app's separator is opened once.
  let current = runtime ? await openSeparator(ort, model, providers) : (separator ??= await openSeparator(ort, model, providers))
  onDevice?.(current.gpu ? 'gpu' : 'cpu')
  const length = left.length
  const starts = windowsFor(length)
  const pieces = []
  const mix = new Float32Array(2 * SEGMENT)
  const spec = new Float32Array(2 * BINS * FRAMES * 2)
  for (const [i, start] of starts.entries()) {
    signal?.throwIfAborted()
    mix.fill(0)
    mix.set(left.subarray(start, start + SEGMENT), 0)
    mix.set(right.subarray(start, start + SEGMENT), SEGMENT)
    spectrogram(mix.subarray(0, SEGMENT), spec, 0)
    spectrogram(mix.subarray(SEGMENT), spec, 1)
    let channels = null
    try {
      channels = await stemOf(current, ort, mix, spec, index)
    } catch (err) {
      if (!current.gpu) throw err
      console.warn('[transcribe] The graphics card failed; finishing on the CPU.', err)
    }
    if (current.gpu && !(channels && finite(channels))) {
      if (channels) console.warn('[transcribe] The graphics card returned NaN or infinite values; finishing on the CPU.')
      await current.session.release().catch(() => {})
      current = await openSeparator(ort, model, ['wasm'])
      if (!runtime) separator = current
      onDevice?.('cpu')
      channels = await stemOf(current, ort, mix, spec, index)
    }
    pieces.push({ start, channels })
    onProgress?.((i + 1) / starts.length)
    await new Promise((resolve) => setTimeout(resolve, 0)) // let the page paint
  }
  return overlapAdd(pieces, length)
}

/** The guitar of `left`/`right` (44.1 kHz), as separateSource. */
export const separateGuitar = (channels, options = {}) => separateSource(channels, { ...options, source: 'guitar' })
