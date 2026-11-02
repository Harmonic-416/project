import { describe, expect, it } from 'vitest'
import {
  createDynamicsTracker,
  describeDynamics,
  levelDb,
  meterFraction,
  summarizeDynamics,
} from '../src/tabs/vocal/audio/dynamics.js'

const rmsAt = (db) => 10 ** (db / 20)
// Frames every 1/60 s from `from` to `to` seconds, at the level `dbAt(t)`.
function frames(from, to, dbAt) {
  const out = []
  for (let t = from; t < to; t += 1 / 60) out.push({ time: t, rms: rmsAt(dbAt(t)) })
  return out
}

describe('levels', () => {
  it('turns rms into dBFS and a meter fraction', () => {
    expect(levelDb(1)).toBeCloseTo(0)
    expect(levelDb(0.1)).toBeCloseTo(-20)
    expect(levelDb(0)).toBe(-120)
    expect(meterFraction(-80)).toBe(0)
    expect(meterFraction(0)).toBe(1)
    expect(meterFraction(-28)).toBeCloseTo(0.5)
  })
})

describe('createDynamicsTracker', () => {
  const run = (samples) => {
    const tracker = createDynamicsTracker()
    let last = null
    for (const s of samples) last = tracker.push(s.time, s.rms)
    return last
  }

  it('hears a steady note as steady', () => {
    expect(run(frames(0, 2, () => -25)).trend).toBe('steady')
  })

  it('hears a crescendo rising and a diminuendo falling', () => {
    expect(run(frames(0, 2, (t) => -40 + 10 * t)).trend).toBe('rising')
    expect(run(frames(0, 2, (t) => -20 - 10 * t)).trend).toBe('falling')
  })

  it('does not call a direction from a fraction of a second', () => {
    expect(run(frames(0, 0.2, (t) => -40 + 50 * t)).trend).toBe('steady')
  })

  it('starts each phrase afresh after a breath', () => {
    const tracker = createDynamicsTracker()
    for (const s of frames(0, 2, (t) => -40 + 10 * t)) tracker.push(s.time, s.rms)
    expect(tracker.read().trend).toBe('rising')
    const after = tracker.push(3, rmsAt(-30))
    expect(after.trend).toBe('steady')
    expect(after.db).toBeCloseTo(-30)
  })

  it('ignores the jitter of a held note', () => {
    expect(run(frames(0, 2, (t) => -25 + 1.5 * Math.sin(t * 40))).trend).toBe('steady')
  })

  it('reads nothing once the singing stops', () => {
    const tracker = createDynamicsTracker()
    for (const s of frames(0, 1, () => -25)) tracker.push(s.time, s.rms)
    expect(tracker.read(1.1)).not.toBeNull()
    expect(tracker.read(2)).toBeNull()
  })

  it('reads nothing before any singing', () => {
    expect(createDynamicsTracker().read()).toBeNull()
  })
})

describe('summarizeDynamics', () => {
  it('finds a swell and a fade in one phrase', () => {
    // 2 s up from -40 to -20, then 2 s down to -38.
    const samples = frames(0, 4, (t) => (t < 2 ? -40 + 10 * t : -20 - 9 * (t - 2)))
    const summary = summarizeDynamics(samples)
    expect(summary.crescendos).toBe(1)
    expect(summary.diminuendos).toBe(1)
    expect(summary.swings[0].kind).toBe('crescendo')
    expect(summary.swings[0].changeDb).toBeGreaterThan(15)
    expect(summary.rangeDb).toBeGreaterThan(12)
  })

  it('calls an even line even, note attacks and all', () => {
    // Quarter notes at -25 dB, each with a quick 4 dB attack bump and a short gap.
    const samples = []
    for (let n = 0; n < 8; n += 1) samples.push(...frames(n * 0.5, n * 0.5 + 0.4, (t) => -25 + (t - n * 0.5 < 0.05 ? 4 : 0)))
    const summary = summarizeDynamics(samples)
    expect(summary.swings).toEqual([])
    expect(summary.rangeDb).toBeLessThan(4)
    expect(describeDynamics(summary)).toMatch(/even volume/)
  })

  it('does not join a swell across a breath', () => {
    // Soft phrase, a 1 s breath, loud phrase: louder overall, but no crescendo was sung.
    const samples = [...frames(0, 2, () => -40), ...frames(3, 5, () => -20)]
    const summary = summarizeDynamics(samples)
    expect(summary.swings).toEqual([])
    expect(summary.rangeDb).toBeGreaterThan(15)
  })

  it('needs some singing', () => {
    expect(summarizeDynamics([])).toBeNull()
    expect(summarizeDynamics([{ time: 0, rms: 0.1 }])).toBeNull()
    expect(describeDynamics(null)).toBeNull()
  })

  it('describes the swings in words', () => {
    expect(describeDynamics({ rangeDb: 14.4, crescendos: 2, diminuendos: 1 })).toBe(
      'Dynamics: 14 dB from softest to loudest · 2 crescendos, 1 diminuendo',
    )
    expect(describeDynamics({ rangeDb: 8, crescendos: 0, diminuendos: 0 })).toBe(
      'Dynamics: 8 dB from softest to loudest · no clear swells or fades',
    )
  })
})
