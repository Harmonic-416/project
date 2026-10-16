import { readFileSync } from 'node:fs'
import * as ort from 'onnxruntime-web'
import { describe, expect, it } from 'vitest'
import {
  BORDER,
  CHUNK,
  N_MELS,
  SAMPLE_RATE,
  aggregatePrediction,
  barsOf,
  beatsFromLogits,
  fillBeatGaps,
  logMelSpectrogram,
  melFilterbank,
  pickPeaks,
  splitPiece,
  trackBeats,
} from '../src/tabs/guitar/song/transcribe/beats.js'
import { RATE, renderGuitar, strum, withRoomNoise } from './guitarSignals.js'

/** A signal at RATE resampled to the model's 22050 Hz (linear; plenty for beat tracking). */
function to22050(signal) {
  const out = new Float32Array(Math.floor((signal.length * SAMPLE_RATE) / RATE))
  for (let i = 0; i < out.length; i += 1) {
    const at = (i * RATE) / SAMPLE_RATE
    const j = Math.floor(at)
    out[i] = signal[j] + (signal[Math.min(j + 1, signal.length - 1)] - signal[j]) * (at - j)
  }
  return out
}

/**
 * The deterministic drum-and-chord test signal, sines only, built exactly as
 * tests/fixtures/beat-this/export_beat_this.py builds it for the reference
 * fixtures: kick and snare alternating on the beats at 120 BPM from 0.5 s,
 * hi-hat on the eighths, a quiet held chord; 31 s at 22050 Hz.
 */
function testSignal(seconds = 31, bpm = 120) {
  const n = Math.floor(seconds * SAMPLE_RATE)
  const out = new Float64Array(n)
  const beat = 60 / bpm
  const add = (start, f) => {
    for (let k = Math.max(0, Math.ceil(start * SAMPLE_RATE)); k < n; k += 1) out[k] += f(k / SAMPLE_RATE - start)
  }
  const partials = (freqs, x) => freqs.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * x), 0) / freqs.length
  for (let i = 0; 0.5 + i * beat < seconds - 0.5; i += 1) {
    const start = 0.5 + i * beat
    if (i % 2 === 0) add(start, (x) => 0.8 * Math.exp(-x / 0.12) * Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-x / 0.03)) * x))
    else add(start, (x) => 0.5 * Math.exp(-x / 0.08) * partials([190, 330, 1150, 2730, 4100], x))
    for (const half of [0, 0.5]) add(start + half * beat, (x) => 0.15 * Math.exp(-x / 0.02) * partials([6000, 7350, 8300, 9100], x))
  }
  for (let k = 0; k < n; k += 1) out[k] += 0.05 * partials([110, 164.81, 220], k / SAMPLE_RATE) * 3
  return Float32Array.from(out)
}

const SHAPES = {
  Em: { 6: 0, 5: 2, 4: 2, 3: 0, 2: 0, 1: 0 },
  C: { 5: 3, 4: 2, 3: 0, 2: 1, 1: 0 },
  G: { 6: 3, 5: 2, 4: 0, 3: 0, 2: 0, 1: 3 },
  D: { 4: 0, 3: 2, 2: 3, 1: 2 },
}

/** Em C G D, a chord a bar, strummed on every beat (the bar's first a little harder) at `bpm`, starting at `offset` seconds. */
function strummedSong(bpm, bars, { offset = 0.5, beatsPerBar = 4 } = {}) {
  const beat = 60 / bpm
  const order = ['Em', 'C', 'G', 'D']
  const events = []
  for (let bar = 0; bar < bars; bar += 1) {
    for (let b = 0; b < beatsPerBar; b += 1) {
      events.push(...strum(offset + (bar * beatsPerBar + b) * beat, SHAPES[order[bar % 4]], { amp: b === 0 ? 0.45 : 0.3, seed: bar * 8 + b }))
    }
  }
  const seconds = offset + bars * beatsPerBar * beat + 1
  return { audio: to22050(withRoomNoise(renderGuitar(seconds, events))), beat, offset }
}

