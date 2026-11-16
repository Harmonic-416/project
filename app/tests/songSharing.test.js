import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSongOfAttempt, keepSongOnAccount } from '../src/tabs/home/songSharing.js'
import { getSharedAttemptSong, listMyFileRecords, storeMyFile } from '@backend/myFiles'
import { loadMyFile, rememberMyFile } from '../src/tabs/home/myFiles.js'

vi.mock('@backend/myFiles', () => ({ getSharedAttemptSong: vi.fn(), listMyFileRecords: vi.fn(), storeMyFile: vi.fn() }))
vi.mock('../src/tabs/home/myFiles.js', () => ({ loadMyFile: vi.fn(), rememberMyFile: vi.fn() }))

const sb = {}
const id = 'a'.repeat(64)
const bytes = new ArrayBuffer(8)
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('sending a take: the song is on the account first', () => {
  it('sends nothing when the account already has the file', async () => {
    listMyFileRecords.mockResolvedValue([{ fingerprint: id, stored: true }])
    expect(await keepSongOnAccount(sb, id)).toBe(true)
    expect(storeMyFile).not.toHaveBeenCalled()
  })

  it('sends this device’s copy when the account only lists it, or doesn’t have it', async () => {
    listMyFileRecords.mockResolvedValue([{ fingerprint: id, stored: false }])
    loadMyFile.mockResolvedValue({ id, name: 'Mine.musicxml', instrument: 'voice', size: 8, added: 1, opened: 2, bytes })
    storeMyFile.mockResolvedValue()
    expect(await keepSongOnAccount(sb, id)).toBe(true)
    expect(storeMyFile).toHaveBeenCalledWith(sb, { id, name: 'Mine.musicxml', instrument: 'voice', size: 8, added: 1, opened: 2 }, bytes)
  })

  it('says so when the song can’t be kept: not on this device, account full, or no connection', async () => {
    quiet()
    listMyFileRecords.mockResolvedValue([])
    loadMyFile.mockResolvedValue(null)
    expect(await keepSongOnAccount(sb, id)).toBe(false)

    loadMyFile.mockResolvedValue({ id, name: 'Mine.musicxml', instrument: 'voice', size: 8, added: 1, opened: 2, bytes })
    storeMyFile.mockRejectedValue(new Error('Your song files are full (50 MB of 50 MB).'))
    expect(await keepSongOnAccount(sb, id)).toBe(false)

    listMyFileRecords.mockRejectedValue(new Error('Failed to fetch'))
    expect(await keepSongOnAccount(sb, id)).toBe(false)
    expect(await keepSongOnAccount(null, id)).toBe(false)
    expect(await keepSongOnAccount(sb, null)).toBe(false)
  })
})

describe('opening a take a friend sent: their song comes with it', () => {
  const attempt = { id: 'attempt-1', song_id: null, song_fingerprint: id }

  it('hands over the sender’s file and keeps it as one of the opener’s own', async () => {
    getSharedAttemptSong.mockResolvedValue({ name: 'Theirs.musicxml', instrument: 'voice', fingerprint: id, bytes })
    expect(await fetchSongOfAttempt(sb, attempt)).toEqual({ bytes, name: 'Theirs.musicxml' })
    expect(getSharedAttemptSong).toHaveBeenCalledWith(sb, 'attempt-1')
    expect(rememberMyFile).toHaveBeenCalledWith({ id, name: 'Theirs.musicxml', instrument: 'voice', bytes })
  })

  it('still opens the song when this browser can’t keep it', async () => {
    quiet()
    getSharedAttemptSong.mockResolvedValue({ name: 'Theirs.musicxml', instrument: 'voice', fingerprint: id, bytes })
    rememberMyFile.mockRejectedValue(new Error('storage blocked'))
    expect(await fetchSongOfAttempt(sb, attempt)).toEqual({ bytes, name: 'Theirs.musicxml' })
  })

  it('falls back to asking for a copy when there is no stored file, or it isn’t the right one', async () => {
    quiet()
    getSharedAttemptSong.mockResolvedValue(null)
    expect(await fetchSongOfAttempt(sb, attempt)).toBeNull()
    // A file under another fingerprint than the attempt's is not opened or kept.
    getSharedAttemptSong.mockResolvedValue({ name: 'Other.musicxml', instrument: 'voice', fingerprint: 'b'.repeat(64), bytes })
    expect(await fetchSongOfAttempt(sb, attempt)).toBeNull()
    // The backend layer refuses bytes that don't hash to the fingerprint.
    getSharedAttemptSong.mockRejectedValue(new Error('The song stored with this attempt isn’t the file it was sung from.'))
    expect(await fetchSongOfAttempt(sb, attempt)).toBeNull()
    expect(rememberMyFile).not.toHaveBeenCalled()
  })

  it('doesn’t ask for a catalog song’s file', async () => {
    expect(await fetchSongOfAttempt(sb, { id: 'attempt-2', song_id: 'catalog-1', song_fingerprint: null })).toBeNull()
    expect(getSharedAttemptSong).not.toHaveBeenCalled()
  })
})
