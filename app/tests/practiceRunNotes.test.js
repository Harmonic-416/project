import { describe, expect, it } from 'vitest'
import { attemptNotesLine, runNotesLine, verdictCounts } from '../src/tabs/vocal/practice/practiceSession.js'
import { fromRemote } from '../src/tabs/vocal/practice/sessionRuns.js'
import { summarizeWaitRun } from '../src/tabs/vocal/practice/scoring.js'
import { noteVerdicts } from '../src/tabs/vocal/share/sharedAttempt.js'

describe('notes per attempt', () => {
  it('counts hits, misses and notes not reached', () => {
    expect(verdictCounts(['hit', 'miss', null, 'hit', 'close', 'skipped'])).toEqual({ total: 6, hit: 2, close: 1, missed: 2, skipped: 2 })
    expect(verdictCounts(null)).toBeNull()
    expect(verdictCounts([])).toBeNull()
  })

  it('says it in words', () => {
    expect(attemptNotesLine([...Array(105).fill('hit'), ...Array(367).fill('miss')])).toBe('105 of 472 notes hit · 367 missed')
    expect(attemptNotesLine(['hit', 'hit', null])).toBe('2 of 3 notes hit · 1 not reached')
    expect(attemptNotesLine(null)).toBe('')
  })

  it('writes a verdict per melody note, in order', () => {
    const melody = [{ i: 0 }, { i: 1 }, { i: 2 }, { i: 3 }]
    expect(noteVerdicts(melody, [melody[0], melody[2]], [melody[1]])).toEqual(['hit', 'miss', 'hit', null])
  })
})

describe('notes per scored run', () => {
  it('describes a Wait for me run by quick and slow notes', () => {
    expect(runNotesLine('wait', { total: 16, right: 14, half: 2, missed: 0 })).toBe('14 of 16 notes found quickly · 2 slow')
    expect(runNotesLine('wait', { total: 8, right: 8, half: 0, missed: 0 })).toBe('all 8 notes found quickly')
  })

  it('describes a Trouble spots run by right, half and missed notes', () => {
    expect(runNotesLine('trouble', { total: 4, right: 2, half: 1, missed: 1 })).toBe('2 of 4 notes on pitch · 1 a half step off · 1 missed')
    expect(runNotesLine('trouble', null)).toBe('')
  })

  it('counts every slow note in a Wait for me run, not only the three shown', () => {
    const results = [500, 3500, 4000, 5000, 6000, 800].map((ms, index) => ({ index, midi: 60, ms }))
    const summary = summarizeWaitRun(results)
    expect(summary.slow).toHaveLength(3)
    expect(summary.slowNotes).toBe(4)
    expect(summarizeWaitRun([]).slowNotes).toBe(0)
  })

  it('reads the account’s runs with their note counts', () => {
    expect(
      fromRemote([
        { score: '75', created_at: '2026-10-21T12:00:00Z', notes_total: 4, notes_right: 3, notes_half: 0, notes_missed: 1 },
        { score: 50, created_at: '2026-10-21T12:05:00Z', notes_total: null },
      ]),
    ).toEqual([
      { score: 75, at: Date.parse('2026-10-21T12:00:00Z'), notes: { total: 4, right: 3, half: 0, missed: 1 } },
      { score: 50, at: Date.parse('2026-10-21T12:05:00Z') },
    ])
  })
})
