import { describe, expect, it } from 'vitest'
import {
  COUNTDOWN_FROM,
  PROGRESSION,
  BEATS_PER_BAR,
  LOOP_BPM,
  initialPlay,
  learnedProgression,
  playReducer,
  playScore,
  progressionChords,
  strummingLoop,
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

  it('a clean strum records success without advancing the transport', () => {
    const s = run([{ type: 'start' }, ...ticks, { type: 'result', verdict: 'verified' }])
    expect(s).toMatchObject({ status: 'running', index: 0, results: ['verified', null, null, null] })
  })

  it('a wrong or quiet strum waits for the chord’s time to run out', () => {
    let s = run([{ type: 'start' }, ...ticks, { type: 'result', verdict: 'wrong' }, { type: 'result', verdict: 'silent' }])
    expect(s).toMatchObject({ index: 0, results: ['wrong', null, null, null] })
    s = run([{ type: 'result', verdict: 'verified' }], s) // a clean strum before the time is up still counts
    expect(s).toMatchObject({ index: 0, results: ['verified', null, null, null] })
  })

  it('keeps going after a wrong chord and scores at the end (F14, F32, F33)', () => {
    const s = run([
      { type: 'start' },
      ...ticks,
      { type: 'result', verdict: 'verified' },
      { type: 'advance' },
      { type: 'result', verdict: 'wrong' },
      { type: 'advance' },
      { type: 'advance' }, // nothing heard on chord 3
      { type: 'result', verdict: 'verified' },
      { type: 'advance' }, // only the transport advances, even for the last chord
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

describe('play run chords', () => {
  it('starts with four beats per bar at a comfortable 80 BPM', () => {
    expect(BEATS_PER_BAR).toBe(4)
    expect(LOOP_BPM).toBe(80)
  })

  it('grows from one open chord to the newest four, including the current lesson', () => {
    expect(learnedProgression({})).toEqual(['Em'])
    expect(learnedProgression({Em:'passed'})).toEqual(['Em','Am'])
    expect(learnedProgression({Em:'passed',Am:'skipped'})).toEqual(['Em','Am','C'])
    expect(learnedProgression({ Em: 'passed', Am: 'passed', C: 'passed' })).toEqual(['Em','Am','C','G'])
    const six = { Em: 'passed', Am: 'passed', C: 'passed', G: 'passed', D: 'skipped', E: 'passed' }
    expect(learnedProgression(six)).toEqual(['G', 'D', 'E', 'A'])
    expect(learnedProgression({Em:'passed', C:'passed', stale:'passed'})).toEqual(['Em','Am'])
  })
  it('repeats the selected material for four rounds and resizes the scoring windows', () => {
    expect(strummingLoop({Em:'passed'})).toEqual(['Em','Am','Em','Am','Em','Am','Em','Am'])
    expect(strummingLoop({})).toEqual(['Em','Em','Em','Em'])
    expect(playReducer(initialPlay(), {type:'configure',length:8}).results).toHaveLength(8)
  })
})
