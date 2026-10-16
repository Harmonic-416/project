import { RATE, mix, renderGuitar, rng, strum, withRoomNoise } from './guitarSignals.js'

/**
 * A synthetic band, for the guitar-isolation benchmark
 * (tests/guitarBandBenchmark.test.js): a sung tune, a synth bass and drums,
 * with a strumming guitar — or, for a song with no guitar part, a synth
 * pad playing the same chords instead. The guitar's strums are the truth.
 *
 * C – G – Am – F twice, 4/4 at 100 BPM.
 */

export const BEAT = 0.6
const LEAD = 0.5
const PROGRESSION = ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']
const SHAPES = {
  C: { 5: 3, 4: 2, 3: 0, 2: 1, 1: 0 },
  G: { 6: 3, 5: 2, 4: 0, 3: 0, 2: 0, 1: 3 },
  Am: { 5: 0, 4: 2, 3: 2, 2: 1, 1: 0 },
  F: { 4: 3, 3: 2, 2: 1, 1: 1 },
}
const ROOTS = { C: 36, G: 31, Am: 33, F: 29 } // the bass, an octave and more under the guitar
const PAD = { C: [48, 52, 55, 60], G: [43, 47, 50, 55], Am: [45, 48, 52, 57], F: [41, 45, 48, 53] }
const TUNE = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62, null]

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)

function add(out, start, samples) {
  const offset = Math.round(start * RATE)
  for (let i = 0; i < samples.length && offset + i < out.length; i += 1) out[offset + i] += samples[i]
}

/** A tone: harmonics `weights`, an attack and an exponential decay (`decay` s), `seconds` long. */
function tone(midi, seconds, { amp, weights, attack = 0.01, decay = 1, vibrato = 0 }) {
  const out = new Float32Array(Math.round(seconds * RATE))
  let phase = 0
  for (let i = 0; i < out.length; i += 1) {
    const t = i / RATE
    const wobble = vibrato && t > 0.15 ? 2 ** ((vibrato * Math.sin(2 * Math.PI * 5.5 * t)) / 1200) : 1
    phase += (2 * Math.PI * hz(midi) * wobble) / RATE
    let v = 0
    weights.forEach((w, k) => (v += w * Math.sin((k + 1) * phase)))
    const release = Math.min(1, (out.length - i) / (0.03 * RATE))
    out[i] = amp * v * Math.min(1, t / attack) * Math.exp(-t / decay) * release
  }
  return out
}

/** A drum hit: a falling sine (kick) or a noise burst (snare, hat). */
function hit(kind, random) {
  const length = { kick: 0.25, snare: 0.18, hat: 0.05 }[kind]
  const out = new Float32Array(Math.round(length * RATE))
  let phase = 0
  for (let i = 0; i < out.length; i += 1) {
    const t = i / RATE
    if (kind === 'kick') {
      phase += (2 * Math.PI * (50 + 90 * Math.exp(-t / 0.03))) / RATE
      out[i] = 0.5 * Math.sin(phase) * Math.exp(-t / 0.08)
    } else {
      const noise = random() * 2 - 1
      out[i] = (kind === 'snare' ? 0.25 : 0.08) * noise * Math.exp(-t / (kind === 'snare' ? 0.05 : 0.012))
    }
  }
  return out
}

/**
 * The band at 48 kHz mono: { samples, strums (the guitar's notes, [{ time, midi }]) }.
 * `guitar`: a strumming guitar (else a synth pad plays the chords).
 */
export function band({ guitar = true } = {}) {
  const seconds = LEAD + PROGRESSION.length * 4 * BEAT + 1.5
  const events = []
  const others = new Float32Array(Math.round(seconds * RATE))
  const random = rng(5)
  PROGRESSION.forEach((chord, bar) => {
    for (let beat = 0; beat < 4; beat += 1) {
      const t = LEAD + (bar * 4 + beat) * BEAT
      if (guitar) events.push(...strum(t, SHAPES[chord], { amp: 0.3, seed: bar * 4 + beat + 1 }))
      if (beat % 2 === 0) add(others, t, tone(ROOTS[chord], 2 * BEAT, { amp: 0.25, weights: [1, 0.5, 0.2], decay: 0.8 }))
      add(others, t, hit(beat % 2 ? 'snare' : 'kick', random))
      add(others, t, hit('hat', random))
      add(others, t + BEAT / 2, hit('hat', random))
    }
    if (!guitar) for (const midi of PAD[chord]) add(others, LEAD + bar * 4 * BEAT, tone(midi, 4 * BEAT, { amp: 0.06, weights: [1, 0.8, 0.6, 0.5, 0.4, 0.3], attack: 0.2, decay: 6 }))
  })
  TUNE.forEach((midi, i) => {
    if (midi) add(others, LEAD + i * 2 * BEAT, tone(midi, 2 * BEAT * 0.95, { amp: 0.12, weights: [1, 0.5, 0.3, 0.15], attack: 0.04, decay: 20, vibrato: 25 }))
  })
  const strings = guitar ? renderGuitar(seconds, events) : new Float32Array(others.length)
  return {
    samples: withRoomNoise(mix(strings, others)),
    strums: events.map((e) => ({ time: e.t, midi: e.midi })),
  }
}

/** `signal` (at 48 kHz) at `rate`, linearly interpolated. */
export function resampleTo(signal, rate) {
  const out = new Float32Array(Math.floor((signal.length * rate) / RATE))
  for (let i = 0; i < out.length; i += 1) {
    const at = (i * RATE) / rate
    const j = Math.floor(at)
    out[i] = signal[j] + ((signal[Math.min(j + 1, signal.length - 1)] ?? 0) - signal[j]) * (at - j)
  }
  return out
}
