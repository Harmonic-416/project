import { beforeAll, describe, expect, it } from 'vitest'
import { acceptFriendRequest, listFriends, sendFriendRequest } from '../../src/lib/friends'
import { addAttemptComment, canViewAttempt, listSongAttempts, saveAttempt, sendAttemptToFriends } from '../../src/lib/attempts'
import { saveAttemptFeedback } from '../../src/lib/practiceSessions'
import { hasSupabaseEnv, newClient, newTestUser } from '../helpers'

// An opened attempt's history (listSongAttempts): the singer sees every try
// at the song with their own notes; a friend sees only the tries sent to
// them, never the notes; comment counts come along. Needs migrations 0010
// and 0014.
async function schemaApplied(): Promise<boolean> {
  if (!hasSupabaseEnv) return false
  const { error } = await newClient().from('practice_session').select('id').limit(1)
  return !error
}
const schemaReady = await schemaApplied()

type User = Awaited<ReturnType<typeof newTestUser>> & { id: string }
async function user(prefix: string): Promise<User> {
  const u = await newTestUser(prefix)
  const { data } = await u.supabase.auth.getUser()
  return { ...u, id: data.user!.id }
}

describe.skipIf(!schemaReady)('the tries under an opened attempt', () => {
  let owner: User
  let friend: User
  let stranger: User
  const fingerprint = 'd'.repeat(64)
  const ids: string[] = []

  beforeAll(async () => {
    ;[owner, friend, stranger] = await Promise.all([user('tries-owner'), user('tries-friend'), user('tries-stranger')])
    await sendFriendRequest(owner.supabase, friend.id)
    const [incoming] = await listFriends(friend.supabase)
    await acceptFriendRequest(friend.supabase, incoming!.friendship_id)
    for (const accuracy of [40, 73.6, 59]) {
      const saved = await saveAttempt(owner.supabase, { songTitle: 'Dream', songFingerprint: fingerprint, partName: 'Baritone 2', samples: [], accuracy })
      ids.push(saved.id)
    }
    // Another song's try, which must not show up.
    await saveAttempt(owner.supabase, { songTitle: 'Other', songFingerprint: 'e'.repeat(64), samples: [], accuracy: 99 })
    await saveAttemptFeedback(owner.supabase, ids[2]!, { selfNote: 'flat on the high notes', rating: 3 })
    await sendAttemptToFriends(owner.supabase, ids[2]!, [friend.id])
    await sendAttemptToFriends(owner.supabase, ids[0]!, [friend.id])
    await addAttemptComment(friend.supabase, ids[2]!, 'Nice tone, watch the pitch at bar 4')
  }, 60_000)

  it('gives the singer every try at the song, newest first, with notes and comment counts', async () => {
    const tries = await listSongAttempts(owner.supabase, { user_id: owner.id, song_id: null, song_fingerprint: fingerprint, instrument: 'voice' }, { isOwner: true })
    expect(tries.map((t) => t.id)).toEqual([ids[2], ids[1], ids[0]])
    expect(tries.map((t) => Number(t.accuracy))).toEqual([59, 73.6, 40])
    expect(tries[0]).toMatchObject({ self_note: 'flat on the high notes', rating: 3, comment_count: 1, part_name: 'Baritone 2' })
    expect(tries[1]).toMatchObject({ comment_count: 0, self_note: null })
  })

  it('gives a friend only the tries sent to them, without the singer’s notes', async () => {
    const tries = await listSongAttempts(friend.supabase, { user_id: owner.id, song_id: null, song_fingerprint: fingerprint, instrument: 'voice' })
    expect(tries.map((t) => t.id)).toEqual([ids[2], ids[0]])
    expect(tries[0]).toMatchObject({ self_note: null, rating: null, comment_count: 1 })
    expect(await canViewAttempt(friend.supabase, ids[2]!)).toBe(true)
  })

  it('gives anyone else nothing', async () => {
    const tries = await listSongAttempts(stranger.supabase, { user_id: owner.id, song_id: null, song_fingerprint: fingerprint, instrument: 'voice' })
    expect(tries).toEqual([])
    expect(await canViewAttempt(stranger.supabase, ids[2]!)).toBe(false)
  })
})
