import { FrameAssembler } from '../src/audio/capture/frameAssembler.js'
import { createWindowCollector } from '../src/tabs/guitar/song/follow/listenWindows.js'
import { createPitchTracker } from '../src/tabs/vocal/audio/pitchDetector.js'

/**
 * Synthetic guitar audio for the listening tests, close enough to real
 * strings to trip the detectors the way they do: each partial is two
 * polarizations a few tenths of a hertz apart (beating, and a fast then slow
 * "two-stage" decay), partials are stretched (inharmonicity), and every pick
 * starts with a burst of noise. A string sounds one note at a time, so a
 * re-pick replaces the note it was ringing. Also keyboard clicks and room
 * noise. Deterministic: every random choice comes from a seeded generator.
 */

export const RATE = 48000
export const FRAME = 4096 // useGuitarListener's frame and hop
export const HOP = 512
const BLOCK = 128 // AudioWorklet render quantum

/** Open strings in tab numbering: 1 = high e … 6 = low E. */
export const OPEN_STRINGS = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 }

export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const gauss = (random) => Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random())
const midiToFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12)

/** One plucked steel string, `seconds` long. `weights`: partial levels, fundamental first. */
export function realString(midi, seconds, { amp = 0.3, weights = [1, 0.7, 0.45, 0.3, 0.22, 0.15], cents = 0, seed = 1, fadeOut = 0.03 } = {}) {
  const random = rng(seed)
  const out = new Float32Array(Math.max(1, Math.round(seconds * RATE)))
  const f0 = midiToFrequency(midi + cents / 100)
  weights.forEach((weight, p) => {
    const k = p + 1
    const frequency = k * f0 * Math.sqrt(1 + 1.5e-4 * k * k)
    if (frequency > 6000) return
    const beat = 0.3 + 2.2 * random() // Hz between the two polarizations
    const fast = 3 + 3 * random() + 0.8 * k // per second
    const slow = 0.5 + 0.5 * random() + 0.25 * k
    const share = 0.55 + 0.2 * random() // in the fast-decaying polarization
    const step1 = (2 * Math.PI * frequency) / RATE
    const step2 = (2 * Math.PI * (frequency + beat)) / RATE
    const phase = 2 * Math.PI * random()
    for (let i = 0; i < out.length; i += 1) {
      const t = i / RATE
      const envelope = share * Math.exp(-fast * t) * Math.sin(step1 * i + phase) + (1 - share) * Math.exp(-slow * t) * Math.sin(step2 * i + phase)
      out[i] += amp * weight * envelope * Math.min(1, t / 0.0015)
    }
  })
  for (let i = 0; i < Math.round(0.004 * RATE) && i < out.length; i += 1) {
    out[i] += amp * 0.25 * gauss(random) * Math.exp(-i / (0.001 * RATE)) // the pick
  }
  const fade = Math.min(out.length, Math.round(fadeOut * RATE))
  for (let i = 0; i < fade; i += 1) out[out.length - 1 - i] *= i / fade
  return out
}

/**
 * Guitar events [{ t, string, midi, amp?, weights?, cents? }] as audio. A new
 * note on a string damps the one before it (8 ms), as a real pick does.
 */
export function renderGuitar(seconds, events, seed = 1) {
  const out = new Float32Array(Math.round(seconds * RATE))
  const byString = new Map()
  for (const event of [...events].sort((a, b) => a.t - b.t)) {
    if (!byString.has(event.string)) byString.set(event.string, [])
    byString.get(event.string).push(event)
  }
  let n = 0
  for (const notes of byString.values()) {
    notes.forEach((event, i) => {
      const next = notes[i + 1]
      const end = next ? next.t + 0.004 : seconds
      n += 1
      const note = realString(event.midi, end - event.t, { amp: event.amp, weights: event.weights, cents: event.cents, seed: seed * 97 + n, fadeOut: next ? 0.008 : 0.03 })
      const offset = Math.round(event.t * RATE)
      for (let j = 0; j < note.length && offset + j < out.length; j += 1) out[offset + j] += note[j]
    })
  }
  return out
}

/** One picked note: `string` (tab numbering) at `fret`, at `t` seconds. */
export const pick = (t, string, fret, { amp = 0.3, weights } = {}) => ({ t, string, midi: OPEN_STRINGS[string] + fret, amp, weights })

