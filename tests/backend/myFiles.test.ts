import { describe, expect, it } from 'vitest'
import {
  deleteMyFileRecord,
  fetchMyFile,
  listMyFileRecords,
  mergeMyFiles,
  myFileStorageUsed,
  storeMyFile,
  upsertMyFileRecords,
} from '../../src/lib/myFiles'
import { hasSupabaseEnv, newTestUser } from '../helpers'

const hex = (n: number) => n.toString(16).padStart(64, '0')

describe('my files, the device’s and the account’s as one list (pure)', () => {
  it('lists newest opened first, one entry per file, saying which are on this device', () => {
    const local = [
      { id: hex(1), name: 'here.mid', instrument: 'voice' as const, size: 10, added: 100, opened: 500 },
      { id: hex(2), name: 'both.musicxml', instrument: 'voice' as const, size: 20, added: 300, opened: 400 },
    ]
    const remote = [
      { fingerprint: hex(2), name: 'both (other name).musicxml', instrument: 'voice' as const, size: 20, added: 200, opened: 900, stored: true },
      { fingerprint: hex(3), name: 'elsewhere.gp5', instrument: 'guitar' as const, size: 30, added: 50, opened: 600, stored: false },
    ]
    const merged = mergeMyFiles(local, remote)
    expect(merged.map((f) => f.id)).toEqual([hex(2), hex(3), hex(1)])
    expect(merged[0]).toEqual({ id: hex(2), name: 'both.musicxml', instrument: 'voice', size: 20, added: 200, opened: 900, local: true, stored: true })
    expect(merged[1]).toMatchObject({ name: 'elsewhere.gp5', instrument: 'guitar', local: false, stored: false })
    expect(merged[2]).toMatchObject({ name: 'here.mid', local: true, stored: false })
    expect(mergeMyFiles([], [])).toEqual([])
    // Signed out there is no account list to compare with.
    expect(mergeMyFiles(local, null).map((f) => f.stored)).toEqual([null, null])
  })
})

describe.skipIf(!hasSupabaseEnv)('my files on the account', () => {
  it('keeps the list per user, merges times, refuses bad fingerprints and forgets on request', async () => {
    const { supabase } = await newTestUser('myfiles')
    expect(await listMyFileRecords(supabase)).toEqual([])

    await upsertMyFileRecords(supabase, [
      { id: hex(11), name: 'song.mid', instrument: 'voice', size: 1234, added: 1_000_000, opened: 2_000_000 },
      { id: hex(12), name: 'riff.gp5', instrument: 'guitar', size: 99, added: 1_500_000, opened: 3_000_000 },
      { id: 'not-a-fingerprint', name: 'skipped.mid', instrument: 'voice', size: 1, added: 1, opened: 1 },
    ])
    let list = await listMyFileRecords(supabase)
    expect(list.map((r) => r.fingerprint)).toEqual([hex(12), hex(11)])
    expect(list[1]).toEqual({ fingerprint: hex(11), name: 'song.mid', instrument: 'voice', size: 1234, added: 1_000_000, opened: 2_000_000, stored: false })

    // Another device reports the same file: the earlier added and the later opened both stay.
    await upsertMyFileRecords(supabase, [{ id: hex(11), name: 'song (copy).mid', instrument: 'voice', size: 1234, added: 5_000_000, opened: 1_000 }])
    list = await listMyFileRecords(supabase)
    const song = list.find((r) => r.fingerprint === hex(11))!
    expect(song).toMatchObject({ name: 'song (copy).mid', added: 1_000_000, opened: 2_000_000 })

    // Nobody else's to see.
    const { supabase: other } = await newTestUser('myfiles-other')
    expect(await listMyFileRecords(other)).toEqual([])

    await deleteMyFileRecord(supabase, hex(12))
    expect((await listMyFileRecords(supabase)).map((r) => r.fingerprint)).toEqual([hex(11)])
  })
})

describe.skipIf(!hasSupabaseEnv)('song files kept on the account', () => {
  const bytes = new TextEncoder().encode('<score-partwise version="4.0"></score-partwise>')
  const file = (id: string, size = bytes.byteLength) => ({ id, name: 'kept.musicxml', instrument: 'voice' as const, size, added: 1_000, opened: 2_000 })

  it('keeps the file for its owner only, fetches it back, and removes it with its row', async () => {
    const { supabase } = await newTestUser('keptfiles')
    const user = (await supabase.auth.getUser()).data.user!
    await storeMyFile(supabase, file(hex(21)), bytes)
    // Sending the same file again (another device) is fine.
    await storeMyFile(supabase, file(hex(21)), bytes)
    expect((await listMyFileRecords(supabase))[0]).toMatchObject({ fingerprint: hex(21), stored: true })
    expect(new Uint8Array(await fetchMyFile(supabase, hex(21)))).toEqual(bytes)
    expect(await myFileStorageUsed(supabase)).toMatchObject({ files: 1, usedBytes: bytes.byteLength, maxFiles: 100 })

    // Nobody else can fetch it, list it, or put files in that folder.
    const { supabase: other } = await newTestUser('keptfiles-other')
    await expect(fetchMyFile(other, hex(21))).rejects.toBeTruthy()
    const { data: listed } = await other.storage.from('my-files').list(user.id)
    expect(listed ?? []).toEqual([])
    const { error: planted } = await other.storage.from('my-files').upload(`${user.id}/${hex(22)}`, bytes)
    expect(planted).toBeTruthy()

    await deleteMyFileRecord(supabase, hex(21))
    expect(await listMyFileRecords(supabase)).toEqual([])
    await expect(fetchMyFile(supabase, hex(21))).rejects.toBeTruthy()
  })

  it('refuses a file that is not on the list, and one past the room left', async () => {
    const { supabase } = await newTestUser('keptfiles-cap')
    const user = (await supabase.auth.getUser()).data.user!
    const { error: unlisted } = await supabase.storage.from('my-files').upload(`${user.id}/${hex(31)}`, bytes)
    expect(unlisted).toBeTruthy()
    await expect(storeMyFile(supabase, file(hex(32), 51 * 1024 * 1024), bytes)).rejects.toThrow(/full/)
  })
})
