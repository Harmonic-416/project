import { describe, expect, it } from 'vitest'
import {
  createListeningClock,
  formatSeconds,
  reactionPoints,
  REACTION_FULL_MS,
  REACTION_ZERO_MS,
  sessionTrend,
  summarizeTroubleRun,
  summarizeWaitRun,
} from '../src/tabs/vocal/practice/scoring.js'
import { appendRun, loadRuns, MAX_RUNS, runsKey } from '../src/tabs/vocal/practice/sessionRuns.js'
import { createHoldDetector, createTroubleTracker } from '../src/tabs/vocal/practice/practiceLogic.js'
import { liveVerdict, STRICT_HOLD, STRICT_TROUBLE } from '../src/tabs/vocal/practice/scoring.js'

describe('what counts as correct (strict)', () => {
  const melody = [
    { midi: 60, time: 0, duration: 1, index: 0 },
    { midi: 62, time: 1, duration: 1, index: 1 },
  ]
  const sing = (tracker, midi, from, to) => {
    for (let t = from; t < to; t += 0.02) tracker.addSample({ time: t, midi })
  }

  it('Trouble spots: three quarters of a semitone off is a half step off (½), not right', () => {
    const strict = createTroubleTracker(melody, STRICT_TROUBLE)
    const lenient = createTroubleTracker(melody)
    for (const tracker of [strict, lenient]) sing(tracker, 60.75, 0.1, 0.9)
    const { hit, close } = strict.collect(Infinity)
    expect(hit).toEqual([])
    expect(close.map((n) => n.index)).toEqual([0])
    expect(lenient.collect(Infinity).hit.map((n) => n.index)).toEqual([0]) // shared attempts unchanged
  })

  it('Trouble spots: a half step either way is ½; a whole step or more is a miss', () => {
    const verdict = (midi) => {
      const tracker = createTroubleTracker(melody, STRICT_TROUBLE)
      sing(tracker, midi, 0.1, 0.9)
      const { hit, close } = tracker.collect(Infinity)
      return hit.length ? 'right' : close.length ? 'half' : 'miss'
    }
    expect(verdict(60.4)).toBe('right')
    expect(verdict(59)).toBe('half') // B, a half step flat
    expect(verdict(61.4)).toBe('half')
    expect(verdict(58)).toBe('miss') // a whole step flat
    expect(verdict(63)).toBe('miss') // a minor third sharp
    expect(verdict(72)).toBe('right') // an octave up is still right
  })

  it('Trouble spots: brushing past the right pitch isn’t enough', () => {
    const tracker = createTroubleTracker(melody, STRICT_TROUBLE)
    sing(tracker, 60, 0.1, 0.4) // on pitch briefly…
    sing(tracker, 64, 0.4, 0.95) // …then a third too high for the rest of the note
    const { hit, close } = tracker.collect(Infinity)
    expect(hit).toEqual([])
    expect(close).toEqual([]) // a miss
  })

  it('Trouble spots: a steady, in-tune note is right', () => {
    const tracker = createTroubleTracker(melody, STRICT_TROUBLE)
    sing(tracker, 72.3, 0.1, 0.9) // an octave up, 30 cents sharp
    expect(tracker.collect(Infinity).hit.map((n) => n.index)).toEqual([0])
  })

  it('Wait for me: within 35 cents, held for 300 ms', () => {
    const d = createHoldDetector(STRICT_HOLD)
    expect(d.update(69.4, 69, 0)).toBe(false)
    expect(d.update(69.4, 69, 500)).toBe(false) // 40 cents: never
    expect(d.update(69.3, 69, 600)).toBe(false)
    expect(d.update(69.3, 69, 700)).toBe(false)
    expect(d.update(69.3, 69, 800)).toBe(false)
    expect(d.update(69.3, 69, 900)).toBe(true) // 300 ms at 30 cents
  })

  it('colours the live readout on the same scale', () => {
    expect(liveVerdict(30, 35)).toBe('in-tune')
    expect(liveVerdict(-60, 50)).toBe('close')
    expect(liveVerdict(130, 50)).toBe('wrong')
  })
})