/**
 * A downstrum of `shape` ({ string: fret }) at `t`: low string first, over
 * `spread` seconds. With `gap`, the treble half is caught that much later
 * and `second` times louder (a strum that hits the strings in two goes).
 */
export function strum(t, shape, { spread = 0.04, amp = 0.35, seed = 7, gap = 0, second = 1 } = {}) {
  const random = rng(seed)
  const strings = Object.keys(shape).map(Number).sort((a, b) => b - a)
  const half = Math.ceil(strings.length / 2)
  return strings.map((string, i) => {
    const late = gap > 0 && i >= half
    return {
      t: t + (i * spread) / Math.max(1, strings.length - 1) + (late ? gap : 0),
      string,
      midi: OPEN_STRINGS[string] + shape[string],
      amp: (amp / Math.sqrt(strings.length)) * (late ? second : 1) * (0.85 + 0.3 * random()),
      cents: (random() - 0.5) * 8,
    }
  })
}

/** A resonant noise burst: a key's click or its thud as it bottoms out. */
function burst(random, { amp, center, q = 3, tau, length }) {
  const out = new Float32Array(Math.round(length * RATE))
  const w = (2 * Math.PI * center) / RATE
  const radius = Math.exp(-w / (2 * q))
  const a1 = 2 * radius * Math.cos(w)
  const a2 = -radius * radius
  let y1 = 0
  let y2 = 0
  let peak = 0
  for (let i = 0; i < out.length; i += 1) {
    const y = gauss(random) * Math.exp(-i / RATE / tau) + a1 * y1 + a2 * y2
    y2 = y1
    y1 = y
    out[i] = y
    peak = Math.max(peak, Math.abs(y))
  }
  for (let i = 0; i < out.length; i += 1) out[i] *= amp / peak
  return out
}

/** Typing near the microphone from `from` to `to` seconds, about `keysPerSecond` keys a second. */
export function typing(seconds, from, to, { amp = 0.05, keysPerSecond = 5, seed = 1 } = {}) {
  const random = rng(seed)
  const out = new Float32Array(Math.round(seconds * RATE))
  for (let t = from; t < to; t += (1 / keysPerSecond) * (0.4 + 1.2 * random())) {
    const level = amp * (0.6 + 0.8 * random())
    const sounds = [
      [burst(random, { amp: level, center: 2500 + 1500 * random(), tau: 0.0025, length: 0.02 }), t],
      [burst(random, { amp: level * 0.6, center: 180 + 120 * random(), q: 2, tau: 0.006, length: 0.04 }), t + 0.022 + 0.01 * random()],
    ]
    for (const [sound, start] of sounds) {
      const offset = Math.round(start * RATE)
      for (let i = 0; i < sound.length && offset + i < out.length; i += 1) out[offset + i] += sound[i]
    }
  }
  return out
}

export function mix(...signals) {
  const out = new Float32Array(Math.max(...signals.map((s) => s.length)))
  for (const signal of signals) for (let i = 0; i < signal.length; i += 1) out[i] += signal[i]
  return out
}

/** `signal` with steady room noise added (`rms` ≈ 0.0007 is a quiet room, −63 dBFS). */
export function withRoomNoise(signal, rms = 0.0007, seed = 99) {
  const random = rng(seed)
  const out = Float32Array.from(signal)
  for (let i = 0; i < out.length; i += 1) out[i] += rms * gauss(random)
  return out
}

/** Audio through the real capture framing, pitch tracker and window collector: the windows, as useGuitarListener hands them on. */
export function listen(signal) {
  const assembler = new FrameAssembler({ frameSize: FRAME, hop: HOP })
  const tracker = createPitchTracker({ bufferSize: FRAME, minRms: 0.005, maxFrequency: 1400 })
  const windows = []
  const collector = createWindowCollector({ sampleRate: RATE, frameSize: FRAME, hop: HOP, onWindow: (w) => windows.push({ ...w, sampleRate: RATE }) })
  for (let start = 0; start < signal.length; start += BLOCK) {
    for (const event of assembler.push(signal.subarray(start, start + BLOCK))) {
      if (event.type === 'onset') collector.onset(event.position)
      else collector.frame({ samples: event.samples, position: event.position, level: event.level, midi: tracker.analyze(event.samples, RATE)?.midi ?? null })
    }
  }
  return windows
}
