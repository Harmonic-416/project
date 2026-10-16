import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as ort from 'onnxruntime-web'
import { describe, expect, it } from 'vitest'
import { TRANSCRIBE, transcribeAudio } from '../src/tabs/guitar/song/follow/refineWithBasicPitch.js'
import { dropBleed } from '../src/tabs/guitar/song/transcribe/bleed.js'
import { HOP_SECONDS, frameLevels, guitarFrames, screenRecording, yamnetScores } from '../src/tabs/guitar/song/transcribe/guitarPresence.js'
import { separateGuitar } from '../src/tabs/guitar/song/transcribe/separate.js'
import { band, resampleTo } from './bandSongs.js'
import { basicPitchFromDisk, f1 } from './transcribeSongs.js'

/**
 * The guitar-isolation benchmark: a synthetic band (bandSongs.js) through
 * the real chain — YAMNet listening for a guitar, htdemucs_6s pulling it
 * out, YAMNet and levels finding where it plays, Basic Pitch on it, the
 * bleed filter — once with a strumming guitar (its notes found, against
 * the strums) and once with a synth pad instead (no guitar part).
 *
 * Slow (the separator and Basic Pitch on the CPU) and it downloads the
 * separator's model (55 MB), so off by default:
 *   TRANSCRIBE_BENCH=1 TRANSCRIBE_BENCH_CACHE=<folder> npx vitest run tests/guitarBandBenchmark.test.js
 */

const SEPARATOR = 'https://huggingface.co/Andremi/audioweb-models/resolve/953d0a9e46fd364860c9413ee4c7a9aa4fbcae4b/demucs_htdemucs_6s_s78_fp16w_ca.onnx'

async function separatorModel() {
  const cache = process.env.TRANSCRIBE_BENCH_CACHE
  const file = cache && join(cache, 'htdemucs_6s_s78_fp16w_ca.onnx')
  if (file && existsSync(file)) return new Uint8Array(readFileSync(file))
  const bytes = new Uint8Array(await (await fetch(SEPARATOR)).arrayBuffer())
  if (file) {
    mkdirSync(cache, { recursive: true })
    writeFileSync(file, bytes)
  }
  return bytes
}

/** The pipeline's listening and isolating steps (pipeline.js), in Node. */
async function guitarOf(samples, models) {
  const song16k = resampleTo(samples, 16000)
  const song = resampleTo(samples, 22050)
  const screen = screenRecording(await yamnetScores(song16k, { model: models.yamnet, runtime: ort }))
  const stereo = resampleTo(samples, 44100)
  const [left, right] = await separateGuitar([stereo, stereo], { model: models.separator, runtime: ort })
  const mono = left.map((v, i) => (v + right[i]) / 2)
  const stem16k = resampleTo48(mono, 44100, 16000)
  const stem = resampleTo48(mono, 44100, 22050)
  const stemYamnet = await yamnetScores(stem16k, { model: models.yamnet, runtime: ort })
  const frames = Math.min(stemYamnet.frames, Math.floor(song16k.length / (HOP_SECONDS * 16000)) + 1)
  const found = guitarFrames({ stemYamnet, stemLevels: frameLevels(stem16k, frames), songLevels: frameLevels(song16k, frames) })
  return { screen, found, stem, song }
}

/** Linear resampling between any two rates. */
function resampleTo48(signal, from, to) {
  const out = new Float32Array(Math.floor((signal.length * to) / from))
  for (let i = 0; i < out.length; i += 1) {
    const at = (i * from) / to
    const j = Math.floor(at)
    out[i] = signal[j] + ((signal[Math.min(j + 1, signal.length - 1)] ?? 0) - signal[j]) * (at - j)
  }
  return out
}

describe.skipIf(!process.env.TRANSCRIBE_BENCH)('guitar isolation benchmark (a synthetic band)', () => {
  const yamnet = new Uint8Array(readFileSync(new URL('../public/yamnet/yamnet.onnx', import.meta.url)))

  it('finds the strumming guitar in a band, and its notes', async () => {
    const models = { yamnet, separator: await separatorModel() }
    const { samples, strums } = band({ guitar: true })
    const { screen, found, stem, song } = await guitarOf(samples, models)
    const { notes } = await transcribeAudio(stem, { thresholds: TRANSCRIBE, basicPitch: basicPitchFromDisk() })
    const playing = (s) => Boolean(found.active[Math.floor(s / HOP_SECONDS)] || found.active[Math.floor(s / HOP_SECONDS) - 1])
    const kept = dropBleed(notes.filter((n) => playing(n.startTimeSeconds)), stem, song)
    const score = f1(strums, kept, (t, f) => t.midi === f.pitchMidi && Math.abs(t.time - f.startTimeSeconds) <= 0.05)
    console.log(
      `band with guitar: screen ${screen.kind} (guitar ${screen.guitar.toFixed(2)}, voice ${screen.voice.toFixed(2)}, drums ${screen.drums.toFixed(2)})` +
        ` | guitar in ${(found.presence * 100).toFixed(0)}% | notes ${notes.length} → ${kept.length} kept, F1 ${score.toFixed(2)} (${strums.length} played)`,
    )
    expect(found.enough).toBe(true)
  }, 900000)

  it('says there’s no guitar part when a synth plays the chords', async () => {
    const models = { yamnet, separator: await separatorModel() }
    const { samples } = band({ guitar: false })
    const { screen, found } = await guitarOf(samples, models)
    console.log(`band without guitar: screen ${screen.kind} (guitar ${screen.guitar.toFixed(2)}) | guitar in ${(found.presence * 100).toFixed(0)}%`)
    expect(screen.kind === 'none' || !found.enough).toBe(true)
  }, 900000)
})
