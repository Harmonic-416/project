import { beforeAll, describe, expect, it } from 'vitest'
import {
  getSharedAttempt,
  saveAttempt,
  sendAttemptToFriends,
  shareAttemptLink,
  unsendAttempt,
} from '../../src/lib/attempts'
import { acceptInvite, getMyProfile } from '../../src/lib/friends'
import {
  deleteMyFileRecord,
  fetchMyFile,
  fingerprintOf,
  getSharedAttemptSong,
  listMyFileRecords,
  storeMyFile,
  upsertMyFileRecords,
} from '../../src/lib/myFiles'
import { hasSupabaseEnv, newClient, newTestUser } from '../helpers'

// Migration 0020: a take sent to a friend brings its song. Every "can't"
// here is a privacy rule: the file is its owner's, and only the people the
// take was sent to may read it, only that file, only while it stays sent.

type User = Awaited<ReturnType<typeof newTestUser>> & { id: string }

async function user(prefix: string): Promise<User> {
  const u = await newTestUser(prefix)
  const { data } = await u.supabase.auth.getUser()
  return { ...u, id: data.user!.id }
}

async function befriend(a: User, b: User) {
  const { invite_code } = (await getMyProfile(a.supabase))!
  await acceptInvite(b.supabase, invite_code)
}

// CI runs these before it applies new migrations, so on the PR that adds
// 0020 the function isn't there yet (PGRST202): skip until it is.
async function schemaApplied(): Promise<boolean> {
  if (!hasSupabaseEnv) return false
  const { error } = await newClient().rpc('shared_attempt_song', { attempt: '00000000-0000-0000-0000-000000000000' })
  return error?.code !== 'PGRST202'
}
const schemaReady = await schemaApplied()

const encode = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer
const download = (who: User, path: string) => who.supabase.storage.from('my-files').download(path)

