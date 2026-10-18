import { beforeAll, describe, expect, it } from 'vitest'
import {
  acceptFriendRequest,
  acceptInvite,
  declineFriendRequest,
  findUserByHandle,
  getMyProfile,
  listFriends,
  removeFriend,
  resetInviteCode,
  sendFriendRequest,
  setDisplayName,
} from '../../src/lib/friends'
import {
  addAttemptComment,
  deleteAttemptComment,
  getSharedAttempt,
  listAttemptComments,
  listAttemptRecipients,
  listAttemptsSharedWithMe,
  markAttemptSeen,
  saveAttempt,
  sendAttemptToFriends,
  shareAttemptLink,
  unsendAttempt,
} from '../../src/lib/attempts'
import { getLatestAttempt, listRecentAttempts, songsInProgress } from '../../src/lib/home'
import { hasSupabaseEnv, newClient, newTestUser } from '../helpers'

// The src/lib helpers the homepage uses, against a real project. Skips until
// migrations 0008–0010 are applied (see social.test.ts for why).
async function schemaApplied(): Promise<boolean> {
  if (!hasSupabaseEnv) return false
  const { error } = await newClient().rpc('find_user_by_handle', { handle: 'nobody#0000' })
  return error?.code !== 'PGRST202'
}
const schemaReady = await schemaApplied()

type User = Awaited<ReturnType<typeof newTestUser>> & { id: string }

async function user(prefix: string): Promise<User> {
  const u = await newTestUser(prefix)
  const { data } = await u.supabase.auth.getUser()
  return { ...u, id: data.user!.id }
}

describe.skipIf(!schemaReady)('homepage helpers (friends, sending, comments)', () => {
  let a: User
  let b: User
  let c: User

  beforeAll(async () => {
    ;[a, b, c] = await Promise.all([user('home-a'), user('home-b'), user('home-c')])
  }, 60_000)

  it('profile, name and lookup by name#tag', async () => {
    const me = await getMyProfile(a.supabase)
    expect(me!.id).toBe(a.id)
    const { tag } = await setDisplayName(a.supabase, 'Ana')
    await setDisplayName(b.supabase, 'Ben')
    await expect(setDisplayName(a.supabase, 'x')).rejects.toThrow(/2 to 20/)

    expect((await findUserByHandle(b.supabase, `ana#${tag}`))?.id).toBe(a.id)
    expect(await findUserByHandle(b.supabase, 'ana')).toBeNull()
  })

  it('request, accept, list, unfriend', async () => {
    expect(await sendFriendRequest(a.supabase, b.id)).toBe('requested')
    const [incoming] = await listFriends(b.supabase)
    expect(incoming).toMatchObject({ user_id: a.id, kind: 'incoming', display_name: 'Ana' })
    await acceptFriendRequest(b.supabase, incoming!.friendship_id)
    expect(await listFriends(a.supabase)).toMatchObject([{ user_id: b.id, kind: 'friend' }])

    await sendFriendRequest(c.supabase, a.id)
    const request = (await listFriends(a.supabase)).find((f) => f.kind === 'incoming')!
    await declineFriendRequest(a.supabase, request.friendship_id)
    expect(await listFriends(c.supabase)).toEqual([])
  })

  it('invite links', async () => {
    const { invite_code } = (await getMyProfile(b.supabase))!
    expect(await acceptInvite(c.supabase, invite_code)).toMatchObject({ id: b.id, result: 'friends' })
    await removeFriend(c.supabase, b.id)
    expect(await listFriends(c.supabase)).toEqual([])

    const fresh = await resetInviteCode(b.supabase)
    expect(fresh).not.toBe(invite_code)
    await expect(acceptInvite(c.supabase, invite_code)).rejects.toThrow(/doesn't work/)
  })

  it('saved attempts stay private until sent or link-shared', async () => {
    const saved = await saveAttempt(a.supabase, {
      songTitle: 'Riff',
      songFingerprint: 'c'.repeat(64),
      samples: [],
      accuracy: 61,
      instrument: 'guitar',
      verdicts: ['hit', 'miss', 'miss'],
    })
    expect(saved.link_shared).toBe(false)
    expect(await getSharedAttempt(c.supabase, saved.id)).toBeNull()

    // Homepage data for the owner.
    expect((await getLatestAttempt(a.supabase))!.id).toBe(saved.id)
    const songs = songsInProgress(await listRecentAttempts(a.supabase))
    expect(songs[0]).toMatchObject({ song_title: 'Riff', latest: 61, attempts: 1 })

    // Sending to a friend.
    await expect(sendAttemptToFriends(a.supabase, saved.id, [c.id])).rejects.toThrow(/friends/)
    expect(await sendAttemptToFriends(a.supabase, saved.id, [b.id])).toBe(1)
    expect(await listAttemptRecipients(a.supabase, saved.id)).toMatchObject([{ recipient_id: b.id, seen_at: null }])
    const [inbox] = await listAttemptsSharedWithMe(b.supabase)
    expect(inbox).toMatchObject({ attempt_id: saved.id, sender_name: 'Ana', accuracy: 61, comment_count: 0 })
    await markAttemptSeen(b.supabase, saved.id)
    expect((await listAttemptRecipients(a.supabase, saved.id))[0]!.seen_at).not.toBeNull()

    // Comments.
    await addAttemptComment(b.supabase, saved.id, '  watch the second bar  ')
    await expect(addAttemptComment(b.supabase, saved.id, '   ')).rejects.toThrow(/Write something/)
    await expect(addAttemptComment(c.supabase, saved.id, 'hi')).rejects.toThrow()
    const comments = await listAttemptComments(a.supabase, saved.id)
    expect(comments.map((x) => [x.display_name, x.body])).toEqual([['Ben', 'watch the second bar']])
    await deleteAttemptComment(a.supabase, comments[0]!.id) // owner may delete
    expect(await listAttemptComments(b.supabase, saved.id)).toEqual([])

    // Unsend, then share by link instead.
    await unsendAttempt(a.supabase, saved.id, b.id)
    expect(await listAttemptsSharedWithMe(b.supabase)).toEqual([])
    await shareAttemptLink(a.supabase, saved.id)
    expect((await getSharedAttempt(c.supabase, saved.id))?.id).toBe(saved.id)
  }, 30_000)
})