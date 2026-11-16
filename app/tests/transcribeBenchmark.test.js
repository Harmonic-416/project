import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as ort from 'onnxruntime-web'
import { describe, expect, it } from 'vitest'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { TRANSCRIBE, evaluateAudio, frameTime, notesFrom } from '../src/tabs/guitar/song/follow/refineWithBasicPitch.js'
import { trackBeats } from '../src/tabs/guitar/song/transcribe/beats.js'
import { YAMNET_RATE } from '../src/tabs/guitar/song/transcribe/guitarPresence.js'
import { draftScore, transcribeAudio } from '../src/tabs/guitar/song/transcribe/pipeline.js'
import { basicPitchFromDisk, describeScore, render, scoreDraft, songs } from './transcribeSongs.js'

/**
 * The transcription benchmark (plan: "our own GuitarSet"): the built-in
 * songs, whose tab we know, rendered to audio with the synthetic guitar and
 * run through the real pipeline — Basic Pitch, Beat This!, then the app's
 * own steps (draftScore) and loading the draft. Scores in
 * tests/transcribeSongs.js (scoreDraft).
 *
 * Slow (Basic Pitch on the CPU, about a minute), so off by default:
 *   TRANSCRIBE_BENCH=1 npx vitest run tests/transcribeBenchmark.test.js        (bash)
 *   $env:TRANSCRIBE_BENCH=1; npx vitest run tests/transcribeBenchmark.test.js  (PowerShell)
 * Add TRANSCRIBE_BENCH_CACHE=<folder> to keep the models' output there, so
 * the steps after them can be tuned without running the models again.
 */

async function modelOutput(song, audio, { basicPitch, model }) {
  const cache = process.env.TRANSCRIBE_BENCH_CACHE
  const file = cache && join(cache, `${song.name.replace(/\W+/g, '-')}.json`)
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const output = await evaluateAudio(audio, { basicPitch })
  const bars = await trackBeats(audio, { model, runtime: ort })
  if (file) {
    const rounded = (rows) => rows.map((row) => Array.from(row, (a) => Math.round(a * 1000) / 1000))
    mkdirSync(cache, { recursive: true })
    writeFileSync(file, JSON.stringify({ output: { frames: rounded(output.frames), onsets: rounded(output.onsets), contours: rounded(output.contours) }, bars }))
  }
  return { output, bars }
}

describe.skipIf(!process.env.TRANSCRIBE_BENCH)('transcription benchmark (synthetic renders of the built-in songs)', () => {
  const basicPitch = basicPitchFromDisk()
  const model = new Uint8Array(readFileSync(new URL('../public/beat-this/small0.onnx', import.meta.url)))

  for (const song of songs()) {
    it(song.name, async () => {
      const audio = render(song)
      const { output, bars } = await modelOutput(song, audio, { basicPitch, model })
      const notes = notesFrom(output, TRANSCRIBE)
      const draft = draftScore({ notes, frames: output.frames, onsets: output.onsets, bars, samples: audio }, { frameTime })
      const notation = await loadGuitarNotation(new TextEncoder().encode(draft.musicXml).buffer, 'draft.musicxml')
      const score = scoreDraft(song, { notes: draft.notes, chords: draft.chords, bars, score: notation.score, origin: draft.origin, beatsPerBar: draft.beatsPerBar })
      console.log(describeScore(song, score))
      expect(notation.hasTab).toBe(true)
      expect(score.notes).toBeGreaterThan(0.6)
      if (score.chords !== null) expect(score.chords).toBeGreaterThan(0.8)
    }, 600000)
  }
})

/** `samples` at `from` Hz → `to` Hz, by linear interpolation (Node has no Web Audio to do it). */
function resampled(samples, from, to) {
  const out = new Float32Array(Math.floor((samples.length * to) / from))
  for (let i = 0; i < out.length; i += 1) {
    const at = (i * from) / to
    const j = Math.floor(at)
    out[i] = samples[j] + (at - j) * ((samples[j + 1] ?? samples[j]) - samples[j])
  }
  return out
}

/**
 * The arranger worker's guitar path (worker/arranger/worker.js `tab`), in
 * Node: transcribeAudio with every model handed in as bytes, on one ONNX
 * runtime, as worker/arranger/models.js does. YAMNet doesn't hear the
 * synthetic guitar as a guitar, so the song goes through the separator and
 * is tabbed `anyway`. Needs the separator's model on disk (the worker
 * keeps it in ~/.cache/harmonic-arranger/; or download separate.js's
 * MODEL_URL), and takes about a minute:
 *   TRANSCRIBE_BENCH=1 TRANSCRIBE_BENCH_SEPARATOR=<htdemucs_6s….onnx> npx vitest run tests/transcribeBenchmark.test.js -t worker
 */
const separatorFile = process.env.TRANSCRIBE_BENCH_SEPARATOR
describe.skipIf(!process.env.TRANSCRIBE_BENCH || !separatorFile)('the arranger worker’s path: transcribeAudio with the models handed in', () => {
  it('separates and tabs a song, every model given as bytes and a runtime', async () => {
    const [song] = songs()
    const audio = render(song)
    const read = (path) => new Uint8Array(readFileSync(path))
    const models = {
      runtime: ort,
      separator: read(separatorFile),
      beats: read(new URL('../public/beat-this/small0.onnx', import.meta.url)),
      yamnet: read(new URL('../public/yamnet/yamnet.onnx', import.meta.url)),
      basicPitch: basicPitchFromDisk(),
    }
    const wide = resampled(audio, 22050, 44100)
    const stages = new Set()
    const result = await transcribeAudio(
      { song: audio, song16k: resampled(audio, 22050, YAMNET_RATE), stereo: async () => [wide, wide] },
      {
        models,
        toMono: async ([left, right], rate) => resampled(left.map((v, i) => (v + right[i]) / 2), 44100, rate),
        anyway: true,
        title: song.name,
        onProgress: ({ stage }) => stages.add(stage),
      },
    )
    expect(result).toMatchObject({ status: 'ok', title: song.name, isolated: true })
    expect([...stages]).toEqual(['listen', 'isolate', 'notes', 'beats', 'tab'])
    const notation = await loadGuitarNotation(new TextEncoder().encode(result.musicXml).buffer, 'draft.musicxml')
    expect(notation.hasTab).toBe(true)
  }, 600000)
})
