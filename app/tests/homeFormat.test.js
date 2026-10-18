import { describe, expect, it } from 'vitest'
import { namesList, noteRange, percent, personAsUser, songMeta, timeAgo } from '../src/tabs/home/homeFormat.js'
import { displayNameFor, avatarUrlFor } from '../src/auth/authHelpers.js'

describe('Home formatting', () => {
  const now = Date.parse('2026-10-18T12:00:00Z')

  it('says how long ago', () => {
    expect(timeAgo(now - 20_000, now)).toBe('just now')
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(timeAgo(new Date(now - 3 * 3600_000).toISOString(), now)).toBe('3 h ago')
    expect(timeAgo(now - 26 * 3600_000, now)).toBe('yesterday')
    expect(timeAgo(now - 4 * 86400_000, now)).toBe('4 days ago')
    expect(timeAgo(now - 30 * 86400_000, now)).not.toMatch(/ago/)
    expect(timeAgo(now + 60_000, now)).toBe('just now') // clock skew
  })

  it('shapes a friend like a user for the avatar', () => {
    const user = personAsUser({ display_name: 'Ben', avatar_url: 'https://x/b.png' })
    expect(displayNameFor(user)).toBe('Ben')
    expect(avatarUrlFor(user)).toBe('https://x/b.png')
    expect(displayNameFor(personAsUser({ display_name: null, avatar_url: null }))).toBe('')
  })

  it('formats percentages', () => {
    expect(percent(72)).toBe('72%')
    expect(percent('66.666')).toBe('66.7%')
  })

  it('lists names', () => {
    expect(namesList(['Ben'])).toBe('Ben')
    expect(namesList(['Ben', null])).toBe('Ben and a friend')
    expect(namesList(['Ben', 'Ana', 'Cy'])).toBe('Ben, Ana and Cy')
    expect(namesList(['Ben', 'Ana', 'Cy', 'Di'])).toBe('Ben, Ana and 2 others')
    expect(namesList([])).toBe('')
  })

  it('labels instrument and part without repeating', () => {
    expect(songMeta('guitar', 'Guitar')).toBe('Guitar')
    expect(songMeta('guitar', 'Lead')).toBe('Guitar · Lead')
    expect(songMeta('voice', 'Soprano')).toBe('Vocal · Soprano')
    expect(songMeta('voice', null)).toBe('Vocal')
  })

  it('names note ranges from 1', () => {
    expect(noteRange({ from: 3, to: 3 })).toBe('note 4')
    expect(noteRange({ from: 3, to: 8 })).toBe('notes 4–9')
  })
})