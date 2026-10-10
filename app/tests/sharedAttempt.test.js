import { describe, expect, it } from 'vitest'
import {
  MAX_TRACE_SAMPLES,
  fingerprintBytes,
  fromTrace,
  judgeNotes,
  readSharedAttemptId,
  readSharedAttemptInstrument,
  sampleVerdict,
  shareUrlFor,
  toTrace,
} from '../src/tabs/vocal/share/sharedAttempt.js'

const note = (midi, time, duration = 0.5, partIndex = 0) => ({ midi, time, duration, partIndex })

/** Pitch frames every 20 ms across [from, to). */
function frames(midi, from, to) {
  const out = []
  for (let t = from; t < to - 1e-9; t += 0.02) out.push({ time: Math.round(t * 1000) / 1000, midi })
  return out
}

describe('toTrace / fromTrace', () => {
  it('rounds, drops frames without a clock time, and round-trips', () => {
    const trace = toTrace([
      { time: 0.12345, midi: 64.0123, clarity: 0.97 },
      { time: null, midi: 60 },
      { time: 0.5, midi: Number.NaN },
    ])
    expect(trace).toEqual([[0.123, 64.01]])
    expect(fromTrace(trace)).toEqual([{ time: 0.123, midi: 64.01 }])
  })

  it('caps the trace at the size the database accepts', () => {
    const many = Array.from({ length: MAX_TRACE_SAMPLES + 10 }, (_, i) => ({ time: i / 50, midi: 60 }))
    expect(toTrace(many)).toHaveLength(MAX_TRACE_SAMPLES)
  })
})

describe('judgeNotes', () => {
  const notes = [note(64, 0), note(66, 0.5), note(69, 1), note(48, 0, 1.5, 1)]

  it('marks the notes of part 0 that were sung and the ones that were missed', () => {
    const samples = [...frames(64, 0, 0.5), ...frames(61, 0.5, 1), ...frames(69, 1, 1.5)]
    const { hit, missed, total } = judgeNotes(samples, notes)
    expect(total).toBe(3)
    expect(hit.map((n) => n.index)).toEqual([0, 2])
    expect(missed.map((n) => n.index)).toEqual([1])
  })

  it('counts an octave slip as sung and silence as missed', () => {
    const { hit, missed } = judgeNotes(frames(76, 0, 0.5), notes)
    expect(hit.map((n) => n.index)).toEqual([0])
    expect(missed.map((n) => n.index)).toEqual([1, 2])
  })
})

it('colours a sample against the note sounding at its time', () => {
  const melody = [note(64, 0), note(66, 0.5)]
  expect(sampleVerdict({ time: 0.1, midi: 64.1 }, melody)).toBe('in-tune')
  expect(sampleVerdict({ time: 0.6, midi: 78 }, melody)).toBe('octave')
  expect(sampleVerdict({ time: 0.6, midi: 70 }, melody)).toBe('wrong')
  expect(sampleVerdict({ time: 2, midi: 70 }, melody)).toBe('rest')
})

it('fingerprints identical bytes identically and different bytes differently', async () => {
  const a = await fingerprintBytes(new TextEncoder().encode('MThd one'))
  expect(a).toMatch(/^[0-9a-f]{64}$/)
  expect(await fingerprintBytes(new TextEncoder().encode('MThd one'))).toBe(a)
  expect(await fingerprintBytes(new TextEncoder().encode('MThd two'))).not.toBe(a)
})

it('builds and reads share links', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
  const url = shareUrlFor(id, 'https://harmonic.example')
  expect(url).toBe(`https://harmonic.example/?attempt=${id}`)
  expect(readSharedAttemptId(url)).toBe(id)
  expect(readSharedAttemptId('https://harmonic.example/?attempt=not-an-id')).toBeNull()
  expect(readSharedAttemptId('https://harmonic.example/')).toBeNull()
  expect(readSharedAttemptInstrument(url)).toBe('voice')
})

it('says in a guitar attempt’s link which tab opens it', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
  const url = shareUrlFor(id, 'https://harmonic.example', 'guitar')
  expect(url).toBe(`https://harmonic.example/?attempt=${id}&instrument=guitar`)
  expect(readSharedAttemptId(url)).toBe(id)
  expect(readSharedAttemptInstrument(url)).toBe('guitar')
  expect(readSharedAttemptInstrument('not a url')).toBe('voice')
})
