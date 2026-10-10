import { describe, expect, it } from 'vitest'
import { FrameAssembler } from '../src/audio/capture/frameAssembler.js'
import { createPitchTracker } from '../src/tabs/vocal/audio/pitchDetector.js'
import { createWindowCollector } from '../src/tabs/guitar/song/follow/listenWindows.js'
import { EVERY_STRING, averageSpectrum, betterVerdict, judgeWindow, noteEvidence, spectralPeaks } from '../src/tabs/guitar/song/follow/noteJudge.js'
import { withRoomNoise } from './guitarSignals.js'

const RATE = 48000
const FRAME = 4096
const HOP = 512
const BLOCK = 128 // AudioWorklet render quantum
const PARTIALS = [
  [1, 1],
  [2, 0.6],
  [3, 0.4],
  [4, 0.3],
  [5, 0.25],
]

const midiToFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12)

/**
 * A plucked string: decaying partials. `path` is [[seconds, midi], …] for a
 * string whose pitch changes without a new pick (hammer-on, slide).
 */
function pluck(path, seconds, { amp = 0.3, decay = 2.5 } = {}) {
  const steps = Array.isArray(path) ? path : [[0, path]]
  const out = new Float32Array(Math.round(seconds * RATE))
  const phase = PARTIALS.map(() => 0)
  let step = 0
  for (let i = 0; i < out.length; i += 1) {
    const t = i / RATE
    while (step + 1 < steps.length && t >= steps[step + 1][0]) step += 1
    const f0 = midiToFrequency(steps[step][1])
    // A 30 ms fade at the end: real strings never stop dead, and a hard cut sprays every frequency.
    const fade = Math.min(1, (out.length - i) / (0.03 * RATE))
    const envelope = amp * Math.exp(-decay * t) * fade
    let sample = 0
    PARTIALS.forEach(([k, weight], p) => {
      phase[p] += (2 * Math.PI * f0 * k) / RATE
      sample += weight * Math.sin(phase[p])
    })
    out[i] = envelope * sample
  }
  return out
}

/** Place signals at start times (seconds) in one buffer, overlapping as real strings ring on. */
function place(total, ...parts) {
  const out = new Float32Array(Math.round(total * RATE))
  for (const [signal, start] of parts) {
    const offset = Math.round(start * RATE)
    for (let i = 0; i < signal.length && offset + i < out.length; i += 1) out[offset + i] += signal[i]
  }
  return out
}

const strum = (midis, seconds = 1) =>
  place(seconds, ...midis.map((midi, i) => [pluck(midi, seconds, { amp: 0.3 / Math.sqrt(midis.length) }), i * 0.008]))

const single = (midi) => ({ kind: 'single', technique: 'pick', notes: [{ midi, string: 1, fret: 0 }] })
const chord = (midis) => ({
  kind: 'chord',
  technique: 'pick',
  notes: midis.map((midi, i) => ({ midi, string: midis.length - i, fret: 0 })),
})

/** Run audio through the real capture framing, pitch tracker and window collector. */
function listen(signal) {
  const assembler = new FrameAssembler({ frameSize: FRAME, hop: HOP })
  const tracker = createPitchTracker({ bufferSize: FRAME, minRms: 0.005, maxFrequency: 1400 })
  const windows = []
  const collector = createWindowCollector({ sampleRate: RATE, frameSize: FRAME, onWindow: (w) => windows.push(w) })
  for (let start = 0; start < signal.length; start += BLOCK) {
    for (const event of assembler.push(signal.subarray(start, start + BLOCK))) {
      if (event.type === 'onset') collector.onset(event.position)
      else collector.frame({ samples: event.samples, position: event.position, level: event.level, midi: tracker.analyze(event.samples, RATE)?.midi ?? null })
    }
  }
  return windows
}

const judge = (window, entry) => judgeWindow({ ...window, sampleRate: RATE }, entry).verdict

const E_MINOR = [40, 47, 52, 55, 59, 64]
const D_MAJOR = [50, 57, 62, 66]
const G_MAJOR = [43, 47, 50, 55, 59, 67]

describe('listening windows', () => {
  it('opens one window per pick, near the pick', () => {
    const windows = listen(place(2.4, [pluck(64, 0.8), 0.2], [pluck(67, 0.8), 1.0], [pluck(60, 0.8), 1.6]))
    expect(windows).toHaveLength(3)
    windows.forEach((w, i) => {
      expect(w.source).toBe('energy')
      expect(Math.abs(w.onset / RATE - [0.2, 1.0, 1.6][i])).toBeLessThan(0.03)
      expect(w.frames.length).toBeGreaterThan(5)
      expect(w.before).not.toBeNull()
    })
  })

  it('opens a window for a hammer-on, which has no pick', () => {
    const windows = listen(place(1.4, [pluck([[0, 67], [0.5, 69]], 1.2, { decay: 1 }), 0.2]))
    expect(windows).toHaveLength(2)
    expect(windows[0].source).toBe('energy')
    expect(windows[1].source).not.toBe('energy')
    expect(Math.abs(windows[1].onset / RATE - 0.7)).toBeLessThan(0.06)
    expect(judge(windows[1], { ...single(69), technique: 'legato' })).toBe('hit')
  })

  it('hands on the levels, an earlier reference, the room floor and why each window closed', () => {
    // E4, then C4 150 ms later while E4 still rings, over quiet room noise (RMS 0.001).
    const windows = listen(withRoomNoise(place(1.6, [pluck(64, 1.4, { decay: 1 }), 0.5], [pluck(60, 1.0, { decay: 1 }), 0.65]), 0.001))
    expect(windows).toHaveLength(2)
    expect(windows[0]).toMatchObject({ closedBy: 'onset', closedAt: windows[1].onset })
    expect(windows[1].closedBy).toBe('span')
    for (const w of windows) {
      expect(w.levels.length).toBeGreaterThan(3)
      expect(w.levels.every((l, i) => l.position > w.onset && (i === 0 || l.position > w.levels[i - 1].position))).toBe(true)
      expect(w.floor).toBeGreaterThan(0.0005)
      expect(w.floor).toBeLessThan(0.0015)
    }
    // The reference predates the C4 pick; the frame right before the onset may already hear it.
    const evidence = (spectrum) => noteEvidence(spectralPeaks(spectrum, RATE), 60)
    expect(windows[1].referenceSpectrum).not.toBe(windows[1].beforeSpectrum)
    expect(evidence(windows[1].referenceSpectrum)).toBeLessThan(evidence(averageSpectrum(windows[1].spectra)))
  })
})

