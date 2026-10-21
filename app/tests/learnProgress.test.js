import { afterEach, describe, expect, it } from 'vitest'
import { savePassed } from '../src/tabs/guitar/exercises/strumProgress.js'
import { clearLocalProgress, readLocalProgress, writeLocalProgress } from '../src/tabs/guitar/learn/learnProgress.js'
import { onProgressSaved } from '../src/tabs/guitar/learn/progressEvents.js'
import { recordBest } from '../src/tabs/guitar/practice/changesState.js'
import { saveCleared } from '../src/tabs/guitar/practice/unlocks.js'

/** Minimal in-memory stand-in for the browser's localStorage. */
function fakeStorage() {
  const data = new Map()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  }
}

afterEach(() => {
  delete globalThis.localStorage
})

describe('Learn progress in the browser', () => {
  it('collects the chord lessons, the changes bests and the strum steps, announcing each save', () => {
    globalThis.localStorage = fakeStorage()
    let saves = 0
    const stop = onProgressSaved(() => (saves += 1))
    saveCleared({ Em: 'passed' })
    recordBest({}, 'Em', 'C', 14)
    savePassed({ 'muted-60': true })
    stop()
    expect(saves).toBe(3)
    expect(readLocalProgress()).toEqual({ cleared: { Em: 'passed' }, changesBest: { 'C-Em': 14 }, strumPassed: { 'muted-60': true } })
  })

  it('takes the account’s progress in without announcing it, and forgets it all on sign-out', () => {
    globalThis.localStorage = fakeStorage()
    let saves = 0
    const stop = onProgressSaved(() => (saves += 1))
    const account = { cleared: { Em: 'passed', Am: 'skipped' }, changesBest: { 'Am-Em': 30 }, strumPassed: {} }
    writeLocalProgress(account)
    stop()
    expect(saves).toBe(0)
    expect(readLocalProgress()).toEqual(account)
    clearLocalProgress()
    expect(readLocalProgress()).toEqual({ cleared: {}, changesBest: {}, strumPassed: {} })
  })
})
