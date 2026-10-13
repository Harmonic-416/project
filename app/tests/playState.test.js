import { describe, expect, it } from 'vitest'
import {
  COUNTDOWN_FROM,
  PROGRESSION,
  SECONDS_PER_CHORD,
  initialPlay,
  playReducer,
  playScore,
  progressionChords,
} from '../src/tabs/guitar/practice/playState.js'

const run = (actions, state = initialPlay()) => actions.reduce(playReducer, state)
const ticks = Array(COUNTDOWN_FROM).fill({ type: 'tick' })

describe('play mode', () => {
  it('uses real chords for the progression', () => {
    expect(progressionChords().map((c) => c.id)).toEqual(PROGRESSION)
  })

  it('counts down 3-2-1 before the first chord (F8)', () => {
    let s = run([{ type: 'start' }])
    expect(s).toMatchObject({ status: 'countdown', count: 3 })
    s = run([{ type: 'tick' }, { type: 'tick' }], s)
    expect(s.count).toBe(1)
    s = run([{ type: 'tick' }], s)
    expect(s).toMatchObject({ status: 'running', index: 0 })
  })

  it('ignores results during the countdown', () => {
    const s = run([{ type: 'start' }, { type: 'result', verdict: 'verified' }])
    expect(s.results.every((r) => r === null)).toBe(true)
  })

  it('stays on a chord for at most 5 seconds', () => {
    expect(SECONDS_PER_CHORD).toBe(5)
  })

  it('a clean strum moves on at once', () => {
    const s = run([{ type: 'start' }, ...ticks, { type: 'result', verdict: 'verified' }])
    expect(s).toMatchObject({ status: 'running', index: 1, results: ['verified', null, null, null] })
  })

  it('a wrong or quiet strum waits for the chord’s time to run out', () => {
    let s = run([{ type: 'start' }, ...ticks, { type: 'result', verdict: 'wrong' }, { type: 'result', verdict: 'silent' }])
    expect(s).toMatchObject({ index: 0, results: ['silent', null, null, null] })
    s = run([{ type: 'result', verdict: 'verified' }], s) // a clean strum before the time is up still counts
    expect(s).toMatchObject({ index: 1, results: ['verified', null, null, null] })
  })

  it('keeps going after a wrong chord and scores at the end (F14, F32, F33)', () => {
    const s = run([
      { type: 'start' },
      ...ticks,
      { type: 'result', verdict: 'verified' }, // moves on by itself
      { type: 'result', verdict: 'wrong' },
      { type: 'advance' },
      { type: 'advance' }, // nothing heard on chord 3
      { type: 'result', verdict: 'verified' }, // the last chord: done
    ])
    expect(s.status).toBe('done')
    expect(s.results).toEqual(['verified', 'wrong', null, 'verified'])
    expect(playScore(s.results)).toEqual({ heard: 2, total: 4 })
  })

  it('Play again starts a fresh run, Stop resets', () => {
    const done = run([{ type: 'start' }, ...ticks, { type: 'result', verdict: 'verified' }])
    expect(run([{ type: 'start' }], done)).toMatchObject({ status: 'countdown', results: [null, null, null, null] })
    expect(run([{ type: 'reset' }], done)).toMatchObject({ status: 'idle', index: 0 })
  })
})