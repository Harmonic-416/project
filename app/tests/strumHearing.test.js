import { describe, expect, it } from 'vitest'
import { soundsLikeAStrum } from '../src/tabs/guitar/exercises/strumHearing.js'
import { RATE, listen, mix, realString, renderGuitar, rng, strum, withRoomNoise } from './guitarSignals.js'

/** `signal` high-passed at `cutoff` Hz, 24 dB an octave (two RBJ biquads), like the click's filter. */
function highpass(signal, cutoff) {
  let out = signal
  for (let pass = 0; pass < 2; pass += 1) {
    const w = (2 * Math.PI * cutoff) / RATE
    const alpha = Math.sin(w) / (2 * Math.SQRT1_2)
    const cos = Math.cos(w)
    const a0 = 1 + alpha
    const [b0, b1, b2] = [(1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0]
    const [a1, a2] = [(-2 * cos) / a0, (1 - alpha) / a0]
    const y = new Float32Array(out.length)
    let [x1, x2, y1, y2] = [0, 0, 0, 0]
    for (let i = 0; i < out.length; i += 1) {
      const x = out[i]
      y[i] = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
      ;[x2, x1, y2, y1] = [x1, x, y1, y[i]]
    }
    out = y
  }
  return out
}

/** The metronome's click (audio/metronome/click.js) at `at` seconds: a burst of noise above `cutoff`. */
function click(seconds, at, { cutoff = 3200, amp = 0.3 } = {}) {
  const random = rng(3)
  const noise = new Float32Array(Math.round(seconds * RATE))
  const start = Math.round(at * RATE)
  for (let i = 0; i < 0.045 * RATE; i += 1) noise[start + i] = amp * (random() * 2 - 1) * Math.exp(-i / (0.012 * RATE))
  return highpass(noise, cutoff)
}

/** A muted strum at `at`: all six strings struck and dead within 50 ms. */
function mutedStrum(seconds, at, amp = 0.35) {
  const out = new Float32Array(Math.round(seconds * RATE))
  ;[40, 45, 50, 55, 59, 64].forEach((midi, i) => {
    const note = realString(midi, 0.05, { amp: amp / 2, seed: i + 3, fadeOut: 0.04 })
    const start = Math.round((at + i * 0.006) * RATE)
    for (let k = 0; k < note.length; k += 1) out[start + k] += note[k]
  })
  return out
}

const EM = { 6: 0, 5: 2, 4: 2, 3: 0, 2: 0, 1: 0 }
const heard = (signal) => listen(withRoomNoise(signal)).map(soundsLikeAStrum)

describe('a strum, or the click coming back through the speakers?', () => {
  it('never takes the click for a strum, beat or accent, however loud', () => {
    for (const [cutoff, amp] of [[3200, 0.3], [1800, 0.6], [1800, 1.2]]) {
      const windows = heard(click(1.5, 0.5, { cutoff, amp }))
      expect(windows.length).toBeGreaterThan(0) // the mic does hear it…
      expect(windows.every((strummed) => !strummed)).toBe(true) // …and doesn't count it
    }
  })

  it('hears muted and ringing strums, soft or loud, and a strum right on the click', () => {
    expect(heard(mutedStrum(1.5, 0.5))).toContain(true)
    expect(heard(mutedStrum(1.5, 0.5, 0.1))).toContain(true)
    expect(heard(renderGuitar(1.5, strum(0.5, EM)))).toContain(true)
    expect(heard(renderGuitar(1.5, strum(0.5, EM, { amp: 0.08 })))).toContain(true)
    const accent = click(1.5, 0.5, { cutoff: 1800, amp: 1.2 })
    expect(heard(mix(mutedStrum(1.5, 0.5, 0.15), accent))).toContain(true)
    expect(heard(mix(renderGuitar(1.5, strum(0.5, EM, { amp: 0.15 })), accent))).toContain(true)
  })
})