describe('the model’s input (LogMelSpect)', () => {
  it('builds the same mel filterbank as torchaudio', () => {
    const buffer = readFileSync(new URL('../../tests/fixtures/beat-this/mel-filterbank.bin', import.meta.url))
    const reference = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
    const ours = melFilterbank()
    expect(ours.length).toBe(reference.length)
    let worst = 0
    for (let i = 0; i < ours.length; i += 1) worst = Math.max(worst, Math.abs(ours[i] - reference[i]))
    expect(worst).toBeLessThan(5e-5) // float32 rounding
  })

  it('computes the same log-mel spectrogram as the reference (LogMelSpect)', () => {
    const buffer = readFileSync(new URL('../../tests/fixtures/beat-this/test-signal-logmel-8s.bin', import.meta.url))
    const reference = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
    const { data } = logMelSpectrogram(testSignal())
    let worst = 0
    for (let i = 0; i < reference.length; i += 1) worst = Math.max(worst, Math.abs(data[i] - reference[i]))
    expect(worst).toBeLessThan(2e-3) // log-mel values run 0 … ~9
  }, 30000) // an 8 s signal through a JavaScript FFT: seconds on a busy machine

  it('gives one frame every 441 samples (50 a second), 128 values each', () => {
    const { frames, data } = logMelSpectrogram(new Float32Array(SAMPLE_RATE))
    expect(frames).toBe(1 + Math.floor(SAMPLE_RATE / 441))
    expect(data.length).toBe(frames * N_MELS)
    expect(data.every((v) => v === 0)).toBe(true) // silence: log1p(0)
  })

  it('puts a tone’s energy in the mel band of its pitch', () => {
    const tone = Float32Array.from({ length: SAMPLE_RATE }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE))
    const { data } = logMelSpectrogram(tone)
    const frame = data.subarray(25 * N_MELS, 26 * N_MELS)
    const loudest = frame.indexOf(Math.max(...frame))
    // 440 Hz sits where the bank's triangle for that band peaks
    const bank = melFilterbank()
    const bin = Math.round((440 * 1024) / SAMPLE_RATE)
    let expected = 0
    for (let m = 1; m < N_MELS; m += 1) if (bank[bin * N_MELS + m] > bank[bin * N_MELS + expected]) expected = m
    expect(Math.abs(loudest - expected)).toBeLessThanOrEqual(1)
  })
})

describe('chunking (split_piece and aggregate_prediction)', () => {
  it.each([100, CHUNK - 2 * BORDER, CHUNK - 2 * BORDER + 1, CHUNK, CHUNK + 1, 4321, 9000])(
    '%i frames: every frame predicted once, by the earliest window that covers it',
    (frames) => {
      const windows = splitPiece(frames)
      // Each window "predicts" the global frame number of each of its frames (padding included).
      const predictions = windows.map((w) => {
        const length = w.left + (w.to - w.from) + w.right
        return Float32Array.from({ length }, (_, j) => w.start + j)
      })
      const piece = aggregatePrediction(windows, predictions, frames)
      expect(Array.from(piece)).toEqual(Array.from({ length: frames }, (_, f) => f))
      for (const w of windows) expect(w.left + (w.to - w.from) + w.right).toBeLessThanOrEqual(CHUNK)
    },
  )

  it('pads the first window by the border and ends the last with the piece', () => {
    const windows = splitPiece(4000)
    expect(windows[0]).toMatchObject({ start: -BORDER, from: 0, left: BORDER })
    expect(windows.at(-1)).toMatchObject({ to: 4000, right: BORDER })
  })
})