describe('wait for me score', () => {
  it('gives full marks for a quick find and nothing for a very slow one', () => {
    expect(reactionPoints(400)).toBe(1)
    expect(reactionPoints(REACTION_FULL_MS)).toBe(1)
    expect(reactionPoints((REACTION_FULL_MS + REACTION_ZERO_MS) / 2)).toBeCloseTo(0.5)
    expect(reactionPoints(REACTION_ZERO_MS)).toBe(0)
    expect(reactionPoints(20_000)).toBe(0)
  })

  it('averages the notes and calls out the slow ones', () => {
    const results = [
      { index: 0, midi: 60, ms: 500 },
      { index: 1, midi: 62, ms: 3500 }, // ½
      { index: 2, midi: 64, ms: 800 },
      { index: 3, midi: 65, ms: 7000 }, // 0
    ]
    const summary = summarizeWaitRun(results)
    expect(summary.score).toBe(63) // (1 + 0.5 + 1 + 0) / 4
    expect(summary.averageMs).toBe(2950)
    expect(summary.slow.map((r) => [r.position, r.ms])).toEqual([
      [3, 7000],
      [1, 3500],
    ])
  })

  it('keeps the melody position of a note when the run started partway', () => {
    const summary = summarizeWaitRun([{ index: 9, position: 7, midi: 60, ms: 4000 }])
    expect(summary.slow[0].position).toBe(7)
  })

  it('scores an empty run as nothing', () => {
    expect(summarizeWaitRun([])).toEqual({ score: 0, averageMs: 0, notes: 0, slow: [] })
  })
})

describe('listening clock', () => {
  it('counts only listening time', () => {
    const clock = createListeningClock()
    clock.restart(0, true)
    clock.pause(1000) // 1 s listening
    clock.resume(5000) // 4 s paused: not counted
    expect(clock.at(5500)).toBe(1500)
    clock.pause(6000)
    expect(clock.at(9000)).toBe(2000)
  })

  it('starts paused when the note comes up before listening', () => {
    const clock = createListeningClock()
    clock.restart(0, false)
    expect(clock.at(3000)).toBe(0)
    clock.resume(3000)
    expect(clock.at(3800)).toBe(800)
  })

  it('never goes negative for an onset just before a stretch began', () => {
    const clock = createListeningClock()
    clock.restart(1000, true)
    expect(clock.at(900)).toBe(0)
  })
})

describe('trouble spots score', () => {
  it('gives half credit for notes a half step off', () => {
    expect(summarizeTroubleRun({ right: 6, close: 2, missed: 2 })).toEqual({
      score: 70, // (6 + 1) / 10
      right: 6,
      close: 2,
      missed: 2,
      total: 10,
    })
    expect(summarizeTroubleRun({ right: 0, close: 0, missed: 0 }).score).toBe(0)
    expect(summarizeTroubleRun({ right: 0, close: 4, missed: 0 }).score).toBe(50)
  })
})

describe('session trend', () => {
  it('compares the latest try with the first and the best', () => {
    expect(sessionTrend([])).toBeNull()
    expect(sessionTrend([{ score: 40 }, { score: 72 }, { score: 65 }])).toEqual({
      runs: 3,
      first: 40,
      latest: 65,
      best: 72,
      change: 25,
    })
  })

  it('formats seconds', () => {
    expect(formatSeconds(1234)).toBe('1.2 s')
    expect(formatSeconds(400)).toBe('0.4 s')
  })
})

describe('session runs', () => {
  const memoryStorage = () => {
    const data = new Map()
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
  }

  it('keeps each song, part, accompaniment and mode apart', () => {
    const a = runsKey({ songKey: 'abc', partId: 'P1', accompaniment: 'solo', mode: 'wait' })
    expect(a).not.toBe(runsKey({ songKey: 'abc', partId: 'P1', accompaniment: 'solo', mode: 'trouble' }))
    expect(a).not.toBe(runsKey({ songKey: 'abc', partId: 'P2', accompaniment: 'solo', mode: 'wait' }))
    expect(a).not.toBe(runsKey({ songKey: 'abc', partId: 'P1', accompaniment: 'all', mode: 'wait' }))
  })

  it('saves and loads runs', () => {
    const storage = memoryStorage()
    let runs = loadRuns('k', storage)
    expect(runs).toEqual([])
    runs = appendRun('k', runs, { score: 50, at: 1 }, storage)
    runs = appendRun('k', runs, { score: 70, at: 2 }, storage)
    expect(loadRuns('k', storage)).toEqual([
      { score: 50, at: 1 },
      { score: 70, at: 2 },
    ])
  })

  it('keeps only the latest runs', () => {
    const storage = memoryStorage()
    let runs = []
    for (let i = 0; i < MAX_RUNS + 5; i++) runs = appendRun('k', runs, { score: i, at: i }, storage)
    expect(runs).toHaveLength(MAX_RUNS)
    expect(runs[0].score).toBe(5)
  })

  it('works without storage, or with broken or blocked storage', () => {
    expect(loadRuns('k', null)).toEqual([])
    expect(loadRuns('k', { getItem: () => 'not json' })).toEqual([])
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(loadRuns('k', blocked)).toEqual([])
    expect(appendRun('k', [], { score: 10, at: 1 }, blocked)).toEqual([{ score: 10, at: 1 }])
  })
})
