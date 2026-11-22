import { expect, it, vi } from 'vitest'
import { createSpeedTrainer } from '../src/tabs/guitar/song/follow/speedTrainer.js'

function setup(tempo) {
  const onTempo = vi.fn()
  const onProgress = vi.fn()
  const trainer = createSpeedTrainer([
    { index: 0, time: 0.2, duration: 0.1, kind: 'single', technique: 'pick', optional: true },
    { index: 1, time: 0.95, duration: 0.1, kind: 'single', technique: 'pick' },
  ], { start: 0, end: 1, tempo, onTempo, onProgress, onSettled: vi.fn() })
  trainer.begin(true)
  return { trainer, onTempo, onProgress }
}

it('counts late final-note judgments in the pass that just ended and caps tempo at 100%', () => {
  const { trainer, onTempo, onProgress } = setup(95)
  for (const end of [1000, 2000, 3000]) {
    trainer.boundary(end, 50)
    // Analysis arrives after the wrap, and the current score time is in the new pass.
    const result = trainer.onset(end - 55, 0.05, () => ({ verdict: 'hit' }))
    expect(result.entry.index).toBe(1)
    trainer.update(end + 500, 0.45, 50)
  }
  expect(onProgress).toHaveBeenLastCalledWith({ tempo: 95, streak: 3, target: 3 })
  expect(onTempo).not.toHaveBeenCalled()
  trainer.boundary(4000, 50)
  trainer.boundary(5000, 50)
  expect(onTempo).toHaveBeenCalledExactlyOnceWith(100)
})

it('breaks a streak on a close or interrupted repeat', () => {
  const { trainer, onTempo, onProgress } = setup(60)
  const repeat = (end, verdict) => {
    trainer.onset(end - 50, 0.95, () => ({ verdict }))
    trainer.boundary(end, 0)
    trainer.update(end + 450, 0.3, 0)
  }
  repeat(1000, 'hit')
  repeat(2000, 'hit')
  repeat(3000, 'close')
  expect(onProgress).toHaveBeenLastCalledWith({ tempo: 60, streak: 0, target: 3 })
  repeat(4000, 'hit')
  repeat(5000, 'hit')
  trainer.interrupt()
  trainer.begin(false)
  repeat(6000, 'hit')
  expect(onProgress).toHaveBeenLastCalledWith({ tempo: 60, streak: 0, target: 3 })
  expect(onTempo).not.toHaveBeenCalled()
})