describe('peaks (postprocessing "minimal")', () => {
  it('keeps maxima within ±3 frames whose logit is above 0', () => {
    const logits = new Float32Array(30).fill(-5)
    logits[5] = 2
    logits[7] = 1 // within 3 frames of a higher peak
    logits[15] = -0.5 // below threshold
    logits[22] = 0.5
    expect(pickPeaks(logits)).toEqual([5, 22])
  })

  it('merges peaks a frame apart into their mean', () => {
    const logits = new Float32Array(20).fill(-5)
    logits[10] = 1
    logits[11] = 1
    expect(pickPeaks(logits)).toEqual([10.5])
  })

  it('moves each downbeat onto its nearest beat', () => {
    const beat = new Float32Array(200).fill(-5)
    const down = new Float32Array(200).fill(-5)
    for (const f of [10, 35, 60, 85, 110, 135]) beat[f] = 3
    down[12] = 2 // near the beat at frame 10
    down[108] = 2 // near frame 110
    expect(beatsFromLogits(beat, down)).toEqual({ beats: [0.2, 0.7, 1.2, 1.7, 2.2, 2.7], downbeats: [0.2, 2.2] })
  })
})

describe('bars', () => {
  it('counts beats per bar from the downbeats', () => {
    const beats = Array.from({ length: 24 }, (_, i) => i * 0.5)
    expect(barsOf(beats, [1, 3, 5, 7, 9].map((t) => t))).toEqual({ beatsPerBar: 4, firstDownbeat: 2 })
    expect(barsOf(beats, [0, 1.5, 3, 4.5, 6])).toEqual({ beatsPerBar: 3, firstDownbeat: 0 })
    expect(barsOf(beats, [])).toEqual({ beatsPerBar: 4, firstDownbeat: 0 })
  })
  it('puts back beats the model skipped, so later bars don’t slip', () => {
    const beats = [0.5, 1.1, 1.7, 2.3, 2.9, 3.5, 4.1, 5.3, 5.9, 6.5, 7.1, 7.7, 9.5, 10.1] // 4.7, then 8.3 and 8.9, missing
    const filled = fillBeatGaps(beats)
    expect(filled.map((b) => +b.toFixed(2))).toEqual([0.5, 1.1, 1.7, 2.3, 2.9, 3.5, 4.1, 4.7, 5.3, 5.9, 6.5, 7.1, 7.7, 8.3, 8.9, 9.5, 10.1])
    // A gap that isn't a whole number of beats (a fermata, a tempo change) is left alone.
    expect(fillBeatGaps([0, 0.5, 1, 1.5, 2.3, 2.8])).toEqual([0, 0.5, 1, 1.5, 2.3, 2.8])
  })
})

describe('Beat This! (the exported small0)', () => {
  const model = new Uint8Array(readFileSync(new URL('../public/beat-this/small0.onnx', import.meta.url)))

  it('finds the reference’s beats and downbeats on the test signal', async () => {
    const reference = JSON.parse(readFileSync(new URL('../../tests/fixtures/beat-this/test-signal-beats.json', import.meta.url), 'utf8'))
    const { beats, downbeats } = await trackBeats(testSignal(), { model, runtime: ort })
    const near = (list, t) => list.some((b) => Math.abs(b - t) <= 0.021) // within a frame
    expect(beats.length).toBe(reference.beats.length)
    expect(reference.beats.every((t) => near(beats, t))).toBe(true)
    expect(downbeats.length).toBe(reference.downbeats.length)
    expect(reference.downbeats.every((t) => near(downbeats, t))).toBe(true)
  }, 120000)

  it('finds the strums’ beats at 100 BPM, and the bars', async () => {
    const { audio, beat, offset } = strummedSong(100, 6)
    const { beats, beatsPerBar } = await trackBeats(audio, { model, runtime: ort })
    const expected = Array.from({ length: 24 }, (_, i) => offset + i * beat)
    const found = expected.filter((t) => beats.some((b) => Math.abs(b - t) < 0.07))
    expect(found.length / expected.length).toBeGreaterThan(0.9)
    expect(beatsPerBar).toBe(4)
  }, 60000)

  it('finds them across a long piece (several model windows)', async () => {
    const { audio, beat, offset } = strummedSong(120, 20) // 40 s: two windows
    const { beats } = await trackBeats(audio, { model, runtime: ort })
    const expected = Array.from({ length: 80 }, (_, i) => offset + i * beat)
    const found = expected.filter((t) => beats.some((b) => Math.abs(b - t) < 0.07))
    expect(found.length / expected.length).toBeGreaterThan(0.9)
  }, 120000)
})
