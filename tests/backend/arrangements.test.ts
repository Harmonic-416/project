import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  canArrangeFromLinks,
  deleteArrangementJob,
  downloadArrangement,
  getArrangementJob,
  listMyArrangementJobs,
  requestArrangement,
} from '../../src/lib/arrangements'
import { hasSupabaseEnv, newTestUser } from '../helpers'

// Arrangements from a YouTube link (migration 0011): only users on the
// arranger list queue jobs, within the limits; a user sees only their own
// jobs and results; status and results are the worker's (the service role)
// to write. Needs SUPABASE_SERVICE_ROLE_KEY to stand in for the worker and
// keep the list — run it against a local stack, not the shared project.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const VIDEO = 'dQw4w9WgXcQ'

describe.skipIf(!hasSupabaseEnv || !serviceKey)('arrangements from links (0011)', () => {
  const service = createClient(process.env.SUPABASE_URL!, serviceKey!, { auth: { persistSession: false } })
  let member: Awaited<ReturnType<typeof newTestUser>>
  let outsider: Awaited<ReturnType<typeof newTestUser>>
  let memberId: string

  beforeAll(async () => {
    member = await newTestUser('arranger-member')
    outsider = await newTestUser('arranger-outsider')
    memberId = (await member.supabase.auth.getUser()).data.user!.id
    const { error } = await service.from('arranger_access').insert({ user_id: memberId, note: 'test' })
    if (error) throw error
  }, 30_000)

  it('lets only users on the list queue a job', async () => {
    expect(await canArrangeFromLinks(member.supabase)).toBe(true)
    expect(await canArrangeFromLinks(outsider.supabase)).toBe(false)
    await expect(requestArrangement(outsider.supabase, { youtubeId: VIDEO })).rejects.toThrow(/Harmonic team/)
    const job = await requestArrangement(member.supabase, { youtubeId: VIDEO, voicing: 'satb' })
    expect(job).toMatchObject({ user_id: memberId, youtube_id: VIDEO, voicing: 'satb', status: 'queued', result_path: null })
  })

  it('leaves the status and result to the worker', async () => {
    const { error } = await member.supabase.from('arrangement_job').insert({ youtube_id: VIDEO, status: 'done', result_path: 'x/y.musicxml' })
    expect(error).not.toBeNull()
    const [job] = await listMyArrangementJobs(member.supabase, 1)
    const { data } = await member.supabase.from('arrangement_job').update({ status: 'done' }).eq('id', job!.id).select()
    expect(data ?? []).toHaveLength(0)
    expect((await getArrangementJob(member.supabase, job!.id))?.status).toBe('queued')
  })

  it('allows two jobs on their way at a time', async () => {
    await requestArrangement(member.supabase, { youtubeId: VIDEO })
    await expect(requestArrangement(member.supabase, { youtubeId: VIDEO })).rejects.toThrow(/already on their way/)
  })

  it('hands the worker the oldest job, then the owner its result, and no one else', async () => {
    const { data: claimed, error } = await service.rpc('claim_arrangement_job', { worker_name: 'test' })
    expect(error).toBeNull()
    const job = claimed[0]
    expect(job).toMatchObject({ status: 'running', worker: 'test', voicing: 'satb' })
    // Only the service role may claim.
    const { error: denied } = await member.supabase.rpc('claim_arrangement_job', { worker_name: 'me' })
    expect(denied).not.toBeNull()

    const path = `${memberId}/${job.id}.musicxml`
    const xml = '<?xml version="1.0"?><score-partwise version="4.0"><part-list/></score-partwise>'
    await service.storage.from('arrangements').upload(path, new Blob([xml], { type: 'application/xml' }))
    await service.from('arrangement_job').update({ status: 'done', progress: 1, result_path: path, title: 'Test' }).eq('id', job.id)

    const done = await getArrangementJob(member.supabase, job.id)
    expect(await downloadArrangement(member.supabase, done!)).toBe(xml)
    expect(await getArrangementJob(outsider.supabase, job.id)).toBeNull()
    const { data: stolen } = await outsider.supabase.storage.from('arrangements').download(path)
    expect(stolen).toBeNull()

    await deleteArrangementJob(member.supabase, done!)
    expect(await getArrangementJob(member.supabase, job.id)).toBeNull()
  })
})
