import { describe, expect, it } from 'vitest'
import { isFullRun, lastAndBest, lastAndBestLine, waitAccuracy, waitVerdicts } from '../src/tabs/guitar/song/follow/runHistory.js'
import { initialWait, waitReducer, waitSummary } from '../src/tabs/guitar/song/follow/waitState.js'
import { attemptNotesLine } from '../src/tabs/vocal/practice/practiceSession.js'

// Guitar run history (change: guitar-run-history, F22).
const entry = (index, extra = {}) => ({ index, time: index, technique: null, ...extra })
const entries = [entry(0), entry(1, { optional: true }), entry(2), entry(3, { technique: 'dead' })]

describe('isFullRun', () => {
  it('is a full run when every scored note has a verdict', () => {
    expect(isFullRun(entries, ['hit', 'skipped', 'miss', 'skipped'])).toBe(true)
    expect(isFullRun(entries, ['close', null, 'hit', null])).toBe(true) // unscored notes may be empty
  })

  it('is not when the run started late, stopped early or seeked past a note', () => {
    expect(isFullRun(entries, [null, null, 'hit', null])).toBe(false)
    expect(isFullRun(entries, ['hit', null, null, null])).toBe(false)
    expect(isFullRun(entries, ['hit', null, 'skipped', null])).toBe(false)
    expect(isFullRun(entries, null)).toBe(false)
  })

  it('is not with nothing to score', () => {
    expect(isFullRun([entry(0, { optional: true })], ['skipped'])).toBe(false)
  })
})

describe('Wait for me runs', () => {
  it('saves one verdict per entry, null where the run never got to', () => {
    const results = []
    results[0] = 'hit'
    results[2] = 'close'
    expect(waitVerdicts(entries, results)).toEqual(['hit', null, 'close', null])
  })

  it('scores the notes played first try', () => {
    expect(waitAccuracy({ firstTry: 3, afterRetry: 1, missed: 0, scored: 4 })).toBe(75)
    expect(waitAccuracy({ firstTry: 0, afterRetry: 0, missed: 0, scored: 0 })).toBe(0)
  })

  it('a run played to the end is a full run (Easy notes passed over)', () => {
    const reduce = waitReducer(entries)
    let state = initialWait(entries)
    state = reduce(state, { type: 'judged', result: { verdict: 'hit' } })
    state = reduce(state, { type: 'judged', result: { verdict: 'wrong' } })
    state = reduce(state, { type: 'judged', result: { verdict: 'hit' } })
    const verdicts = waitVerdicts(entries, state.results)
    expect(verdicts).toEqual(['hit', 'skipped', 'close', 'skipped'])
    expect(isFullRun(entries, verdicts)).toBe(true)
    expect(waitAccuracy(waitSummary(state.results))).toBe(50)
  })

  it('reads as first try / after a few tries / skipped in a session', () => {
    expect(attemptNotesLine(['hit', 'hit', 'close', 'miss', 'skipped', null], 'wait')).toBe('2 of 4 first try · 1 after a few tries · 1 skipped')
    expect(attemptNotesLine(['hit', 'skipped'], 'wait')).toBe('1 of 1 first try')
    // Trouble spots and Vocal attempts read as before.
    expect(attemptNotesLine(['hit', 'miss', null])).toBe('1 of 3 notes hit · 1 missed · 1 not reached')
  })
})

describe('last and best', () => {
  it('takes the newest as last and the highest as best', () => {
    expect(lastAndBest([{ accuracy: 62.4 }, { accuracy: '88.6' }, { accuracy: 70 }])).toEqual({ last: 62, best: 89, count: 3 })
    expect(lastAndBest([])).toBeNull()
    expect(lastAndBest(null)).toBeNull()
  })

  it('says it in a line', () => {
    expect(lastAndBestLine({ last: 62, best: 89, count: 3 })).toBe('Last run 62% · best 89% (3 runs)')
    expect(lastAndBestLine({ last: 70, best: 70, count: 1 })).toBe('Last run 70%')
    expect(lastAndBestLine(null)).toMatch(/^No full runs yet/)
  })
})
