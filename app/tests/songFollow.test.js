import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FrameAssembler } from '../src/audio/capture/frameAssembler.js'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { createWindowCollector } from '../src/tabs/guitar/song/follow/listenWindows.js'
import { matchTranscription, toSongNotes } from '../src/tabs/guitar/song/follow/matchTranscription.js'
import { judgeWindow } from '../src/tabs/guitar/song/follow/noteJudge.js'
import { createSongClock, estimateLatency, songTimeAtWall } from '../src/tabs/guitar/song/follow/songClock.js'
import { buildTimeline } from '../src/tabs/guitar/song/follow/songTimeline.js'
import { createGuitarTroubleTracker, troubleSummary } from '../src/tabs/guitar/song/follow/troubleTracker.js'
import { initialWait, isDone, waitReducer, waitSummary } from '../src/tabs/guitar/song/follow/waitState.js'
import { createPitchTracker } from '../src/tabs/vocal/audio/pitchDetector.js'

const RATE = 48000
const FRAME = 4096
const HOP = 512

const entry = (index, time, extra = {}) => ({
  index,
  time,
  duration: 0.5,
  kind: 'single',
  technique: 'pick',
  notes: [{ midi: 60 + index, string: 1, fret: index }],
  ...extra,
})

describe('trouble spots tracker', () => {
  const entries = [entry(0, 0), entry(1, 0.5), entry(2, 1.0), entry(3, 1.5, { technique: 'bend' })]
  const verdict = (v) => () => ({ verdict: v })

  it('judges each onset against the entry it belongs to and settles entries once playback passes them', () => {
    const tracker = createGuitarTroubleTracker(entries)
    expect(tracker.addOnset(0.05, verdict('hit')).entry.index).toBe(0)
    expect(tracker.addOnset(1.08, verdict('close')).entry.index).toBe(2)
    expect(tracker.collect(0.3)).toEqual([])
    const settled = tracker.collect(10)
    expect(settled.map((s) => [s.entry.index, s.verdict])).toEqual([
      [0, 'hit'],
      [1, 'miss'],
      [2, 'close'],
      [3, 'skipped'],
    ])
    expect(troubleSummary(settled.map((s) => s.verdict))).toEqual({ hit: 1, close: 1, missed: 1, scored: 3 })
  })

  it('credits an onset to the nearest start, keeps the better of two tries, and ignores stray onsets', () => {
    const tracker = createGuitarTroubleTracker(entries)
    expect(tracker.entryFor(0.3).index).toBe(1) // nearer to 0.5 than to 0
    tracker.addOnset(0.45, verdict('miss'))
    tracker.addOnset(0.55, verdict('hit'))
    expect(tracker.addOnset(5, verdict('hit'))).toBeNull()
    expect(tracker.addOnset(1.5, verdict('hit'))).toBeNull() // bends aren't scored live
    expect(tracker.collect(10)[1].verdict).toBe('hit')
  })

  it('drops earlier entries without a verdict after a seek', () => {
    const tracker = createGuitarTroubleTracker(entries)
    tracker.addOnset(1.0, verdict('hit'))
    tracker.skipTo(0.9)
    expect(tracker.collect(10).map((s) => s.entry.index)).toEqual([2, 3])
  })
})

describe('wait for me', () => {
  const entries = [entry(0, 0, { technique: 'dead' }), entry(1, 0.5), entry(2, 1), entry(3, 1.5)]
  const reduce = waitReducer(entries)
  const judged = (v) => ({ type: 'judged', result: { verdict: v } })

  it('passes over notes it cannot score and waits on the first one it can', () => {
    const state = initialWait(entries)
    expect(state.index).toBe(1)
    expect(state.results[0]).toBe('skipped')
  })

  it('moves on when the note is played, marking whether it took more than one try', () => {
    let state = initialWait(entries)
    state = reduce(state, judged('hit'))
    expect(state.index).toBe(2)
    state = reduce(state, judged('miss'))
    expect(state).toMatchObject({ index: 2, misses: 1 })
    expect(state.heard.verdict).toBe('miss')
    state = reduce(state, judged('hit'))
    expect(state.results.slice(1, 3)).toEqual(['hit', 'close'])
  })

  it('keeps waiting after any number of wrong tries; only Skip passes a note', () => {
    let state = initialWait(entries)
    for (let i = 0; i < 10; i += 1) state = reduce(state, judged(i % 2 ? 'close' : 'miss'))
    expect(state).toMatchObject({ index: 1, misses: 10 })
    expect(state.results[1]).toBeUndefined()
    expect(reduce(state, { type: 'retry' })).toMatchObject({ index: 1, misses: 0, heard: null })
    state = reduce(state, { type: 'skip' })
    expect(state).toMatchObject({ index: 2, misses: 0 })
    expect(state.results[1]).toBe('miss')
    state = reduce(state, judged('hit'))
    state = reduce(state, judged('hit'))
    expect(isDone(entries, state)).toBe(true)
    expect(waitSummary(state.results)).toEqual({ firstTry: 2, afterRetry: 0, missed: 1, scored: 3 })
    expect(reduce(state, judged('miss'))).toBe(state)
  })

  it('jumps to a note, forgetting later results', () => {
    let state = initialWait(entries)
    state = reduce(state, judged('hit'))
    state = reduce(state, judged('hit'))
    state = reduce(state, { type: 'goto', index: 2 })
    expect(state.index).toBe(2)
    expect(state.results).toEqual(['skipped', 'hit'])
    expect(reduce(state, { type: 'reset' })).toEqual(initialWait(entries))
  })
})

