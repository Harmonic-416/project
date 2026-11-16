import { afterEach, describe, expect, it, vi } from 'vitest'
import { findAttemptSongFile } from '../src/tabs/guitar/song/songSources.js'
import { loadMyFile } from '../src/tabs/home/myFiles.js'
import { fetchSongOfAttempt } from '../src/tabs/home/songSharing.js'

vi.stubGlobal('__GUITAR_SONG_FILES__', [])
vi.mock('../src/lib/supabaseClient.js', () => ({ supabase: {} }))
vi.mock('../src/tabs/vocal/songs/cloudLibrary.js', () => ({ fetchCatalogSong: vi.fn(), fetchCloudNotation: vi.fn() }))
vi.mock('../src/tabs/home/myFiles.js', () => ({ loadMyFile: vi.fn() }))
vi.mock('../src/tabs/home/songSharing.js', () => ({ fetchSongOfAttempt: vi.fn() }))

afterEach(() => vi.resetAllMocks())

describe('the song of a guitar attempt being opened', () => {
  const attempt = { id: 'attempt-1', song_id: null, song_fingerprint: 'd'.repeat(64) }
  const bytes = new ArrayBuffer(4)

  it('uses this device’s copy without asking the sender’s account', async () => {
    loadMyFile.mockResolvedValue({ bytes, name: 'Mine.gp5' })
    expect(await findAttemptSongFile(attempt)).toEqual({ bytes, filename: 'Mine.gp5', options: {} })
    expect(fetchSongOfAttempt).not.toHaveBeenCalled()
  })

  it('falls back to the sender’s stored copy, and to nothing when they keep none', async () => {
    loadMyFile.mockResolvedValue(null)
    fetchSongOfAttempt.mockResolvedValueOnce({ bytes, name: 'Theirs.gp5' }).mockResolvedValueOnce(null)
    expect(await findAttemptSongFile(attempt)).toEqual({ bytes, filename: 'Theirs.gp5', options: {} })
    expect(fetchSongOfAttempt).toHaveBeenCalledWith({}, attempt)
    expect(await findAttemptSongFile(attempt)).toBeNull()
  })
})
