import { describe, expect, it } from 'vitest'
import { getSongScoreStats } from '@backend/attempts'

function database(records) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from: () => {
      const filters = []
      let sort
      const q = {
        select: () => q,
        eq: (key, value) => { filters.push((row) => row[key] === value); return q },
        is: (key, value) => { filters.push((row) => row[key] === value); return q },
        order: (key) => { sort = key; return q },
        limit: async (size) => {
          const rows = records.filter((row) => filters.every((accept) => accept(row)))
          rows.sort((a, b) => a[sort] < b[sort] ? 1 : -1)
          return { data: rows.slice(0, size), count: rows.length }
        },
      }
      return q
    },
  }
}
const query = { songFingerprint: 'song', instrument: 'guitar', mode: 'wait', easy: false, partId: '0' }
const row = { song_fingerprint: 'song', instrument: 'guitar', mode: 'wait', easy: false, part_id: '0', user_id: 'owner', full_run: true }
describe('all-time comparable run statistics', () => {
  it('keeps a best older than the most recent 50 runs and excludes incomparable attempts', async () => {
    const records = Array.from({ length: 60 }, (_, index) => ({ ...row, created_at: index, accuracy: index === 0 ? 95 : 30 }))
    records.push({ ...row, accuracy: 100, created_at: 99, full_run: false }, { ...row, accuracy: 99, created_at: 98, user_id: 'other' }, { ...row, accuracy: 98, created_at: 97, easy: true })
    expect(await getSongScoreStats(database(records), query)).toEqual({ last: 30, best: 95, count: 60 })
  })
  it('returns no statistics when no comparable full runs exist', async () => {
    expect(await getSongScoreStats(database([]), query)).toBe(null)
  })
})