describe('song clock', () => {
  const tempoMap = [{ tick: 0, bpm: 120, seconds: 0 }]

  it('maps page time to song seconds from alphaTab positions, at any speed', () => {
    const clock = createSongClock(tempoMap)
    expect(clock.secondsAt(0)).toBeNull()
    clock.update({ wall: 1000, tick: 1920, speed: 1, playing: true }) // tick 1920 = 1 s at 120 bpm
    expect(clock.secondsAt(1100)).toBeCloseTo(1.1, 6)
    expect(clock.secondsAt(900)).toBeCloseTo(0.9, 6)
    expect(clock.secondsAt(5000)).toBeCloseTo(1.3, 6) // stalled audio: no runaway
    clock.update({ wall: 2000, tick: 1920, speed: 0.5, playing: true })
    expect(clock.secondsAt(2200)).toBeCloseTo(1.1, 6)
    clock.update({ wall: 3000, tick: 3840, speed: 1, playing: false })
    expect(clock.secondsAt(9999)).toBeCloseTo(2, 6)
  })

  it('places a moment of a past run between its anchors', () => {
    const anchors = [
      { wall: 1000, seconds: 0 },
      { wall: 2000, seconds: 1 },
      { wall: 3000, seconds: 2 },
    ]
    expect(songTimeAtWall(anchors, 2500)).toBeCloseTo(1.5, 6)
    expect(songTimeAtWall(anchors, 500)).toBeCloseTo(-0.5, 6)
    expect(songTimeAtWall(anchors, 3500, 0.5)).toBeCloseTo(2.25, 6)
    expect(songTimeAtWall([], 1)).toBeNull()
  })

  it('estimates latency from clicks and the onsets heard after them', () => {
    const clicks = [0, 500, 1000, 1500, 2000]
    const onsets = [120, 610, 1130, 1620, 2115, 2300]
    expect(estimateLatency(clicks, onsets)).toBe(120)
    expect(estimateLatency(clicks, [900])).toBeNull()
  })
})

describe('after-the-run check (basic-pitch transcription)', () => {
  const entries = [
    entry(0, 0, { notes: [{ midi: 64, string: 1, fret: 0 }] }),
    entry(1, 1, { kind: 'chord', notes: [40, 47, 52, 55, 59, 64].map((midi, i) => ({ midi, string: 6 - i, fret: 0 })) }),
    entry(2, 2, { technique: 'bend', notes: [{ midi: 67, string: 1, fret: 3 }] }),
    entry(3, 3, { notes: [{ midi: 62, string: 2, fret: 3 }] }),
    entry(4, 4, { technique: 'dead' }),
    entry(5, 9),
  ]

  it('places transcribed notes on the song clock', () => {
    const notes = toSongNotes(
      [{ startTimeSeconds: 1.5, durationSeconds: 0.5, pitchMidi: 64, amplitude: 0.8, pitchBends: [0, 3, 6] }],
      { anchors: [{ wall: 10000, seconds: 0 }, { wall: 20000, seconds: 10 }], recordingStartWall: 9000, latencyMs: 100 },
    )
    expect(notes[0].time).toBeCloseTo(0.4, 6)
    expect(notes[0].bendSemitones).toBe(2)
  })

  it('judges notes, chords and bends against the transcription, within the stretch the run covered', () => {
    const songNotes = [
      { time: 0.03, midi: 64, bendSemitones: 0 },
      ...[40, 47, 52, 55, 59].map((midi) => ({ time: 1.02, midi, bendSemitones: 0 })), // top string missing
      { time: 2.01, midi: 67, bendSemitones: 0.2 }, // bend not pushed up
      { time: 3.05, midi: 63, bendSemitones: 0 }, // a semitone sharp
    ]
    const verdicts = matchTranscription(entries, songNotes, { from: 0, to: 5 })
    expect(verdicts.slice(0, 5)).toEqual(['hit', 'hit', 'close', 'close', 'skipped'])
    expect(verdicts[5]).toBeUndefined()
    expect(matchTranscription(entries, [], { from: 0, to: 0.5 })[0]).toBe('miss')
  })
})

