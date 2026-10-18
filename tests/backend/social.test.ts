import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseEnv, newClient, newTestUser } from '../helpers'

// Migrations 0008–0010 straight through the database functions (the helpers
// in src/lib wrap these): name#tag, friend requests, invite links, sending
// attempts to friends, and comments. Every "can't" here is a privacy rule.

type User = Awaited<ReturnType<typeof newTestUser>> & { id: string }

async function user(prefix: string): Promise<User> {
  const u = await newTestUser(prefix)
  const { data } = await u.supabase.auth.getUser()
  return { ...u, id: data.user!.id }
}

async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

async function rpcError(supabase: SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  const { error } = await supabase.rpc(fn, args)
  return error?.message ?? null
}

interface Handle {
  display_name: string
  tag: string
}

interface FriendRow {
  friendship_id: string
  user_id: string
  display_name: string | null
  tag: string
  kind: 'friend' | 'incoming' | 'outgoing'
}

async function saveAttempt(supabase: SupabaseClient, linkShared: boolean): Promise<string> {
  const { data, error } = await supabase
    .from('shared_attempt')
    .insert({
      song_title: 'Ode to Joy',
      song_fingerprint: 'a'.repeat(64),
      samples: [],
      accuracy: 72,
      link_shared: linkShared,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

// CI runs these tests before it applies new migrations (the migrate job
// waits for them), so on the PR that adds 0008–0010 the database doesn't
// have these functions yet. Skip until it does instead of failing — a
// missing function is PostgREST's PGRST202; signed out, the real one
// answers "permission denied" instead.
async function socialSchemaApplied(): Promise<boolean> {
  if (!hasSupabaseEnv) return false
  const { error } = await newClient().rpc('find_user_by_handle', { handle: 'nobody#0000' })
  return error?.code !== 'PGRST202'
}
const schemaReady = await socialSchemaApplied()

describe.skipIf(!schemaReady)('friends + attempt sharing (0008–0010)', () => {
  let a: User
  let b: User
  let stranger: User
  let aHandle: Handle

  beforeAll(async () => {
    a = await user('friend-a')
    b = await user('friend-b')
    stranger = await user('stranger')
  }, 60_000)

  describe('name#tag (0008)', () => {
    it('every user has a tag and an invite code', async () => {
      const { data } = await a.supabase.from('profiles').select('tag, invite_code').single()
      expect(data!.tag).toMatch(/^\d{4}$/)
      expect(data!.invite_code).toHaveLength(16)
    })

    it('sets a display name and keeps it unique with the tag', async () => {
      const rows = await rpc<Handle[]>(a.supabase, 'set_display_name', { new_name: 'Pan' })
      aHandle = rows[0]!
      expect(aHandle.display_name).toBe('Pan')
      await rpc(b.supabase, 'set_display_name', { new_name: 'Bob' })
      expect(await rpcError(a.supabase, 'set_display_name', { new_name: 'x' })).toMatch(/2 to 20/)
      expect(await rpcError(a.supabase, 'set_display_name', { new_name: 'no#hash' })).toMatch(/2 to 20/)
    })

    it('profiles cannot be edited directly', async () => {
      const { data } = await a.supabase.from('profiles').update({ tag: '0001' }).eq('id', a.id).select()
      expect(data ?? []).toEqual([])
    })

    it('finds a user by exact name#tag only', async () => {
      const found = await rpc<{ id: string }[]>(b.supabase, 'find_user_by_handle', {
        handle: `pan#${aHandle.tag}`,
      })
      expect(found.map((f) => f.id)).toEqual([a.id])
      expect(await rpc<unknown[]>(b.supabase, 'find_user_by_handle', { handle: 'Pan' })).toEqual([])
    })

    it('nobody can read other profiles', async () => {
      const { data } = await stranger.supabase.from('profiles').select('id')
      expect(data!.map((p) => p.id)).toEqual([stranger.id])
    })
  })

  describe('friends (0009)', () => {
    it('request → incoming/outgoing → accept', async () => {
      expect(await rpc(a.supabase, 'send_friend_request', { target: b.id })).toBe('requested')
      expect(await rpc(a.supabase, 'send_friend_request', { target: b.id })).toBe('already_requested')

      const aList = await rpc<FriendRow[]>(a.supabase, 'list_friends')
      expect(aList).toMatchObject([{ user_id: b.id, kind: 'outgoing', display_name: 'Bob' }])
      const bList = await rpc<FriendRow[]>(b.supabase, 'list_friends')
      expect(bList).toMatchObject([{ user_id: a.id, kind: 'incoming', display_name: 'Pan' }])

      // Only the person asked can accept.
      expect(
        await rpcError(a.supabase, 'respond_friend_request', { request_id: aList[0]!.friendship_id, accept: true }),
      ).toMatch(/gone/)
      await rpc(b.supabase, 'respond_friend_request', { request_id: bList[0]!.friendship_id, accept: true })
      expect(await rpc<FriendRow[]>(a.supabase, 'list_friends')).toMatchObject([{ user_id: b.id, kind: 'friend' }])
    })

    it('strangers see no friendships and cannot write them', async () => {
      expect(await rpc<unknown[]>(stranger.supabase, 'list_friends')).toEqual([])
      const { data } = await stranger.supabase.from('friendship').select('*')
      expect(data).toEqual([])
      const { error } = await stranger.supabase
        .from('friendship')
        .insert({ requester_id: stranger.id, addressee_id: a.id, status: 'accepted' })
      expect(error).not.toBeNull()
    })

    it('cannot add yourself', async () => {
      expect(await rpcError(a.supabase, 'send_friend_request', { target: a.id })).toMatch(/yourself/)
    })

    it('invite link makes friends, and a reset kills the old link', async () => {
      const guest = await user('guest')
      const { data } = await a.supabase.from('profiles').select('invite_code').single()
      const [r] = await rpc<{ user_id: string; result: string }[]>(guest.supabase, 'accept_invite', {
        code: data!.invite_code,
      })
      expect(r).toMatchObject({ user_id: a.id, result: 'friends' })

      await rpc(a.supabase, 'reset_invite_code')
      const late = await user('late-guest')
      expect(await rpcError(late.supabase, 'accept_invite', { code: data!.invite_code })).toMatch(/doesn't work/)
    }, 30_000)

    it('decline / cancel removes the request', async () => {
      await rpc(stranger.supabase, 'send_friend_request', { target: b.id })
      const incoming = (await rpc<FriendRow[]>(b.supabase, 'list_friends')).find((f) => f.kind === 'incoming')!
      await rpc(b.supabase, 'respond_friend_request', { request_id: incoming.friendship_id, accept: false })
      expect(await rpc<unknown[]>(stranger.supabase, 'list_friends')).toEqual([])
    })
  })

  describe('sending attempts + comments (0010)', () => {
    let attemptId: string

    it('a private attempt opens only for its owner', async () => {
      attemptId = await saveAttempt(a.supabase, false)
      expect(await rpc<unknown[]>(a.supabase, 'get_shared_attempt', { attempt_id: attemptId })).toHaveLength(1)
      expect(await rpc<unknown[]>(b.supabase, 'get_shared_attempt', { attempt_id: attemptId })).toEqual([])
    })

    it('a link-shared attempt still opens for anyone signed in', async () => {
      const id = await saveAttempt(a.supabase, true)
      expect(await rpc<unknown[]>(stranger.supabase, 'get_shared_attempt', { attempt_id: id })).toHaveLength(1)
    })

    it('sends only your own attempts, only to friends', async () => {
      expect(
        await rpcError(a.supabase, 'send_attempt_to_friends', { attempt: attemptId, friend_ids: [stranger.id] }),
      ).toMatch(/only send attempts to friends/)
      expect(
        await rpcError(b.supabase, 'send_attempt_to_friends', { attempt: attemptId, friend_ids: [a.id] }),
      ).toMatch(/isn't yours/)
      expect(await rpc(a.supabase, 'send_attempt_to_friends', { attempt: attemptId, friend_ids: [b.id] })).toBe(1)
    })

    it('the friend sees it in their inbox and can open it; strangers cannot', async () => {
      const inbox = await rpc<{ attempt_id: string; sender_name: string; seen_at: string | null }[]>(
        b.supabase,
        'list_attempts_shared_with_me',
      )
      expect(inbox).toMatchObject([{ attempt_id: attemptId, sender_name: 'Pan', seen_at: null }])
      expect(await rpc<unknown[]>(b.supabase, 'get_shared_attempt', { attempt_id: attemptId })).toHaveLength(1)
      await rpc(b.supabase, 'mark_attempt_seen', { attempt: attemptId })
      const [seen] = await rpc<{ seen_at: string | null }[]>(b.supabase, 'list_attempts_shared_with_me')
      expect(seen!.seen_at).not.toBeNull()

      expect(await rpc<unknown[]>(stranger.supabase, 'list_attempts_shared_with_me')).toEqual([])
      expect(await rpc<unknown[]>(stranger.supabase, 'get_shared_attempt', { attempt_id: attemptId })).toEqual([])
    })

    it('the friend cannot change the attempt', async () => {
      const { data } = await b.supabase.from('shared_attempt').update({ accuracy: 100 }).eq('id', attemptId).select()
      expect(data ?? []).toEqual([])
    })

    it('owner and friend can comment; strangers cannot read or write', async () => {
      const { error: bErr } = await b.supabase.from('attempt_comment').insert({ attempt_id: attemptId, body: 'Nice bridge!' })
      expect(bErr).toBeNull()
      const { error: aErr } = await a.supabase.from('attempt_comment').insert({ attempt_id: attemptId, body: 'thanks' })
      expect(aErr).toBeNull()
      const { error: sErr } = await stranger.supabase.from('attempt_comment').insert({ attempt_id: attemptId, body: 'spam' })
      expect(sErr).not.toBeNull()

      const comments = await rpc<{ body: string; display_name: string }[]>(b.supabase, 'list_attempt_comments', {
        attempt: attemptId,
      })
      expect(comments.map((c) => [c.display_name, c.body])).toEqual([
        ['Bob', 'Nice bridge!'],
        ['Pan', 'thanks'],
      ])
      expect(await rpc<unknown[]>(stranger.supabase, 'list_attempt_comments', { attempt: attemptId })).toEqual([])
    })

    it('unsending takes the attempt back', async () => {
      await rpc(a.supabase, 'unsend_attempt', { attempt: attemptId, friend: b.id })
      expect(await rpc<unknown[]>(b.supabase, 'get_shared_attempt', { attempt_id: attemptId })).toEqual([])
      expect(await rpc<unknown[]>(b.supabase, 'list_attempts_shared_with_me')).toEqual([])
    })
  })

  it('signed-out clients get nothing', async () => {
    const anon = newClient()
    expect(await rpcError(anon, 'list_friends')).not.toBeNull()
    const { data } = await anon.from('attempt_comment').select('*')
    expect(data ?? []).toEqual([])
  })
})