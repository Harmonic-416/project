import { describe, expect, it } from 'vitest'
import { filterSongs, matchesQuery } from '../src/tabs/vocal/songs/searchSongs.js'

const songs = [
  { id: '1', title: 'Ode to Joy', artist: 'Beethoven' },
  { id: '2', title: 'Amazing Grace', artist: null },
  { id: '3', title: 'Paint It Black', artist: 'The Rolling Stones' },
]

describe('matchesQuery', () => {
  it('matches on title, case-insensitively', () => {
    expect(matchesQuery(songs[0], 'ode')).toBe(true)
    expect(matchesQuery(songs[0], 'ODE TO JOY')).toBe(true)
  })

  it('matches on artist too', () => {
    expect(matchesQuery(songs[2], 'rolling')).toBe(true)
  })

  it('treats an empty or whitespace query as "everything"', () => {
    expect(matchesQuery(songs[0], '')).toBe(true)
    expect(matchesQuery(songs[0], '   ')).toBe(true)
  })

  it('ignores surrounding whitespace in the query', () => {
    expect(matchesQuery(songs[1], '  grace  ')).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(matchesQuery(songs[1], 'beethoven')).toBe(false)
  })

  // Seed rows may carry a null artist; the join must not turn that into the
  // string "null" and start matching searches for it.
  it('survives a missing artist', () => {
    expect(matchesQuery(songs[1], 'null')).toBe(false)
    expect(matchesQuery(songs[1], 'amazing')).toBe(true)
  })
})

describe('filterSongs', () => {
  it('keeps the given order', () => {
    expect(filterSongs(songs, '').map((song) => song.id)).toEqual(['1', '2', '3'])
  })

  it('narrows to matches', () => {
    expect(filterSongs(songs, 'a').map((song) => song.id)).toEqual(['2', '3'])
  })

  it('returns an empty list for undefined input', () => {
    expect(filterSongs(undefined, 'anything')).toEqual([])
  })
})
