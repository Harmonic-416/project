import { describe, expect, it } from 'vitest'
import {
  formatHandle,
  inviteUrlFor,
  nameProblem,
  parseHandle,
  readInviteCode,
} from '../../src/lib/friends'
import {
  attemptFeedback,
  missedStretches,
  songsInProgress,
  type AttemptSummary,
} from '../../src/lib/home'

// Pure helpers behind the homepage: no database, so these always run.

function summary(overrides: Partial<AttemptSummary>): AttemptSummary {
  return {
    id: crypto.randomUUID(),
    song_id: null,
    song_fingerprint: 'a'.repeat(64),
    song_title: 'Song',
    part_name: null,
    instrument: 'guitar',
    accuracy: 50,
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('name#tag', () => {
  it('formats a handle, or null with no name yet', () => {
    expect(formatHandle({ display_name: 'Pan', tag: '2041' })).toBe('Pan#2041')
    expect(formatHandle({ display_name: null, tag: '2041' })).toBeNull()
  })

  it('parses name#tag, forgiving spaces', () => {
    expect(parseHandle('pan#2041')).toEqual({ name: 'pan', tag: '2041' })
    expect(parseHandle('  Big Pan # 0042 ')).toEqual({ name: 'Big Pan', tag: '0042' })
  })

  it('rejects anything that is not name#tag', () => {
    for (const bad of ['pan', 'pan#', 'pan#12', 'pan#12345', '#2041', 'p#2041', 'a#b#2041', 'pan!#2041']) {
      expect(parseHandle(bad), bad).toBeNull()
    }
  })

  it('explains bad names', () => {
    expect(nameProblem('Pan')).toBeNull()
    expect(nameProblem('P')).toMatch(/2 to 20/)
    expect(nameProblem('x'.repeat(21))).toMatch(/2 to 20/)
    expect(nameProblem('pan#1')).toMatch(/letters/)
  })
})

describe('invite links', () => {
  const code = '0123456789abcdef'

  it('round-trips a code through the link', () => {
    const url = inviteUrlFor(code, 'https://harmonic.app')
    expect(url).toBe(`https://harmonic.app/?invite=${code}`)
    expect(readInviteCode(url)).toBe(code)
  })

  it('ignores links without a valid code', () => {
    expect(readInviteCode('https://harmonic.app/')).toBeNull()
    expect(readInviteCode('https://harmonic.app/?invite=nope')).toBeNull()
    expect(readInviteCode('not a url')).toBeNull()
  })
})

describe('songs in progress', () => {
  it('groups by song, newest first, with best/latest/change', () => {
    const songs = songsInProgress([
      summary({ song_title: 'B', song_fingerprint: 'b'.repeat(64), accuracy: 40, created_at: '2026-10-05T00:00:00Z' }),
      summary({ song_title: 'A', accuracy: 70, created_at: '2026-10-04T00:00:00Z' }),
      summary({ song_title: 'A', accuracy: 80, created_at: '2026-10-03T00:00:00Z' }),
      summary({ song_title: 'A', accuracy: 55.55, created_at: '2026-10-02T00:00:00Z' }),
    ])
    expect(songs.map((s) => s.song_title)).toEqual(['B', 'A'])
    expect(songs[1]).toMatchObject({ attempts: 3, best: 80, latest: 70, change: -10 })
    expect(songs[0]).toMatchObject({ attempts: 1, change: null })
  })

  it('keeps the same song on voice and guitar apart', () => {
    const songs = songsInProgress([summary({ instrument: 'guitar' }), summary({ instrument: 'voice' })])
    expect(songs).toHaveLength(2)
  })

  it('a catalog song is one song even if titles differ', () => {
    const id = '00000000-0000-4000-8000-000000000011'
    const songs = songsInProgress([
      summary({ song_id: id, song_title: 'Ode to Joy' }),
      summary({ song_id: id, song_title: 'Ode To Joy', created_at: '2026-09-01T00:00:00Z' }),
    ])
    expect(songs).toHaveLength(1)
    expect(songs[0]!.song_title).toBe('Ode to Joy')
  })

  it('handles no attempts', () => {
    expect(songsInProgress([])).toEqual([])
  })
})

describe('attempt feedback', () => {
  it('finds the longest stretches of misses', () => {
    expect(missedStretches(['hit', 'miss', 'miss', 'hit', 'miss', 'miss', 'miss', null, 'miss'])).toEqual([
      { from: 4, to: 6 },
      { from: 1, to: 2 },
      { from: 8, to: 8 },
    ])
    expect(missedStretches(['hit', 'close'])).toEqual([])
  })

  it('guitar: counts verdicts and compares to last time', () => {
    const feedback = attemptFeedback(
      { accuracy: 72, instrument: 'guitar', verdicts: ['hit', 'hit', 'close', 'miss', 'miss', 'skipped', null] },
      { accuracy: 64 },
    )
    expect(feedback).toMatchObject({
      accuracy: 72,
      change: 8,
      headline: '72%, up 8 from last time',
      counts: { hit: 2, close: 1, miss: 2, skipped: 1 },
      troubleSpots: [{ from: 3, to: 4 }],
    })
  })

  it('voice: accuracy only', () => {
    const feedback = attemptFeedback({ accuracy: 66.66, instrument: 'voice', verdicts: null })
    expect(feedback).toMatchObject({ accuracy: 66.7, change: null, counts: null, troubleSpots: [] })
    expect(feedback.headline).toBe('66.7% on your first try')
  })

  it('says down / same', () => {
    expect(attemptFeedback({ accuracy: 50, instrument: 'voice', verdicts: null }, { accuracy: 60 }).headline).toBe(
      '50%, down 10 from last time',
    )
    expect(attemptFeedback({ accuracy: 50, instrument: 'voice', verdicts: null }, { accuracy: 50 }).headline).toBe(
      '50%, same as last time',
    )
  })
})