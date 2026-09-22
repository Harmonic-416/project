// Capacity baseline for the Supabase backend, driven the way the app drives it
// (supabase-js over PostgREST + Storage, one signed-in user). Read-mostly and
// deliberately modest: ~1.3k requests, one throwaway user, a few KB of writes,
// everything it creates is deleted afterwards (except the notation object,
// which the bucket policy doesn't let clients delete).
//
//   node tests/load/supabase-baseline.mjs                 # VUS=1,10,25 ITER=10
//   VUS=1,5 ITER=5 UPLOAD_VUS=1 node tests/load/supabase-baseline.mjs
//
// Reads SUPABASE_URL / SUPABASE_ANON_KEY from .env.local. Numbers are for the
// current compute tier of the project you point it at — re-run after a tier
// change or a schema change touching these paths.
import { config } from 'dotenv'
import { WebSocket } from 'ws'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
if (!('WebSocket' in globalThis)) globalThis.WebSocket = WebSocket

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('Missing SUPABASE_URL / SUPABASE_ANON_KEY in .env.local')

const VUS = (process.env.VUS ?? '1,10,25').split(',').map(Number)
const ITER = Number(process.env.ITER ?? 10)
const UPLOAD_VUS = (process.env.UPLOAD_VUS ?? '1,5').split(',').map(Number)
const UPLOAD_ITER = Number(process.env.UPLOAD_ITER ?? 4)

const TINY_SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
${'<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>'.repeat(4)}</measure></part></score-partwise>
`

function percentile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}

async function runOp(name, fn, { vus, iterations }) {
  const latencies = []
  const errors = new Map()
  const start = performance.now()
  await Promise.all(
    Array.from({ length: vus }, async () => {
      for (let i = 0; i < iterations; i += 1) {
        const t = performance.now()
        try {
          await fn()
        } catch (err) {
          const key = String(err?.message ?? err).slice(0, 60)
          errors.set(key, (errors.get(key) ?? 0) + 1)
        }
        latencies.push(performance.now() - t)
      }
    }),
  )
  const wall = (performance.now() - start) / 1000
  latencies.sort((a, b) => a - b)
  return {
    name,
    vus,
    requests: latencies.length,
    errors: [...errors.values()].reduce((a, b) => a + b, 0),
    errorKinds: [...errors.entries()].map(([k, v]) => `${v}× ${k}`).join('; '),
    rps: latencies.length / wall,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    max: latencies.at(-1),
  }
}

function must({ data, error }) {
  if (error) throw error
  return data
}

async function main() {
  const supabase = createClient(url, anonKey, { auth: { persistSession: false } })
  const email = `load-${crypto.randomUUID()}@harmonic-tests.example.com`
  const password = `Hp-${crypto.randomUUID()}`
  must(await supabase.auth.signUp({ email, password }))
  const session = must(await supabase.auth.signInWithPassword({ email, password })).session
  const userId = session.user.id

  // One owned song so signed URLs, downloads and run-throughs have a target.
  const notationPath = `${userId}/${crypto.randomUUID()}.musicxml`
  must(
    await supabase.storage
      .from('notation')
      .upload(notationPath, TINY_SCORE, { contentType: 'application/vnd.recordare.musicxml+xml' }),
  )
  const song = must(
    await supabase
      .from('song')
      .insert({ user_id: userId, title: 'load-test', instrument: 'voice', notation_path: notationPath })
      .select()
      .single(),
  )
  const signedUrl = must(await supabase.storage.from('notation').createSignedUrl(notationPath, 3600)).signedUrl
  const runThrough = must(
    await supabase.from('run_through').insert({ user_id: userId, song_id: song.id, score: 80 }).select().single(),
  )
  const fakeRecording = new Blob([new Uint8Array(60 * 1024)], { type: 'audio/webm' })
  const uploadedPaths = []

  // PostgREST builders are lazy (they run when awaited) — every op awaits.
  const ops = {
    'list-library (select song)': async () => must(await supabase.from('song').select('*').order('created_at')),
    'signed-url (storage API)': async () =>
      must(await supabase.storage.from('notation').createSignedUrl(notationPath, 3600)),
    'download-notation (GET 0.5 KB)': async () => {
      const res = await fetch(signedUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await res.arrayBuffer()
    },
    'insert-run-through (write)': async () =>
      must(await supabase.from('run_through').insert({ user_id: userId, song_id: song.id, score: 75 }).select().single()),
  }
  const uploadOp = async () => {
    const path = `${userId}/${crypto.randomUUID()}.webm`
    must(await supabase.storage.from('recordings').upload(path, fakeRecording, { contentType: 'audio/webm' }))
    uploadedPaths.push(path)
    must(
      await supabase.from('recording').insert({
        user_id: userId,
        run_through_id: runThrough.id,
        storage_path: path,
        mime_type: 'audio/webm',
        bytes: fakeRecording.size,
      }),
    )
  }

  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const results = []
  console.log(`Target: ${url}  user: ${email}`)
  for (const [name, fn] of Object.entries(ops)) {
    for (const vus of VUS) {
      results.push(await runOp(name, fn, { vus, iterations: ITER }))
      await pause(1000) // let connection pools drain between steps
    }
  }
  for (const vus of UPLOAD_VUS) {
    results.push(await runOp('upload-recording 60 KB + row (2 req)', uploadOp, { vus, iterations: UPLOAD_ITER }))
    await pause(1000)
  }

  console.log('\n| operation | VUs | requests | errors | req/s | p50 ms | p95 ms | max ms |')
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const r of results) {
    console.log(
      `| ${r.name} | ${r.vus} | ${r.requests} | ${r.errors}${r.errorKinds ? ` (${r.errorKinds})` : ''} | ${r.rps.toFixed(1)} | ${r.p50.toFixed(0)} | ${r.p95.toFixed(0)} | ${r.max.toFixed(0)} |`,
    )
  }
  console.log(`\nTotal requests: ${results.reduce((a, r) => a + r.requests, 0) + uploadedPaths.length}`)

  // Clean up what the policies let us delete (retrying: a 429 from the
  // storage API right after a burst is expected on small compute tiers).
  const retrying = async (label, fn) => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        return must(await fn())
      } catch (err) {
        console.warn(`${label}: attempt ${attempt} failed (${err.message}); retrying`)
        await pause(2000 * attempt)
      }
    }
    console.error(`${label}: giving up — clean up by hand for user ${email}`)
    return null
  }
  if (uploadedPaths.length) await retrying('remove recordings', () => supabase.storage.from('recordings').remove(uploadedPaths))
  await retrying('delete recording rows', () => supabase.from('recording').delete().eq('user_id', userId))
  await retrying('delete run-throughs', () => supabase.from('run_through').delete().eq('user_id', userId))
  await retrying('delete song', () => supabase.from('song').delete().eq('id', song.id))
  console.log('Cleaned up recordings, run-throughs and the test song (notation object stays: no client delete policy).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
