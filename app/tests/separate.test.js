import { describe, expect, it } from 'vitest'
import { graphicsCard } from '../src/tabs/guitar/song/transcribe/onnx.js'
import { FRAMES, SEGMENT, inverseSpectrogram, overlapAdd, separateGuitar, spectrogram, windowWeight, windowsFor } from '../src/tabs/guitar/song/transcribe/separate.js'

const BINS = 2048

/**
 * A stand-in for onnxruntime: the separator's sessions return silence, or,
 * on the graphics card ('webgpu'), fail as `card` says: 'nan' (NaN out),
 * 'lost' (a run throws) or 'no-session' (the model won't open).
 * `opened` lists the execution provider of each session made.
 */
function fakeRuntime(card = 'ok') {
  const opened = []
  const silence = { freq: { data: new Float32Array(6 * 4 * BINS * FRAMES) }, time: { data: new Float32Array(6 * 2 * SEGMENT) } }
  const garbage = { ...silence, freq: { data: new Float32Array(6 * 4 * BINS * FRAMES).fill(Number.NaN) } }
  class Tensor {
    constructor(type, data, dims) {
      Object.assign(this, { type, data, dims })
    }
  }
  const InferenceSession = {
    async create(model, options) {
      const provider = options?.executionProviders?.[0] ?? 'default'
      if (provider === 'webgpu' && card === 'no-session') throw new Error('no adapter')
      opened.push(provider)
      return {
        async run() {
          if (provider === 'webgpu' && card === 'lost') throw new Error('device lost')
          return provider === 'webgpu' && card === 'nan' ? garbage : silence
        },
        async release() {},
      }
    },
  }
  return { ort: { Tensor, InferenceSession }, opened }
}

describe('the separator’s spectrogram (HTDemucs _spec / _ispec)', () => {
  it('makes the model’s 2048 × 336 input, and turns it back into the same sound', () => {
    // A stereo window of a few tones and noise.
    const left = new Float32Array(SEGMENT)
    const right = new Float32Array(SEGMENT)
    let seed = 7
    const noise = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5) * 0.02
    for (let i = 0; i < SEGMENT; i += 1) {
      left[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / 44100) + noise()
      right[i] = 0.2 * Math.sin((2 * Math.PI * 329.6 * i) / 44100) + noise()
    }
    const spec = new Float32Array(2 * BINS * FRAMES * 2)
    spectrogram(left, spec, 0)
    spectrogram(right, spec, 1)
    expect(FRAMES).toBe(336)

    // The model's frequency output is laid out [channel × (re, im), bin, frame]: rearrange the input that way and invert it.
    const freq = new Float32Array(4 * BINS * FRAMES)
    for (let c = 0; c < 2; c += 1) {
      for (let f = 0; f < BINS; f += 1) {
        for (let t = 0; t < FRAMES; t += 1) {
          const from = ((c * BINS + f) * FRAMES + t) * 2
          freq[((2 * c) * BINS + f) * FRAMES + t] = spec[from]
          freq[((2 * c + 1) * BINS + f) * FRAMES + t] = spec[from + 1]
        }
      }
    }
    const [l, r] = inverseSpectrogram(freq, 0, SEGMENT)
    let worst = 0
    for (let i = 4096; i < SEGMENT - 4096; i += 1) worst = Math.max(worst, Math.abs(l[i] - left[i]), Math.abs(r[i] - right[i]))
    expect(worst).toBeLessThan(5e-4) // float32, and the top (Nyquist) bin is dropped, as HTDemucs drops it
  }, 30000)
})

describe('cutting a song into the model’s windows and blending them back', () => {
  it('covers the song with windows a quarter overlapping', () => {
    expect(windowsFor(100, 40)).toEqual([0, 30, 60])
    expect(windowsFor(40, 40)).toEqual([0])
    expect(windowsFor(41, 40)).toEqual([0, 30])
  })

  it('blends windows back into the song, the edges of each weighing least', () => {
    const weight = windowWeight(40)
    expect(Math.max(...weight)).toBe(1)
    expect(weight[0]).toBeLessThan(0.1)
    // An identity "model": every window returns its own samples, so the blend is the song.
    const song = Float32Array.from({ length: 100 }, (_, i) => Math.sin(i / 3))
    const pieces = windowsFor(100, 40).map((start) => {
      const window = Float32Array.from({ length: 40 }, (_, i) => song[start + i] ?? 0)
      return { start, channels: [window, window] }
    })
    const [left, right] = overlapAdd(pieces, 100, 40)
    for (let i = 0; i < 100; i += 1) {
      expect(left[i]).toBeCloseTo(song[i], 5)
      expect(right[i]).toBeCloseTo(song[i], 5)
    }
  })
})

describe('where the separator runs', () => {
  const song = [new Float32Array(SEGMENT), new Float32Array(SEGMENT)] // one window
  const separate = async (card, providers = ['webgpu', 'wasm']) => {
    const { ort, opened } = fakeRuntime(card)
    const devices = []
    const [left, right] = await separateGuitar(song, { runtime: ort, providers, model: 'model.onnx', onDevice: (d) => devices.push(d) })
    return { devices, opened, finite: left.every(Number.isFinite) && right.every(Number.isFinite) }
  }

  it('uses the graphics card when it takes the model', async () => {
    expect(await separate('ok')).toEqual({ devices: ['gpu'], opened: ['webgpu'], finite: true })
  }, 30000)

  it('finishes on the CPU when the card returns NaN, or is lost mid-song', async () => {
    expect(await separate('nan')).toEqual({ devices: ['gpu', 'cpu'], opened: ['webgpu', 'wasm'], finite: true })
    expect(await separate('lost')).toEqual({ devices: ['gpu', 'cpu'], opened: ['webgpu', 'wasm'], finite: true })
  }, 30000)

  it('starts on the CPU when the card can’t open the model, or there is no card', async () => {
    expect(await separate('no-session')).toEqual({ devices: ['cpu'], opened: ['wasm'], finite: true })
    expect(await separate('ok', ['wasm'])).toEqual({ devices: ['cpu'], opened: ['wasm'], finite: true })
  }, 30000)
})

describe('choosing the graphics card', () => {
  it('takes a real graphics card', async () => {
    const card = { info: { vendor: 'nvidia', architecture: 'blackwell', isFallbackAdapter: false } }
    expect(await graphicsCard({ requestAdapter: async () => card })).toBe(card)
  })

  it('passes over software adapters, refusals and browsers without WebGPU', async () => {
    const offering = (adapter) => ({ requestAdapter: async () => adapter })
    expect(await graphicsCard(offering({ info: { isFallbackAdapter: true } }))).toBe(null)
    expect(await graphicsCard(offering({ info: {}, isFallbackAdapter: true }))).toBe(null) // before GPUAdapterInfo had it
    expect(await graphicsCard(offering(null))).toBe(null)
    expect(await graphicsCard({ requestAdapter: () => Promise.reject(new Error('blocked')) })).toBe(null)
    expect(await graphicsCard(undefined)).toBe(null) // Node: no navigator.gpu
  })
})
