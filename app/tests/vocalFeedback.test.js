import { beforeEach, describe, expect, it, vi } from 'vitest'
import { starsFor } from '../src/tabs/vocal/feedback/stars.js'

describe('starsFor', () => {
  it('gives three stars only for everything right', () => {
    expect(starsFor(1)).toBe(3)
    expect(starsFor(0.99)).toBe(2)
  })

  it('steps down through two, one and none', () => {
    expect(starsFor(0.7)).toBe(2)
    expect(starsFor(0.5)).toBe(1)
    expect(starsFor(0.39)).toBe(0)
    expect(starsFor(0)).toBe(0)
  })
})

describe('sound effects switch', () => {
  beforeEach(() => {
    vi.resetModules()
    globalThis.localStorage?.clear?.()
  })

  it('is on by default and remembers being muted', async () => {
    const store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
    })
    const first = await import('../src/tabs/vocal/feedback/sfx.js')
    expect(first.isMuted()).toBe(false)
    const heard = vi.fn()
    first.subscribe(heard)
    first.setMuted(true)
    expect(heard).toHaveBeenCalledTimes(1)

    vi.resetModules()
    const reloaded = await import('../src/tabs/vocal/feedback/sfx.js')
    expect(reloaded.isMuted()).toBe(true)
    vi.unstubAllGlobals()
  })
})

describe('vocal progress', () => {
  const day = (d) => new Date(2026, 10, d, 12)
  let progress

  beforeEach(async () => {
    const store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
    })
    vi.resetModules()
    progress = await import('../src/tabs/vocal/feedback/progress.js')
    progress.resetProgressCache()
  })

  it('starts a streak, keeps it once a day, and extends it the next day', () => {
    expect(progress.currentStreak(undefined, day(10))).toBe(0)
    expect(progress.recordActivity(day(10))).toBe(1)
    expect(progress.recordActivity(day(10))).toBe(1)
    expect(progress.recordActivity(day(11))).toBe(2)
    expect(progress.currentStreak(undefined, day(12))).toBe(2) // not lapsed until a whole day is missed
  })

  it('lapses after a missed day and restarts at one', () => {
    progress.recordActivity(day(10))
    progress.recordActivity(day(11))
    expect(progress.currentStreak(undefined, day(13))).toBe(0)
    expect(progress.recordActivity(day(13))).toBe(1)
  })

  it('carries across a month end', () => {
    progress.recordActivity(new Date(2026, 9, 31, 12))
    expect(progress.recordActivity(new Date(2026, 10, 1, 12))).toBe(2)
  })

  it('keeps the best stars per activity, and survives a reload', async () => {
    progress.recordStars('solfege-read', 2, day(10))
    progress.recordStars('solfege-read', 1, day(10))
    expect(progress.bestStars('solfege-read')).toBe(2)
    progress.recordStars('solfege-read', 3, day(10))
    progress.resetProgressCache()
    expect(progress.bestStars('solfege-read')).toBe(3)
    expect(progress.bestStars('rhythm')).toBe(null)
  })
})
