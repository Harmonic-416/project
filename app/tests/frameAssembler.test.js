import { describe, expect, it } from 'vitest'
import { FrameAssembler } from '../src/audio/capture/frameAssembler.js'

const BLOCK = 128 // AudioWorklet render quantum

/** Feed `signal` to the assembler in 128-sample blocks; collect every event. */
function run(assembler, signal) {
  const events = []
  for (let i = 0; i < signal.length; i += BLOCK) events.push(...assembler.push(signal.subarray(i, i + BLOCK)))
  return events
}

const ramp = (length) => Float32Array.from({ length }, (_, i) => i)

describe('FrameAssembler framing', () => {
  it('emits one full frame per hop once frameSize samples exist', () => {
    const frames = run(new FrameAssembler({ frameSize: 2048, hop: 512 }), ramp(4096)).filter((e) => e.type === 'frame')
    // Frames end at 2048, 2560, 3072, 3584, 4096.
    expect(frames.map((f) => f.position)).toEqual([2048, 2560, 3072, 3584, 4096])
    expect(frames.every((f) => f.samples.length === 2048)).toBe(true)
  })

  it('orders frame samples oldest to newest, ending at the frame position', () => {
    const frames = run(new FrameAssembler({ frameSize: 2048, hop: 512 }), ramp(3000)).filter((e) => e.type === 'frame')
    const last = frames.at(-1)
    expect(last.position).toBe(2560)
    expect(last.samples[0]).toBe(512)
    expect(last.samples[2047]).toBe(2559)
  })

  it('reports the hop RMS as the level', () => {
    const frames = run(new FrameAssembler({ frameSize: 1024, hop: 512 }), new Float32Array(1024).fill(0.5)).filter(
      (e) => e.type === 'frame',
    )
    expect(frames[0].level).toBeCloseTo(0.5, 6)
  })

  it('rejects a frame size that is not a multiple of the hop', () => {
    expect(() => new FrameAssembler({ frameSize: 1000, hop: 512 })).toThrow()
  })
})

describe('FrameAssembler onsets', () => {
  const quiet = (length) => Float32Array.from({ length }, (_, i) => 0.001 * Math.sin(i / 3))
  const loud = (length) => Float32Array.from({ length }, (_, i) => 0.3 * Math.sin(i / 3))

  it('marks a sudden rise in energy as one onset at the hop where it starts', () => {
    const signal = new Float32Array(512 * 20)
    signal.set(quiet(512 * 12), 0)
    signal.set(loud(512 * 8), 512 * 12)
    const onsets = run(new FrameAssembler({ frameSize: 2048, hop: 512 }), signal).filter((e) => e.type === 'onset')
    expect(onsets).toHaveLength(1)
    expect(onsets[0].position).toBe(512 * 12)
  })

  it('ignores steady sound and silence', () => {
    const steady = run(new FrameAssembler(), loud(512 * 30)).filter((e) => e.type === 'onset')
    const silent = run(new FrameAssembler(), new Float32Array(512 * 30)).filter((e) => e.type === 'onset')
    expect(steady).toHaveLength(0)
    expect(silent).toHaveLength(0)
  })

  it('reports two strums separated by a decay as two onsets', () => {
    const signal = new Float32Array(512 * 40)
    signal.set(quiet(512 * 10), 0)
    signal.set(loud(512 * 4), 512 * 10)
    signal.set(quiet(512 * 12), 512 * 14)
    signal.set(loud(512 * 4), 512 * 26)
    const onsets = run(new FrameAssembler(), signal).filter((e) => e.type === 'onset')
    expect(onsets.map((o) => o.position)).toEqual([512 * 10, 512 * 26])
  })
})
