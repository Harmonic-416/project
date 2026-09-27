import { afterEach, describe, expect, it } from 'vitest'
import { CHORDS } from '../src/tabs/guitar/practice/chords.js'
import { chordStatuses, loadCleared, saveCleared, unlockedCount } from '../src/tabs/guitar/practice/unlocks.js'

/** Minimal in-memory stand-in for the browser's localStorage. */
function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  }
}

describe('chord unlocks', () => {
  it('starts with only the first chord (E minor) open', () => {
    const statuses = chordStatuses({})
    expect(CHORDS[0].id).toBe('Em')
    expect(statuses.Em).toBe('unlocked')
    expect(CHORDS.slice(1).every((c) => statuses[c.id] === 'locked')).toBe(true)
    expect(unlockedCount({})).toBe(1)
  })

  it('passing a chord opens the next one', () => {
    const statuses = chordStatuses({ Em: 'passed' })
    expect(statuses).toMatchObject({ Em: 'passed', Am: 'unlocked', C: 'locked' })
    expect(unlockedCount({ Em: 'passed' })).toBe(2)
  })

  it('a skipped chord ("Unlock anyway") also opens the next one', () => {
    expect(chordStatuses({ Em: 'passed', Am: 'skipped' })).toMatchObject({ Am: 'skipped', C: 'unlocked', G: 'locked' })
    expect(unlockedCount({ Em: 'passed', Am: 'skipped' })).toBe(3)
  })

  it('never counts past the last chord', () => {
    const all = Object.fromEntries(CHORDS.map((c) => [c.id, 'passed']))
    expect(unlockedCount(all)).toBe(CHORDS.length)
  })
})

describe('saving unlocks', () => {
  afterEach(() => {
    delete globalThis.localStorage
  })

  it('reads as nothing cleared when storage is missing or unreadable', () => {
    expect(loadCleared()).toEqual({}) // node: no localStorage at all
    globalThis.localStorage = fakeStorage({ 'harmonic.guitar.cleared': '{not json' })
    expect(loadCleared()).toEqual({})
    globalThis.localStorage = fakeStorage({ 'harmonic.guitar.cleared': '["Em"]' })
    expect(loadCleared()).toEqual({})
  })

  it('round-trips through localStorage', () => {
    globalThis.localStorage = fakeStorage()
    saveCleared({ Em: 'passed', Am: 'skipped' })
    expect(loadCleared()).toEqual({ Em: 'passed', Am: 'skipped' })
  })

  it('saving without storage does not throw', () => {
    expect(() => saveCleared({ Em: 'passed' })).not.toThrow()
  })
})