describe('judging single notes', () => {
  const [window] = listen(place(1, [pluck(64, 0.8), 0.1]))

  it('hears the right note', () => {
    expect(judge(window, single(64))).toBe('hit')
  })

  it('calls a semitone off or the wrong octave close, and another note a miss', () => {
    expect(judge(window, single(65))).toBe('close')
    expect(judge(window, single(52))).toBe('close')
    expect(judge(window, single(59))).toBe('miss')
    expect(judge(window, single(70))).toBe('miss')
  })

  it('hears the new note of an arpeggio over the strings still ringing', () => {
    // A2, then A3 and C4 while the earlier strings ring on (House of the Rising Sun's opening).
    const windows = listen(place(1.6, [pluck(45, 1.4, { decay: 1 }), 0.2], [pluck(57, 1.0, { decay: 1 }), 0.6], [pluck(60, 0.6, { decay: 1 }), 1.0]))
    expect(windows).toHaveLength(3)
    expect(judge(windows[0], single(45))).toBe('hit')
    expect(judge(windows[1], single(57))).toBe('hit')
    expect(judge(windows[2], single(60))).toBe('hit')
    expect(judge(windows[2], single(64))).not.toBe('hit')
  })

  it("doesn't score techniques it can't hear yet", () => {
    expect(judge(window, { ...single(64), technique: 'bend' })).toBe('skipped')
  })
})

describe('judging chords', () => {
  it('hears a full strum, string by string', () => {
    const [window] = listen(place(1.2, [strum(E_MINOR), 0.1]))
    const result = judgeWindow({ ...window, sampleRate: RATE }, chord(E_MINOR))
    expect(result.verdict).toBe('hit')
    expect(Object.values(result.strings)).toEqual(['good', 'good', 'good', 'good', 'good', 'good'])
  })

  it('marks the strings that did not sound and calls a half-played chord close', () => {
    // D major with A3 and F#4 missing. (A string whose octave partner sounds can't be
    // told apart from that partner's overtones — see noteJudge.js — so test strings without one.)
    const [window] = listen(place(1.2, [strum([50, 62]), 0.1]))
    const result = judgeWindow({ ...window, sampleRate: RATE }, chord(D_MAJOR))
    expect(result.verdict).toBe('close')
    expect(result.strings).toEqual({ 4: 'good', 3: 'bad', 2: 'good', 1: 'bad' })
  })

  it('never calls a different chord a hit', () => {
    const [d] = listen(place(1.2, [strum(D_MAJOR), 0.1]))
    expect(judge(d, chord(E_MINOR))).toBe('miss')
    const [g] = listen(place(1.2, [strum(G_MAJOR), 0.1]))
    expect(judge(g, chord(E_MINOR))).not.toBe('hit')
  })
})

describe('judging chords on every string (Wait for me)', () => {
  const E_MAJOR = [40, 47, 52, 56, 59, 64]
  const A_MINOR = [45, 52, 57, 60, 64]
  const C_MAJOR = [48, 52, 55, 60, 64]
  const strictly = (window, midis) => judgeWindow({ ...window, sampleRate: RATE }, chord(midis), EVERY_STRING)

  it('still hears a full strum of each chord', () => {
    for (const midis of [E_MINOR, D_MAJOR, G_MAJOR, E_MAJOR, A_MINOR, C_MAJOR]) {
      const [window] = listen(place(1.2, [strum(midis), 0.1]))
      expect(strictly(window, midis).verdict).toBe('hit')
    }
  })

  it('does not take a chord one note off for the expected one, and shows which string', () => {
    // E major and E minor differ only on the G string (G#3 vs G3).
    const [e] = listen(place(1.2, [strum(E_MAJOR), 0.1]))
    const result = strictly(e, E_MINOR)
    expect(result.verdict).toBe('close')
    expect(result.strings[3]).toBe('bad')
    const [em] = listen(place(1.2, [strum(E_MINOR), 0.1]))
    expect(strictly(em, E_MAJOR).verdict).not.toBe('hit')
    const [am] = listen(place(1.2, [strum(A_MINOR), 0.1]))
    expect(strictly(am, C_MAJOR).verdict).not.toBe('hit')
  })
})

describe('evidence and verdict helpers', () => {
  it('measures how strongly a note sounds', () => {
    const [window] = listen(place(1, [pluck(64, 0.8), 0.1]))
    const peaks = spectralPeaks(averageSpectrum(window.spectra), RATE)
    expect(noteEvidence(peaks, 64)).toBeGreaterThan(0.5)
    expect(noteEvidence(peaks, 70)).toBeLessThan(0.1)
  })

  it('keeps the better of two verdicts', () => {
    expect(betterVerdict(null, 'miss')).toBe('miss')
    expect(betterVerdict('close', 'miss')).toBe('close')
    expect(betterVerdict('close', 'hit')).toBe('hit')
  })
})
