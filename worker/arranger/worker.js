import { mkdtempSync, rmSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { arrangeAudio } from '../../app/src/tabs/vocal/arrange/pipeline.js'
import { MAX_SECONDS, decodeFile, downloadAudio, toModelRate, videoInfo } from './audio.js'
import { loadModels } from './models.js'

/**
 * The arranger worker: takes the jobs queued in arrangement_job (migration
 * 0011) one at a time, oldest first, and for each fetches the video's
 * audio (yt-dlp), arranges it with the Vocal tab's arranger
 * (arrangeAudio), uploads the MusicXML to arrangements/<user>/<job>.musicxml
 * and marks the job done, writing its stage and progress as it goes. The
 * audio lives only in a temporary folder and is deleted after each job.
 *
 * Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (the worker writes
 * what users may not), and optionally WORKER_NAME, CACHE_DIR, YT_DLP,
 * FFMPEG, POLL_SECONDS.
 */

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(2)
}
const WORKER = process.env.WORKER_NAME || hostname()
const POLL = Number(process.env.POLL_SECONDS || 5) * 1000
const CACHE_DIR = process.env.CACHE_DIR || join(process.env.HOME, '.cache/harmonic-arranger')
const FETCH_SHARE = 0.08 // of the progress bar, for getting the audio

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const log = (...args) => console.log(new Date().toISOString(), ...args)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** A message for the user; the details stay in the log. */
class UserError extends Error {}

async function update(id, fields) {
  const { error } = await supabase.from('arrangement_job').update(fields).eq('id', id)
  if (error) log(`[${id}] update failed:`, error.message)
}

/** Progress written at most every two seconds (and always on a new stage). */
function reporter(id) {
  let lastAt = 0
  let lastStage = null
  return ({ label, value }) => {
    const now = Date.now()
    if (label === lastStage && now - lastAt < 2000) return
    lastAt = now
    lastStage = label
    update(id, { stage: label, progress: Math.min(1, Math.max(0, value)) })
  }
}

async function arrange(job, models) {
  const report = reporter(job.id)
  const work = mkdtempSync(join(tmpdir(), 'arranger-'))
  try {
    report({ label: 'Finding the video', value: 0 })
    let info
    try {
      info = await videoInfo(job.youtube_id)
    } catch (err) {
      log(`[${job.id}] yt-dlp info:`, err.stderr ?? err.message)
      throw new UserError('YouTube wouldn’t give us that video. It may be private, age-restricted or removed.')
    }
    if (info.live) throw new UserError('That’s a live stream. Try a video of the song instead.')
    if (info.duration > MAX_SECONDS) throw new UserError('That video is over 10 minutes. Try a shorter one.')
    await update(job.id, { title: info.title })

    report({ label: 'Getting the audio', value: FETCH_SHARE / 2 })
    let file
    try {
      file = await downloadAudio(job.youtube_id, work)
    } catch (err) {
      log(`[${job.id}] yt-dlp download:`, err.stderr ?? err.message)
      throw new UserError('The audio couldn’t be fetched from YouTube. Try again later, or upload the audio instead.')
    }
    const audio = await decodeFile(file)
    rmSync(file, { force: true })

    const result = await arrangeAudio(audio, {
      models,
      toModelRate,
      voicing: job.voicing,
      melodyPart: job.melody_part,
      keepKey: job.keep_key,
      title: info.title,
      onProgress: ({ label, value }) => report({ label, value: FETCH_SHARE + (1 - FETCH_SHARE) * value }),
    })

    const path = `${job.user_id}/${job.id}.musicxml`
    const { error } = await supabase.storage
      .from('arrangements')
      .upload(path, new Blob([result.musicXml], { type: 'application/vnd.recordare.musicxml+xml' }), { upsert: true })
    if (error) throw error
    await update(job.id, {
      status: 'done',
      stage: null,
      progress: 1,
      result_path: path,
      finished_at: new Date().toISOString(),
      summary: {
        key: result.key.name,
        shift: result.shift,
        melodyPartName: result.parts[result.melodyPart].name,
        bpm: Math.round(result.bpm),
        measures: result.measures,
      },
    })
    log(`[${job.id}] done: ${info.title} → ${path}`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log(`${signal}: stopping after the current job`)
    stopping = true
  })
}

const models = await loadModels({ cacheDir: CACHE_DIR })
// Jobs this worker was running when it last stopped go back in the queue.
{
  const { data } = await supabase.from('arrangement_job').update({ status: 'queued', stage: null, progress: 0 }).eq('status', 'running').eq('worker', WORKER).select('id')
  if (data?.length) log(`requeued ${data.length} interrupted job(s)`)
}
log(`worker ${WORKER} ready`)

while (!stopping) {
  const { data, error } = await supabase.rpc('claim_arrangement_job', { worker_name: WORKER })
  if (error) {
    log('claim failed:', error.message)
    await sleep(POLL * 4)
    continue
  }
  const job = data?.[0]
  if (!job) {
    await sleep(POLL)
    continue
  }
  log(`[${job.id}] ${job.youtube_id} (${job.voicing}) for ${job.user_id}`)
  const started = Date.now()
  try {
    await arrange(job, models)
  } catch (err) {
    log(`[${job.id}] failed:`, err)
    const message = err instanceof UserError || err.message === 'No singing was heard in this recording.' ? err.message : 'Something went wrong while arranging. Try again, or upload the audio instead.'
    await update(job.id, { status: 'failed', stage: null, error: message, finished_at: new Date().toISOString() })
  }
  log(`[${job.id}] took ${((Date.now() - started) / 1000).toFixed(0)} s`)
}
log('stopped')
