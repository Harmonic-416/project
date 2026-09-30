import { beforeAll, describe, expect, it } from 'vitest'
import {
  deleteSharedAttempt,
  getSharedAttempt,
  getSharedRecordingUrl,
  listMySharedAttempts,
  shareAttempt,
  type NewSharedAttempt,
} from '../../src/lib/attempts'
import { hasSupabaseEnv, newClient, newTestUser } from '../helpers'

// Shared attempts (migration 0005): a signed-in user shares a sung attempt
// as a link; any other signed-in user with the id can open it and play its
// recording; nobody can list other people's shares, and signed-out clients
// get nothing.
const CATALOG_SONG = '00000000-0000-4000-8000-000000000011' // Ode to Joy (voice)

const attempt: NewSharedAttempt = {
  sharerName: 'Test Singer',
  songId: CATALOG_SONG,
  songTitle: 'Ode to Joy',
  songFormat: 'musicxml',
  partId: 'P1',
  partName: 'Voice',
  samples: [
    [0.1, 64.02],
    [0.12, 64.1],
    [0.5, 66.8],
  ],
  accuracy: 66.7,
}

describe.skipIf(!hasSupabaseEnv)('shared attempts (0005)', () => {
  let owner: Awaited<ReturnType<typeof newTestUser>>
  let viewer: Awaited<ReturnType<typeof newTestUser>>

  beforeAll(async () => {
    owner = await newTestUser('share-owner')
    viewer = await newTestUser('share-viewer')
  }, 30_000)

  it('shares a catalog-song attempt with its recording; another user opens both by id', async () => {
    const recording = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], { type: 'audio/webm' })
    const shared = await shareAttempt(owner.supabase, attempt, recording)
    expect(shared.recording_path).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webm$/)

    const opened = await getSharedAttempt(viewer.supabase, shared.id)
    expect(opened?.song_id).toBe(CATALOG_SONG)
    expect(opened?.samples).toEqual(attempt.samples)
    expect(Number(opened?.accuracy)).toBeCloseTo(66.7)

    const url = await getSharedRecordingUrl(viewer.supabase, opened!)
    const res = await fetch(url!)
    expect(res.status).toBe(200)
    expect((await res.arrayBuffer()).byteLength).toBe(recording.size)
  }, 30_000)

  it('shares an attempt on a file only the two users have, by fingerprint', async () => {
    const fingerprint = 'ab'.repeat(32)
    const shared = await shareAttempt(owner.supabase, {
      ...attempt,
      songId: null,
      songTitle: 'My choir piece',
      songFormat: 'midi',
      songFingerprint: fingerprint,
    })
    const opened = await getSharedAttempt(viewer.supabase, shared.id)
    expect(opened?.song_id).toBeNull()
    expect(opened?.song_fingerprint).toBe(fingerprint)
    expect(await getSharedRecordingUrl(viewer.supabase, opened!)).toBeNull()
  }, 30_000)

  it('needs a catalog song or a fingerprint', async () => {
    await expect(shareAttempt(owner.supabase, { ...attempt, songId: null })).rejects.toThrow(/fingerprint/)
  })

  it('keeps shares unlisted: other users see none, signed-out clients get nothing', async () => {
    const mine = await listMySharedAttempts(owner.supabase)
    expect(mine.length).toBeGreaterThanOrEqual(2)
    expect(await listMySharedAttempts(viewer.supabase)).toHaveLength(0)

    const anon = newClient()
    await expect(getSharedAttempt(anon, mine[0]!.id)).rejects.toThrow()
    await expect(shareAttempt(anon, attempt)).rejects.toThrow()

    const withRecording = mine.find((a) => a.recording_path)!
    const { data } = await anon.storage.from('recordings').download(withRecording.recording_path!)
    expect(data).toBeNull()
  }, 30_000)

  it('only the owner can stop sharing; the link then stops working', async () => {
    const [latest] = await listMySharedAttempts(owner.supabase)
    await viewer.supabase.from('shared_attempt').delete().eq('id', latest!.id)
    expect(await getSharedAttempt(viewer.supabase, latest!.id)).not.toBeNull()

    await deleteSharedAttempt(owner.supabase, latest!)
    expect(await getSharedAttempt(viewer.supabase, latest!.id)).toBeNull()
  }, 30_000)
})
