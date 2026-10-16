import { readFileSync } from 'node:fs'
import { BasicPitch } from '@spotify/basic-pitch'
import * as tf from '@tensorflow/tfjs'
import { fourChordStrumBeats, houseOfTheRisingSunNotes, odeToJoyNotes } from '../../tests/fixtures/guitar/generate.mjs'
import { SAMPLE_RATE } from '../src/tabs/guitar/song/follow/refineWithBasicPitch.js'
import { OPEN_STRINGS, RATE, pick, renderGuitar, strum, withRoomNoise } from './guitarSignals.js'

/**
 * The transcription benchmark's songs and scoring (tests/transcribeBenchmark.test.js):
 * the built-in songs, whose tab we know, as synthetic guitar audio.
 */

export const LEAD = 0.5 // seconds before the first note

/**
 * The three built-in songs as guitar events (tests/guitarSignals.js), which
 * are also the truth: every note's time, pitch, string and fret. Plus the
 * true beat, beats per bar and the chord on every beat.
 */
export function songs() {
  const ode = (() => {
    const quarter = 0.6
    const events = []
    let bar = -1
    let at = 0
    for (const n of odeToJoyNotes()) {
      if (n.bar !== bar) {
        bar = n.bar
        at = 0
      }
      events.push(pick(LEAD + (n.bar * 4 + at) * quarter, n.string, n.fret))
      at += n.quarters
    }
    return { name: 'Ode to Joy (melody)', events, beat: quarter, beats: 32, beatsPerBar: 4, chords: null }
  })()
  const sun = (() => {
    const eighth = 1 / 3
    const notes = houseOfTheRisingSunNotes()
    const events = notes.map((n) => pick(LEAD + (n.bar * 6 + n.index) * eighth, n.string, n.fret))
    // Felt in dotted quarters: two beats a bar.
    const chords = Array.from({ length: 32 }, (_, i) => notes[Math.floor(i / 2) * 6].chord)
    return { name: 'House of the Rising Sun (arpeggio)', events, beat: 3 * eighth, beats: 32, beatsPerBar: 2, chords }
  })()
  const strums = (() => {
    const quarter = 0.75
    const beats = fourChordStrumBeats()
    const events = beats.flatMap((b, i) =>
      strum(LEAD + (b.bar * 4 + b.index) * quarter, Object.fromEntries(b.notes.map((n) => [n.string, n.fret])), { seed: i + 1 }),
    )
    return { name: 'Four-Chord Strum (strums)', events, beat: quarter, beats: 32, beatsPerBar: 4, chords: beats.map((b) => b.chord) }
  })()
  return [ode, sun, strums]
}

/** Every note played: [{ time, midi, string, fret }], strings numbered like tab (1 = high e). */
export const truthOf = (song) => song.events.map((e) => ({ time: e.t, midi: e.midi, string: e.string, fret: e.midi - OPEN_STRINGS[e.string] }))

function to22050(signal) {
  const out = new Float32Array(Math.floor((signal.length * SAMPLE_RATE) / RATE))
  for (let i = 0; i < out.length; i += 1) {
    const at = (i * RATE) / SAMPLE_RATE
    const j = Math.floor(at)
    out[i] = signal[j] + (signal[Math.min(j + 1, signal.length - 1)] - signal[j]) * (at - j)
  }
  return out
}

/** The song as the models hear it: 22050 Hz mono, with room noise. */
export function render(song) {
  const seconds = Math.max(...song.events.map((e) => e.t)) + 2
  return to22050(withRoomNoise(renderGuitar(seconds, song.events)))
}

/** Greedy one-to-one matching: F1 of `found` against `truth`, `same(t, f)` deciding a match. */
export function f1(truth, found, same) {
  const used = new Set()
  let hits = 0
  for (const t of truth) {
    const i = found.findIndex((f, k) => !used.has(k) && same(t, f))
    if (i >= 0) {
      used.add(i)
      hits += 1
    }
  }
  const precision = found.length ? hits / found.length : 0
  const recall = truth.length ? hits / truth.length : 0
  return precision + recall ? (2 * precision * recall) / (precision + recall) : 0
}

