import { describe, expect, it } from 'vitest'
import { COUNTDOWN_FROM } from '../src/tabs/guitar/practice/playState.js'
import {
  MAX_FAILED_RUNS,
  STRUMS_TO_PASS,
  canUnlockAnyway,
  initialPracticeRun,
  practiceRunReducer,
} from '../src/tabs/guitar/practice/practiceRunState.js'

const run = (actions, state = initialPracticeRun()) => actions.reduce(practiceRunReducer, state)
const ticks = Array(COUNTDOWN_FROM).fill({ type: 'tick' })
const started = () => run([{ type: 'start' }, ...ticks])
const verified = { type: 'result', verdict: 'verified' }
const wrong = { type: 'result', verdict: 'wrong' }
const silent = { type: 'result', verdict: 'silent' }

describe('practice mode (unlock checkpoint)', () => {
  it('counts down 3-2-1, then listens (F8)', () => {
    let s = run([{ type: 'start' }])
    expect(s).toMatchObject({ status: 'countdown', count: COUNTDOWN_FROM })
    s = run(ticks, s)
    expect(s).toMatchObject({ status: 'running', streak: 0 })
  })

  it(`passes on ${STRUMS_TO_PASS} clean strums in a row`, () => {
    let s = started()
    for (let i = 1; i < STRUMS_TO_PASS; i++) {
      s = run([verified], s)
      expect(s).toMatchObject({ status: 'running', streak: i })
    }
    expect(run([verified], s)).toMatchObject({ status: 'passed', streak: STRUMS_TO_PASS })
  })

  it('a wrong chord resets the streak', () => {
    const s = run([verified, verified, wrong, verified], started())
    expect(s).toMatchObject({ status: 'running', streak: 1, verdict: 'verified' })
  })

  it('too quiet does not break the streak (F21)', () => {
    const s = run([verified, silent, verified, silent], started())
    expect(s).toMatchObject({ status: 'running', streak: 2, verdict: 'silent' })
    expect(run([verified], s).status).toBe('passed')
  })

  it('ignores results outside the timed window', () => {
    expect(run([verified])).toEqual(initialPracticeRun())
    expect(run([{ type: 'start' }, verified]).streak).toBe(0)
    const passed = run([verified, verified, verified], started())
    expect(run([wrong], passed)).toBe(passed)
  })

  it('running out of time fails the run and counts it', () => {
    const s = run([verified, { type: 'timeout' }], started())
    expect(s).toMatchObject({ status: 'failed', streak: 1, failedRuns: 1 })
    expect(run([{ type: 'timeout' }], s)).toBe(s) // only while running
  })

  it(`offers "Unlock anyway" after ${MAX_FAILED_RUNS} failed runs (F28 soft gate)`, () => {
    let s = initialPracticeRun()
    for (let i = 1; i <= MAX_FAILED_RUNS; i++) {
      expect(canUnlockAnyway(s)).toBe(false)
      s = run([{ type: 'start' }, ...ticks, { type: 'timeout' }], s)
      expect(s.failedRuns).toBe(i)
    }
    expect(canUnlockAnyway(s)).toBe(true)
  })

  it('Stop keeps the failed-run count; a new chord clears it', () => {
    const failed = run([{ type: 'start' }, ...ticks, { type: 'timeout' }])
    expect(run([{ type: 'reset' }], failed)).toMatchObject({ status: 'idle', failedRuns: 1 })
    expect(run([{ type: 'start' }], failed)).toMatchObject({ status: 'countdown', failedRuns: 1 })
    expect(run([{ type: 'chord' }], failed)).toEqual(initialPracticeRun())
  })
})
