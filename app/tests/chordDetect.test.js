import { describe, expect, it } from 'vitest'
import { FrameAssembler } from '../src/audio/capture/frameAssembler.js'
import { CHORDS, chordMidi } from '../src/tabs/guitar/practice/chords.js'
import { chromaFromFrame, createChordListener, fft, matchChord } from '../src/tabs/guitar/practice/chordDetect.js'

const RATE = 48000
const FRAME = 8192
const HOP = 1024
const BLOCK = 128 // AudioWorklet render quantum

const chord = (id) => CHORDS.find((c) => c.id === id)
const midiToFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12)

/** A strum: every note of the chord as a decaying string with a few overtones. */
function strum(id, seconds = 1) {
  const notes = chordMidi(chord(id))
  const out = new Float32Array(Math.round(seconds * RATE))
  for (const midi of notes) {
    const frequency = midiToFrequency(midi)
    for (const [harmonic, weight] of [
      [1, 1],
      [2, 0.6],
      [3, 0.4],
      [4, 0.3],
      [5, 0.25],
    ]) {
      for (let i = 0; i < out.length; i += 1) {
        const t = i / RATE
        out[i] += (0.3 / notes.length) * weight * Math.exp(-2 * t) * Math.sin(2 * Math.PI * frequency * harmonic * t)
      }
    }
  }
  return out
}

const quiet = (seconds) => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => 0.001 * Math.sin(i / 3))
const zeros = (seconds) => new Float32Array(Math.round(seconds * RATE))

function concat(...parts) {
  const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Run `signal` through the capture framing into a listener expecting `id`; collect verdicts. */
function listen(id, signal, setup) {
  const verdicts = []
  const assembler = new FrameAssembler({ frameSize: FRAME, hop: HOP })
  const listener = createChordListener({ sampleRate: RATE, chord: chord(id), onVerdict: (v) => verdicts.push(v) })
  setup?.(listener)
  for (let i = 0; i < signal.length; i += BLOCK) {
    for (const event of assembler.push(signal.subarray(i, i + BLOCK))) {
      if (event.type === 'onset') listener.onset(event.position)
      else listener.frame(event)
    }
  }
  return verdicts
}

const frameOf = (id) => chromaFromFrame(strum(id).subarray(4800, 4800 + FRAME), RATE)
const topBins = (chroma, count) =>
  [...chroma.keys()]
    .sort((a, b) => chroma[b] - chroma[a])
    .slice(0, count)
    .sort((a, b) => a - b)

describe('fft', () => {
  it('puts a pure tone in its bin', () => {
    const n = 1024
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 37 * i) / n))
    const im = new Float64Array(n)
    fft(re, im)
    expect(Math.hypot(re[37], im[37])).toBeCloseTo(n / 2, 6)
    expect(Math.hypot(re[36], im[36])).toBeLessThan(1e-6)
  })

  it('rejects sizes that are not a power of two', () => {
    expect(() => fft(new Float64Array(1000), new Float64Array(1000))).toThrow()
  })
})

describe('chord chroma', () => {
  it('finds E, G and B in an E minor strum', () => {
    expect(topBins(frameOf('Em'), 3)).toEqual([4, 7, 11]) // E, G, B
  })

  it('is all zeros for silence', () => {
    expect([...chromaFromFrame(new Float32Array(FRAME), RATE)]).toEqual(Array(12).fill(0))
  })
})

describe('matchChord (verification, F16)', () => {
  it.each(CHORDS.map((c) => c.id))('verifies %s against itself', (id) => {
    expect(matchChord(frameOf(id), chord(id))).toBe('verified')
  })

  it('calls another chord wrong', () => {
    expect(matchChord(frameOf('Em'), chord('C'))).toBe('wrong')
    expect(matchChord(frameOf('G'), chord('D'))).toBe('wrong')
  })

  it('tells E major from E minor (one note apart)', () => {
    expect(matchChord(frameOf('E'), chord('Em'))).toBe('wrong')
    expect(matchChord(frameOf('Em'), chord('E'))).toBe('wrong')
  })
})

describe('chord listener', () => {
  it('reports the right chord once per strum', () => {
    expect(listen('Em', concat(quiet(0.5), strum('Em')))).toEqual(['verified'])
    expect(listen('Em', concat(quiet(0.5), strum('Em', 1.2), strum('Em')))).toEqual(['verified', 'verified'])
  })

  it('reports a different chord as wrong', () => {
    expect(listen('Em', concat(quiet(0.5), strum('G')))).toEqual(['wrong'])
  })

  it('reports silence once, and again only after sound (F21)', () => {
    expect(listen('Em', zeros(6))).toEqual(['silent'])
    expect(listen('Em', concat(zeros(3), strum('Em'), zeros(3)))).toEqual(['silent', 'verified', 'silent'])
  })

  it('ignores strums while muted (the Hint playing)', () => {
    expect(listen('Em', concat(quiet(0.5), strum('Em')), (l) => l.muteUntil(RATE * 2))).toEqual([])
  })
})