describe.skipIf(!schemaReady)('a sent take brings its song (0020)', () => {
  let sender: User
  let recipient: User
  let friend: User // a friend of the sender the take was NOT sent to
  let stranger: User

  // Unique per run, so runs against the same database don't share fingerprints.
  const song = encode(`<score-partwise version="4.0"><!-- ${crypto.randomUUID()} --></score-partwise>`)
  const other = encode(`<score-partwise version="4.0"><!-- other ${crypto.randomUUID()} --></score-partwise>`)
  let songId: string
  let otherId: string
  let attemptId: string
  let path: string

  const file = (id: string, name: string, bytes: ArrayBuffer) => ({
    id,
    name,
    instrument: 'voice' as const,
    size: bytes.byteLength,
    added: 1_000,
    opened: 2_000,
  })

  const attemptOf = (fingerprint: string) => ({
    songTitle: 'My own song',
    songFormat: 'musicxml' as const,
    songFingerprint: fingerprint,
    samples: [],
    accuracy: 80,
  })

  beforeAll(async () => {
    ;[sender, recipient, friend, stranger] = await Promise.all([
      user('song-sender'),
      user('song-recipient'),
      user('song-friend'),
      user('song-stranger'),
    ])
    await befriend(sender, recipient)
    await befriend(sender, friend)
    songId = await fingerprintOf(song)
    otherId = await fingerprintOf(other)
    path = `${sender.id}/${songId}`
    await storeMyFile(sender.supabase, file(songId, 'My own song.musicxml', song), song)
    await storeMyFile(sender.supabase, file(otherId, 'Not sent.musicxml', other), other)
    attemptId = (await saveAttempt(sender.supabase, attemptOf(songId))).id
    await sendAttemptToFriends(sender.supabase, attemptId, [recipient.id])
  })

  it('gives the friend it was sent to the sender’s file, name and all', async () => {
    const got = await getSharedAttemptSong(recipient.supabase, attemptId)
    expect(got).toMatchObject({ name: 'My own song.musicxml', instrument: 'voice', fingerprint: songId })
    expect(new Uint8Array(got!.bytes)).toEqual(new Uint8Array(song))
    // The sender (say, on a device without the file) gets it the same way.
    expect((await getSharedAttemptSong(sender.supabase, attemptId))?.fingerprint).toBe(songId)
  })

  it('gives nothing to a stranger, a friend it wasn’t sent to, or someone signed out', async () => {
    for (const who of [stranger, friend]) {
      expect(await getSharedAttemptSong(who.supabase, attemptId)).toBeNull()
      const { data, error } = await download(who, path)
      expect(error).toBeTruthy()
      expect(data).toBeNull()
    }
    const anon = newClient()
    const { error: rpcError } = await anon.rpc('shared_attempt_song', { attempt: attemptId })
    expect(rpcError).toBeTruthy()
    expect((await anon.storage.from('my-files').download(path)).error).toBeTruthy()
  })

  it('does not follow the public link: opening the take by link is not being sent it', async () => {
    await shareAttemptLink(sender.supabase, attemptId)
    // The stranger can open the attempt now, but still not its song file.
    expect((await getSharedAttempt(stranger.supabase, attemptId))?.id).toBe(attemptId)
    expect(await getSharedAttemptSong(stranger.supabase, attemptId)).toBeNull()
    expect((await download(stranger, path)).error).toBeTruthy()
  })

  it('opens that one file only: the rest of the sender’s account stays theirs', async () => {
    // Another file of the sender's, never sent.
    expect((await download(recipient, `${sender.id}/${otherId}`)).error).toBeTruthy()
    // Neither their list nor their folder can be read.
    expect(await listMyFileRecords(recipient.supabase)).toEqual([])
    const { data: listed } = await recipient.supabase.storage.from('my-files').list(sender.id)
    expect((listed ?? []).map((o) => o.name)).not.toContain(otherId)
    // A recipient can read, not write: no replacing, deleting or adding.
    const { error: replaced } = await recipient.supabase.storage.from('my-files').upload(path, other, { upsert: true })
    expect(replaced).toBeTruthy()
    await recipient.supabase.storage.from('my-files').remove([path])
    expect(new Uint8Array(await fetchMyFile(sender.supabase, songId))).toEqual(new Uint8Array(song))
    const { error: planted } = await recipient.supabase.storage.from('my-files').upload(`${sender.id}/${otherId}x`, other)
    expect(planted).toBeTruthy()
    // An attempt of the recipient's own that names the sender's other file opens nothing:
    // the file must be the attempt owner's.
    const mine = await saveAttempt(recipient.supabase, attemptOf(otherId))
    expect(await getSharedAttemptSong(recipient.supabase, mine.id)).toBeNull()
    expect((await download(recipient, `${sender.id}/${otherId}`)).error).toBeTruthy()
  })

  it('says there is no stored file when the sender only has the row, or a catalog-less take was never kept', async () => {
    const unsentBytes = encode(`<score-partwise><!-- device only ${crypto.randomUUID()} --></score-partwise>`)
    const id = await fingerprintOf(unsentBytes)
    // Listed (another device has it) but the file itself never reached the account.
    await upsertMyFileRecords(sender.supabase, [file(id, 'Device only.musicxml', unsentBytes)])
    const attempt = await saveAttempt(sender.supabase, attemptOf(id))
    await sendAttemptToFriends(sender.supabase, attempt.id, [recipient.id])
    expect(await getSharedAttemptSong(recipient.supabase, attempt.id)).toBeNull()
  })

  it('refuses a stored file that isn’t the one the attempt names', async () => {
    // The bucket doesn't check contents: the sender's account holds other bytes under this fingerprint.
    const claimed = await fingerprintOf(encode(`claimed ${crypto.randomUUID()}`))
    await storeMyFile(sender.supabase, file(claimed, 'Swapped.musicxml', other), other)
    const attempt = await saveAttempt(sender.supabase, attemptOf(claimed))
    await sendAttemptToFriends(sender.supabase, attempt.id, [recipient.id])
    await expect(getSharedAttemptSong(recipient.supabase, attempt.id)).rejects.toThrow(/isn’t the file/)
  })

  it('takes the file back when the take is unsent, and when the sender removes the file', async () => {
    // A second recipient keeps access while the first loses it.
    await sendAttemptToFriends(sender.supabase, attemptId, [friend.id])
    expect((await getSharedAttemptSong(friend.supabase, attemptId))?.fingerprint).toBe(songId)

    await unsendAttempt(sender.supabase, attemptId, recipient.id)
    expect(await getSharedAttemptSong(recipient.supabase, attemptId)).toBeNull()
    expect((await download(recipient, path)).error).toBeTruthy()
    expect((await download(friend, path)).error).toBeNull()

    await deleteMyFileRecord(sender.supabase, songId)
    expect(await getSharedAttemptSong(friend.supabase, attemptId)).toBeNull()
    expect((await download(friend, path)).error).toBeTruthy()
  })
})
