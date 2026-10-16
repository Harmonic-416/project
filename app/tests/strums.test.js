import { describe, expect, it } from 'vitest'
import { findStrums, pitchEvidence } from '../src/tabs/guitar/song/transcribe/strums.js'
import { resampleTo } from './bandSongs.js'
import { renderGuitar, rng, strum, withRoomNoise } from './guitarSignals.js'

const RATE = 22050
const BEAT = 0.48 // 125 BPM, By The Way's tempo
const G = { 6: 3, 5: 2, 4: 0, 3: 0, 2: 0, 1: 3 }
const frameTime = (f) => (f * 256) / RATE

/** Strums of `shape` at `times`, rendered and brought to Basic Pitch's 22.05 kHz. */
function strummed(times, shape = G, { seconds = times.at(-1) + 1.5, ...options } = {}) {
  const events = times.flatMap((t, i) => strum(t, shape, { seed: 11 + i, ...options }))
  return resampleTo(withRoomNoise(renderGuitar(seconds, events)), RATE)
}

/** Basic Pitch-like onset activations: `pitches` starting at each of `times`. */
function fakeOnsets(seconds, times, pitches) {
  const rows = Array.from({ length: Math.ceil((seconds * RATE) / 256) }, () => new Array(88).fill(0))
  for (const t of times) {
    const f = Math.round((t * RATE) / 256)
    for (const midi of pitches) for (let d = 0; d <= 2; d += 1) if (rows[f + d]) rows[f + d][midi - 21] = 0.35
  }
  return rows
}

describe('finding strums', () => {
  it('finds every re-strum of a chord still ringing, once each', () => {
    // Quarter-note strums of one chord: the case the note tracker and the ghost-note filter merge into one long note.
    const times = Array.from({ length: 8 }, (_, i) => 0.5 + i * BEAT)
    const found = findStrums(strummed(times))
    expect(found).toHaveLength(times.length)
    found.forEach((s, i) => expect(Math.abs(s.time - times[i])).toBeLessThan(0.05))
  }, 30000)

  it('finds soft strums among loud ones, and eighth-note strums', () => {
    const times = Array.from({ length: 12 }, (_, i) => 0.5 + (i * BEAT) / 2)
    const events = times.flatMap((t, i) => strum(t, G, { seed: 3 + i, amp: i % 2 ? 0.12 : 0.35 }))
    const found = findStrums(resampleTo(withRoomNoise(renderGuitar(7, events)), RATE))
    expect(found).toHaveLength(times.length)
  }, 30000)

  it('needs pitches starting, given Basic Pitch’s onsets: a drum leaking in isn’t a strum', () => {
    const times = [0.5, 0.5 + BEAT, 0.5 + 2 * BEAT, 0.5 + 3 * BEAT]
    const audio = strummed(times)
    // A snare-like burst of noise between two strums.
    const random = rng(5)
    const at = Math.round((0.5 + 1.5 * BEAT) * RATE)
    for (let i = 0; i < 0.08 * RATE; i += 1) audio[at + i] += 0.3 * (random() * 2 - 1) * Math.exp(-i / (0.02 * RATE))
    expect(findStrums(audio)).toHaveLength(times.length + 1) // the attack alone hears the drum too …
    const onsets = fakeOnsets(audio.length / RATE, times, [43, 47, 50, 55, 59, 67])
    const found = findStrums(audio, { onsets, frameTime })
    expect(found).toHaveLength(times.length) // … Basic Pitch's onsets rule it out
    found.forEach((s, i) => expect(Math.abs(s.time - times[i])).toBeLessThan(0.05))
  }, 30000)
})

describe('what sounds after a strum', () => {
  it('averages each pitch’s activation just after the strum', () => {
    const frames = Array.from({ length: 200 }, (_, f) => {
      const row = new Array(88).fill(0)
      if (frameTime(f) >= 1) for (const midi of [50, 57, 62, 65]) row[midi - 21] = 0.8 // Dm from 1 s
      return row
    })
    const evidenceAt = pitchEvidence(frames, frameTime)
    const after = evidenceAt(1)
    expect([50, 57, 62, 65].map((m) => after[m])).toEqual([0.8, 0.8, 0.8, 0.8].map((v) => expect.closeTo(v, 5)))
    expect(after[52]).toBe(0)
    expect(evidenceAt(0.5)[50]).toBe(0) // before it starts
  })
})
