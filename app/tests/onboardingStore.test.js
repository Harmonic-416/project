import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptMicrophone, isSeen, markSeen, readOnboarding, resetTips, setWelcome, shouldShowWelcome } from '../src/ui/onboarding/onboardingStore.js'
import { STUCK_MS, TIPS } from '../src/ui/onboarding/tips.js'

beforeEach(() => {
  const data = new Map()
  vi.stubGlobal('localStorage', { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) })
})

afterEach(() => vi.unstubAllGlobals())

describe('onboarding storage', () => {
  it('remembers welcome, microphone acceptance and seen tips across reads', () => {
    setWelcome('dismissed')
    markSeen('guitar.songs')
    markSeen('guitar.songs')
    acceptMicrophone()
    expect(readOnboarding()).toEqual({ welcome: 'dismissed', seen: ['guitar.songs'], micAccepted: true })
    expect(isSeen('guitar.songs')).toBe(true)
    resetTips()
    expect(readOnboarding()).toEqual({ welcome: 'dismissed', seen: [], micAccepted: true })
  })

  it.each(['{', '{"seen":"guitar.songs"}', null])('treats an invalid or missing record as unseen (%s)', (record) => {
    localStorage.setItem('harmonic.onboarding.v1', record)
    expect(readOnboarding()).toEqual({ welcome: null, seen: [], micAccepted: false })
  })

  it('returns an updated in-memory record when storage writes fail', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    expect(isSeen('guitar.songs', markSeen('guitar.songs'))).toBe(true)
  })

  it('skips the welcome for link visits without marking it complete', () => {
    expect(shouldShowWelcome('/?attempt=run&instrument=guitar')).toBe(false)
    expect(shouldShowWelcome('/?invite=friend')).toBe(false)
    expect(shouldShowWelcome('/')).toBe(true)
    setWelcome('done')
    expect(shouldShowWelcome('/')).toBe(false)
  })
})

it('defines short tips and pairs the shared practice surfaces', () => {
  const tips = Object.values(TIPS)
  expect(tips).toHaveLength(33)
  expect(new Set(tips.map(({ id }) => id)).size).toBe(tips.length)
  expect(tips.every(({ body }) => body.split(/[.!?](?:\s|$)/).filter(Boolean).length <= 2)).toBe(true)
  for (const surface of ['songs', 'song.modes', 'learn', 'search', 'sessions']) {
    expect(TIPS[`guitar.${surface}`]).toMatchObject({ instrument: 'guitar' })
    expect(TIPS[`vocal.${surface}`]).toMatchObject({ instrument: 'vocal' })
  }
  expect(STUCK_MS).toBe(30_000)
})