/** Basic Pitch with its model read from node_modules (Node can't fetch it). */
export function basicPitchFromDisk() {
  const dir = new URL('../node_modules/@spotify/basic-pitch/model/', import.meta.url)
  const json = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'))
  const weights = readFileSync(new URL('group1-shard1of1.bin', dir))
  const handler = {
    load: async () => ({
      modelTopology: json.modelTopology,
      format: json.format,
      generatedBy: json.generatedBy,
      convertedBy: json.convertedBy,
      weightSpecs: json.weightsManifest.flatMap((m) => m.weights),
      weightData: weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength),
    }),
  }
  return new BasicPitch(tf.loadGraphModel(handler))
}

/** A track by its part name (alphaTab writes a name's spaces as no-break spaces). */
const trackNamed = (score, name) => score.tracks.find((t) => t.name.replace(/\u00a0/g, ' ') === name)

/**
 * Where each note of a track is: [{ midi, bar, at, string,
 * fret }], `bar` counted from the first full bar (a pickup is bar -1) and
 * `at` the fraction of the bar before it (0 … 1).
 */
export function tabNotes(track, pickupBars) {
  return track.staves[0].bars.flatMap((bar) =>
    bar.voices.flatMap((voice, v) =>
      voice.beats.flatMap((beat) =>
        beat.notes
          .filter((note) => !note.isTieDestination)
          .map((note) => ({
            midi: note.realValue,
            bar: bar.index - pickupBars,
            at: beat.playbackStart / bar.masterBar.calculateDuration(),
            string: bar.staff.tuning.length - note.string + 1,
            fret: note.fret,
            voice: v,
          })),
      ),
    ),
  )
}

/**
 * How a draft did against `song`:
 *   notes      F1 of the notes heard (pitch, onset within 50 ms)
 *   barLines   F1 of the downbeats found (within 70 ms)
 *   chords     share of beats with the right chord (null: no chords)
 *   place      F1 of the tab's notes in the right bar at the right place in it
 *   tab        … and on the song's string and fret
 */
export function scoreDraft(song, { notes, bars, chords, score, origin, beatsPerBar, track = 'Guitar' }) {
  const truth = truthOf(song)
  const trueBeats = Array.from({ length: song.beats }, (_, i) => LEAD + i * song.beat)
  const trueDownbeats = trueBeats.filter((_, i) => i % song.beatsPerBar === 0)
  let chordShare = null
  if (song.chords) {
    const nearest = (t) => bars.beats.reduce((k, b, j) => (Math.abs(b - t) < Math.abs(bars.beats[k] - t) ? j : k), 0)
    chordShare = trueBeats.filter((t, i) => chords[nearest(t)]?.id === song.chords[i]).length / trueBeats.length
  }
  const barSeconds = song.beat * song.beatsPerBar
  const trueTab = truth.map((n) => ({ ...n, bar: Math.floor((n.time - LEAD + 0.001) / barSeconds), at: ((((n.time - LEAD) / barSeconds) % 1) + 1) % 1 }))
  const tab = tabNotes(trackNamed(score, track), Math.round((bars.firstDownbeat - origin) / beatsPerBar))
  const sameSpot = (t, f) => t.midi === f.midi && t.bar === f.bar && Math.abs(t.at - f.at) < 1 / 32
  return {
    notes: f1(truth, notes, (t, f) => t.midi === f.pitchMidi && Math.abs(t.time - f.startTimeSeconds) <= 0.05),
    heard: notes.length,
    played: truth.length,
    barLines: f1(trueDownbeats, bars.downbeats, (t, f) => Math.abs(t - f) <= 0.07),
    beatsPerBar: bars.beatsPerBar,
    chords: chordShare,
    place: f1(trueTab, tab, sameSpot),
    tab: f1(trueTab, tab, (t, f) => sameSpot(t, f) && t.string === f.string && t.fret === f.fret),
  }
}

export const describeScore = (song, s) =>
  `${song.name}: notes F1 ${s.notes.toFixed(2)} (${s.heard} heard, ${s.played} played)` +
  ` | ${s.beatsPerBar} beats a bar (${song.beatsPerBar} written), bar lines F1 ${s.barLines.toFixed(2)}` +
  ` | chords ${s.chords === null ? '-' : s.chords.toFixed(2)}` +
  ` | draft: right place F1 ${s.place.toFixed(2)}, same string and fret F1 ${s.tab.toFixed(2)}`
