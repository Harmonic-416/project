import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as ort from 'onnxruntime-web'
import { describe, expect, it } from 'vitest'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { TRANSCRIBE, evaluateAudio, frameTime, notesFrom } from '../src/tabs/guitar/song/follow/refineWithBasicPitch.js'
import { trackBeats } from '../src/tabs/guitar/song/transcribe/beats.js'
import { draftScore } from '../src/tabs/guitar/song/transcribe/pipeline.js'
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
