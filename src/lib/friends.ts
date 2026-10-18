import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Friends (migrations 0008–0009): your name#tag, finding people by it,
 * friend requests, and "add me" invite links. Every write goes through a
 * database function that checks who is asking; see the migrations for the
 * rules. Tested in tests/backend/friends.test.ts.
 */

export interface MyProfile {
  id: string
  display_name: string | null
  tag: string
  avatar_url: string | null
  invite_code: string
}

/** Someone else, as much of them as the app may see. */
export interface PublicProfile {
  id: string
  display_name: string | null
  tag: string
  avatar_url: string | null
}

export type FriendKind = 'friend' | 'incoming' | 'outgoing'

export interface FriendEntry {
  friendship_id: string
  user_id: string
  display_name: string | null
  tag: string
  avatar_url: string | null
  /** 'friend', 'incoming' (they asked you) or 'outgoing' (you asked them). */
  kind: FriendKind
  /** When you became friends, or when the request was sent. */
  since: string
}

export type FriendRequestResult = 'requested' | 'accepted' | 'already_requested' | 'already_friends'

export interface InviteResult extends PublicProfile {
  /** 'friends' (new), 'already_friends', or 'self' (your own link). */
  result: 'friends' | 'already_friends' | 'self'
}

// ── name#tag (pure) ─────────────────────────────────────────────────────

export const NAME_PATTERN = /^[A-Za-z0-9 _.-]{2,20}$/

/** "Pan#2041", or null while the person hasn't picked a name. */
export function formatHandle(profile: { display_name: string | null; tag: string }): string | null {
  return profile.display_name ? `${profile.display_name}#${profile.tag}` : null
}

/** "pan#2041" → { name: 'pan', tag: '2041' }; null if it isn't a name#tag. */
export function parseHandle(input: string): { name: string; tag: string } | null {
  const match = /^\s*([^#]+?)\s*#\s*(\d{4})\s*$/.exec(input)
  if (!match || !NAME_PATTERN.test(match[1]!)) return null
  return { name: match[1]!, tag: match[2]! }
}

/** Why a name won't be accepted, or null if it's fine. */
export function nameProblem(name: string): string | null {
  const clean = name.trim()
  if (clean.length < 2 || clean.length > 20) return 'Use 2 to 20 characters'
  if (!NAME_PATTERN.test(clean)) return 'Use letters, numbers, spaces, _ . or -'
  return null
}

// ── invite links (pure) ─────────────────────────────────────────────────

export const INVITE_PARAM = 'invite'

/** The link someone opens to become your friend. */
export function inviteUrlFor(code: string, origin: string): string {
  const url = new URL('/', origin)
  url.searchParams.set(INVITE_PARAM, code)
  return url.toString()
}

/** The invite code in an address, or null. */
export function readInviteCode(href: string): string | null {
  try {
    const code = new URL(href).searchParams.get(INVITE_PARAM)?.trim()
    return code && /^[0-9a-f]{16}$/.test(code) ? code : null
  } catch {
    return null
  }
}

// ── your profile ────────────────────────────────────────────────────────

async function rpc<T>(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

/** The signed-in user's own profile (name, tag, avatar, invite code). */
export async function getMyProfile(supabase: SupabaseClient): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, tag, avatar_url, invite_code')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as MyProfile | null
}

/**
 * Pick or change your name. Your tag stays the same unless someone already
 * has that name with your tag, so check the returned tag.
 */
export async function setDisplayName(
  supabase: SupabaseClient,
  name: string,
): Promise<{ display_name: string; tag: string }> {
  const problem = nameProblem(name)
  if (problem) throw new Error(problem)
  const rows = await rpc<{ display_name: string; tag: string }[]>(supabase, 'set_display_name', { new_name: name })
  return rows[0]!
}

/** A new invite code; links with the old one stop working. */
export async function resetInviteCode(supabase: SupabaseClient): Promise<string> {
  return rpc<string>(supabase, 'reset_invite_code')
}

// ── finding people ──────────────────────────────────────────────────────

/** The one user with this exact name#tag, or null. */
export async function findUserByHandle(supabase: SupabaseClient, handle: string): Promise<PublicProfile | null> {
  if (!parseHandle(handle)) return null
  const rows = await rpc<PublicProfile[]>(supabase, 'find_user_by_handle', { handle: handle.trim() })
  return rows[0] ?? null
}

// ── friends + requests ──────────────────────────────────────────────────

export async function listFriends(supabase: SupabaseClient): Promise<FriendEntry[]> {
  return (await rpc<FriendEntry[] | null>(supabase, 'list_friends')) ?? []
}

/** Ask someone to be friends (accepts at once if they had already asked you). */
export async function sendFriendRequest(supabase: SupabaseClient, userId: string): Promise<FriendRequestResult> {
  return rpc<FriendRequestResult>(supabase, 'send_friend_request', { target: userId })
}

export async function acceptFriendRequest(supabase: SupabaseClient, friendshipId: string): Promise<void> {
  await rpc(supabase, 'respond_friend_request', { request_id: friendshipId, accept: true })
}

export async function declineFriendRequest(supabase: SupabaseClient, friendshipId: string): Promise<void> {
  await rpc(supabase, 'respond_friend_request', { request_id: friendshipId, accept: false })
}

/** Unfriend, or cancel a request you sent. */
export async function removeFriend(supabase: SupabaseClient, userId: string): Promise<void> {
  await rpc(supabase, 'remove_friend', { other: userId })
}

/** Open someone's invite link: you become friends straight away. */
export async function acceptInvite(supabase: SupabaseClient, code: string): Promise<InviteResult> {
  const rows = await rpc<(PublicProfile & { user_id: string; result: InviteResult['result'] })[]>(
    supabase,
    'accept_invite',
    { code },
  )
  const row = rows[0]!
  return { id: row.user_id, display_name: row.display_name, tag: row.tag, avatar_url: row.avatar_url, result: row.result }
}