// ── End to end: synthesize a built-in song from its own timeline, listen, score ──

const songBytes = (file) => {
  const buffer = readFileSync(new URL(`../public/guitar-songs/${file}`, import.meta.url))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

function pluckInto(out, midi, start, { amp, decay, until = Infinity }) {
  const f0 = 440 * 2 ** ((midi - 69) / 12)
  const offset = Math.round(start * RATE)
  const partials = [
    [1, 1],
    [2, 0.6],
    [3, 0.4],
    [4, 0.3],
    [5, 0.25],
  ]
  const stop = Math.round((until - start) * RATE)
  for (let i = 0; offset + i < out.length && i < stop; i += 1) {
    const t = i / RATE
    // A re-picked string restarts: the old note dies within 5 ms instead of summing with the new one.
    const cut = Math.min(1, (stop - i) / (0.005 * RATE))
    const envelope = amp * Math.exp(-decay * t) * cut
    if (envelope < 1e-4) break
    let sample = 0
    for (const [k, weight] of partials) sample += weight * Math.sin(2 * Math.PI * f0 * k * t)
    out[offset + i] += envelope * sample
  }
}

/** Play `entries` (or other notes in their place) into a buffer with a lead-in. */
function perform(entries, { lead = 0.3, decay = 2, play = (e) => e.notes.map((n) => n.midi) } = {}) {
  const end = entries[entries.length - 1].time + 1.2
  const out = new Float32Array(Math.round((lead + end) * RATE))
  const plucks = entries.flatMap((e) => {
    const midis = play(e)
    return midis.map((midi, i) => ({ midi, start: lead + e.time + i * 0.008, amp: 0.3 / Math.sqrt(midis.length) }))
  })
  plucks.forEach((p, i) => {
    const next = plucks.slice(i + 1).find((q) => q.midi === p.midi)
    pluckInto(out, p.midi, p.start, { amp: p.amp, decay, until: next ? next.start : Infinity })
  })
  return out
}

/** Listen through the real framing, pitch tracker and windows, judging each onset with the trouble tracker. */
function score(entries, signal, lead = 0.3) {
  const assembler = new FrameAssembler({ frameSize: FRAME, hop: HOP })
  const pitch = createPitchTracker({ bufferSize: FRAME, minRms: 0.005, maxFrequency: 1400 })
  const tracker = createGuitarTroubleTracker(entries)
  const collector = createWindowCollector({
    sampleRate: RATE,
    frameSize: FRAME,
    onWindow: (w) => tracker.addOnset(w.onset / RATE - lead, (e) => judgeWindow({ ...w, sampleRate: RATE }, e)),
  })
  for (let start = 0; start < signal.length; start += 128) {
    for (const event of assembler.push(signal.subarray(start, start + 128))) {
      if (event.type === 'onset') collector.onset(event.position)
      else collector.frame({ samples: event.samples, position: event.position, level: event.level, midi: pitch.analyze(event.samples, RATE)?.midi ?? null })
    }
  }
  return tracker.collect(Infinity).map((s) => s.verdict)
}

describe('end to end', () => {
  it('Four-Chord Strum: strummed right, every chord is a hit; the wrong chords are not', async () => {
    const { score: song } = await loadGuitarNotation(songBytes('four-chord-strum.musicxml'), 'four-chord-strum.musicxml')
    const entries = buildTimeline(song).entries.slice(0, 8) // Em ×4, C ×4
    expect(score(entries, perform(entries))).toEqual(Array(8).fill('hit'))
    const wrong = perform(entries, { play: () => [50, 57, 62, 66] }) // D major throughout
    expect(score(entries, wrong).filter((v) => v === 'hit')).toHaveLength(0)
  })

  it('House of the Rising Sun: an arpeggio over ringing strings scores most notes as hits', async () => {
    const { score: song } = await loadGuitarNotation(songBytes('house-of-the-rising-sun.musicxml'), 'house-of-the-rising-sun.musicxml')
    const timeline = buildTimeline(song)
    const entries = timeline.entries.slice(0, 12) // Am, C
    const verdicts = score(entries, perform(entries, { decay: 1 }))
    expect(verdicts.filter((v) => v === 'hit').length).toBeGreaterThanOrEqual(10)
    expect(verdicts).not.toContain('miss')
  })
})
