import { describe, expect, it, vi } from 'vitest'
import {
  IDLE_MS,
  RECORDING_BUDGET_BYTES,
  budgetOf,
  debounce,
  endTimeFor,
  fitsBudget,
  formatBytes,
  groupBySession,
  isIdle,
  keepByDefault,
  lastActivityOf,
  msUntilIdle,
  rollover,
  sessionLength,
  sessionSummary,
} from '../src/tabs/vocal/practice/practiceSession.js'

const T0 = Date.parse('2026-10-20T10:00:00Z')
const minutes = (n) => n * 60 * 1000
const at = (n) => new Date(T0 + minutes(n)).toISOString()

const session = (startMin, attemptMins = [], extra = {}) => ({
  id: 's',
  started_at: at(startMin),
  ended_at: null,
  attempts: attemptMins.map((m, i) => ({ id: `a${i}`, created_at: at(m), accuracy: 50 })),
  ...extra,
})

describe('session boundaries', () => {
  it('last activity is the start, or the latest attempt', () => {
    expect(lastActivityOf(session(0))).toBe(T0)
    expect(lastActivityOf(session(0, [5, 12, 9]))).toBe(T0 + minutes(12))
  })

  it('a session is idle 30 minutes after its last attempt, not after its start', () => {
    const s = session(0, [10])
    expect(isIdle(s, T0 + minutes(39))).toBe(false)
    expect(isIdle(s, T0 + minutes(40))).toBe(true)
    expect(isIdle(session(0), T0 + minutes(29))).toBe(false)
    expect(isIdle(session(0), T0 + minutes(30))).toBe(true)
    expect(IDLE_MS).toBe(minutes(30))
  })

  it('ends now while active, at the last activity once idle', () => {
    const s = session(0, [10])
    expect(endTimeFor(s, T0 + minutes(20))).toBe(at(20))
    expect(endTimeFor(s, T0 + minutes(120))).toBe(at(10))
  })

  it('rollover: start without a session, reuse while active, roll over when idle', () => {
    expect(rollover(null, T0)).toEqual({ action: 'start' })
    expect(rollover(session(0, [], { ended_at: at(5) }), T0 + minutes(6))).toEqual({ action: 'start' })
    expect(rollover(session(0, [3]), T0 + minutes(32))).toEqual({ action: 'reuse' })
    expect(rollover(session(0, [3]), T0 + minutes(33))).toEqual({ action: 'rollover', endedAt: at(3) })
  })

  it('counts down to idle', () => {
    expect(msUntilIdle(session(0, [10]), T0 + minutes(25))).toBe(minutes(15))
    expect(msUntilIdle(session(0, [10]), T0 + minutes(50))).toBe(0)
  })

  it('formats a session length', () => {
    expect(sessionLength(session(0, [], { ended_at: at(12) }))).toBe('12 min')
    expect(sessionLength(session(0, [], { ended_at: at(65) }))).toBe('1 h 05 min')
    expect(sessionLength(session(0), T0 + minutes(7))).toBe('7 min')
  })
})

describe('grouping', () => {
  it('puts attempts under their session oldest first and keeps session order; the rest are orphans', () => {
    const sessions = [
      { id: 'new', started_at: at(60) },
      { id: 'old', started_at: at(0) },
    ]
    const attempts = [
      { id: 'c', session_id: 'new', created_at: at(70) },
      { id: 'a', session_id: 'old', created_at: at(5) },
      { id: 'x', session_id: null, created_at: at(-100) },
      { id: 'b', session_id: 'new', created_at: at(65) },
      { id: 'y', session_id: 'gone', created_at: at(-50) },
    ]
    const { sessions: grouped, orphans } = groupBySession(sessions, attempts)
    expect(grouped.map((s) => s.id)).toEqual(['new', 'old'])
    expect(grouped[0].attempts.map((a) => a.id)).toEqual(['b', 'c'])
    expect(grouped[1].attempts.map((a) => a.id)).toEqual(['a'])
    expect(orphans.map((a) => a.id)).toEqual(['y', 'x'])
  })

  it('summarises a session', () => {
    expect(sessionSummary([])).toBeNull()
    expect(
      sessionSummary([
        { accuracy: '60.04', recording_path: 'u/a.webm' },
        { accuracy: 80, recording_path: null },
        { accuracy: 70, recording_path: 'u/c.webm' },
      ]),
    ).toEqual({ attempts: 3, best: 80, latest: 70, mean: 70, recordings: 2 })
  })
})

describe('recording budget', () => {
  it('is 100 MB and reports what is left', () => {
    expect(RECORDING_BUDGET_BYTES).toBe(100 * 1024 * 1024)
    const b = budgetOf(30 * 1024 * 1024)
    expect(b.remaining).toBe(70 * 1024 * 1024)
    expect(b.fraction).toBeCloseTo(0.3)
    expect(b.full).toBe(false)
    expect(budgetOf(RECORDING_BUDGET_BYTES + 5).full).toBe(true)
    expect(budgetOf(null).used).toBe(0)
  })

  it('fits while the remaining budget covers the recording', () => {
    expect(fitsBudget(1_000_000, 99 * 1024 * 1024)).toBe(true)
    expect(fitsBudget(1_100_000, 99 * 1024 * 1024)).toBe(false)
    expect(fitsBudget(0, 0)).toBe(false)
    expect(fitsBudget(10, 0, 5)).toBe(false)
  })

  it('keeps the recording by default while it fits; unknown usage counts as empty', () => {
    expect(keepByDefault(500_000, { used_bytes: 0, cap_bytes: RECORDING_BUDGET_BYTES })).toBe(true)
    expect(keepByDefault(500_000, { used_bytes: RECORDING_BUDGET_BYTES - 1000, cap_bytes: RECORDING_BUDGET_BYTES })).toBe(false)
    expect(keepByDefault(500_000, null)).toBe(true)
    expect(keepByDefault(RECORDING_BUDGET_BYTES + 1, null)).toBe(false)
    expect(keepByDefault(0, { used_bytes: 0, cap_bytes: RECORDING_BUDGET_BYTES })).toBe(false)
    expect(keepByDefault(500_000, { used: 0, cap: RECORDING_BUDGET_BYTES })).toBe(true)
  })

  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(512 * 1024)).toBe('512 KB')
    expect(formatBytes(3.44 * 1024 * 1024)).toBe('3.4 MB')
    expect(formatBytes(RECORDING_BUDGET_BYTES)).toBe('100 MB')
  })
})

describe('debounce (autosave)', () => {
  it('runs once with the last arguments after the wait, and can flush or cancel', () => {
    vi.useFakeTimers()
    try {
      const save = vi.fn()
      const autosave = debounce(save, 600)
      autosave('a')
      autosave('ab')
      vi.advanceTimersByTime(599)
      expect(save).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(save).toHaveBeenCalledTimes(1)
      expect(save).toHaveBeenCalledWith('ab')

      autosave('abc')
      autosave.flush()
      expect(save).toHaveBeenLastCalledWith('abc')
      autosave.flush() // nothing pending
      expect(save).toHaveBeenCalledTimes(2)

      autosave('dropped')
      autosave.cancel()
      vi.advanceTimersByTime(1000)
      expect(save).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
