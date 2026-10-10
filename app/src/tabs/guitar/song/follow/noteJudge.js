import { centsOff } from '../../../vocal/audio/pitchDetector.js'
import { dot, fft, templateFromMidi } from '../../practice/chordDetect.js'
import { UNSCORED_TECHNIQUES } from './songTimeline.js'

/**
 * Did the guitarist play the expected note or chord? Score-informed, like
 * guitarTutor's verification: rather than transcribing blind, look for the
 * notes the score says should sound — each one's fundamental and first
 * overtones — among the spectral peaks right after a pick or strum
 * (listenWindows.js). Pure, so it runs in Node (app/tests/noteJudge.test.js).
 *
 *   verdict: 'hit'     – the expected note (or enough of the chord) sounded
 *            'close'   – right note in the wrong octave, a semitone off, or
 *                        only part of the chord
 *            'miss'    – something else
 *            'skipped' – a technique the live judge doesn't score yet
 *
 * Single notes also use the pitch tracker's readings (`pitches`, MIDI from
 * vocal/audio/pitchDetector.js). Strings ring on, so a note only counts as
 * played if it got louder at the onset (`before`, the frame just before
 * it) — otherwise an arpeggio's ringing bass string would read as a wrong
 * note.
 *
 * Known limit: a chord tone whose lower octave also sounds (E4 over E3)
 * can't be told apart from that octave's overtones, so a missing top
 * string can still read as played.
 */

// Tuning knobs: loosen or tighten by ear against real recordings.
export const PRESENT = 0.25 // share of the loudest peak an expected note's partials need, to count as sounding
export const STRUCK_GAIN = 1.4 // how much louder than just before the onset a newly played note is
export const CHORD_HIT = 0.8 // share of a chord's notes that must sound for a hit
export const CHORD_CLOSE = 0.5 // … and for a close
export const CHROMA_MATCH = 0.7 // how closely the whole sound must match the chord for a hit

// Wait for me (waitListening.js): the player can always strum again, so a
// chord is a hit only when every one of its notes sounds; with fewer, E major
// passes for E minor (one fret on the G string). A gentler per-string
// threshold keeps quieter strings of a good strum counting.
export const EVERY_STRING = { chordPresent: 0.15, chordHit: 1 }

const PARTIALS = [
  [1, 1],
  [2, 0.8],
  [3, 0.6],
  [4, 0.4],
]
const PARTIAL_WEIGHT = PARTIALS.reduce((sum, [, weight]) => sum + weight, 0)
const MIN_FREQUENCY = 60
const MAX_FREQUENCY = 5000
const PEAK_CENTS = 40 // how far from the exact frequency a partial may sit (tuning, string stretch)
const PEAK_RATIO = 0.04 // peaks below 4% of the loudest are noise
// A note heard only through partials 3+ (no fundamental, no octave) is most
// likely another note's overtone: count a fraction of it.
const UPPER_ONLY = 0.3

const midiToFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12)

const hannCache = new Map()
function hann(n) {
  if (!hannCache.has(n)) {
    hannCache.set(n, Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))))
  }
  return hannCache.get(n)
}

/** Magnitude spectrum (bins 0 … n/2) of one frame; `n` must be a power of two. */
export function magnitudeSpectrum(samples) {
  const n = samples.length
  const window = hann(n)
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < n; i += 1) re[i] = samples[i] * window[i]
  fft(re, im)
  const magnitude = new Float64Array(n / 2 + 1)
  for (let bin = 0; bin <= n / 2; bin += 1) magnitude[bin] = Math.hypot(re[bin], im[bin])
  return magnitude
}

/** Average of several magnitude spectra. */
export function averageSpectrum(spectra) {
  const sum = Float64Array.from(spectra[0])
  for (let s = 1; s < spectra.length; s += 1) {
    for (let bin = 0; bin < sum.length; bin += 1) sum[bin] += spectra[s][bin]
  }
  for (let bin = 0; bin < sum.length; bin += 1) sum[bin] /= spectra.length
  return sum
}

/**
 * Spectral peaks at their interpolated frequencies: { peaks: [{ frequency,
 * magnitude }], loudest }. Counting each peak once at its true frequency
 * keeps the window's leakage into neighbouring bins from passing for a
 * different note (the same idea as chordDetect.chromaFromFrame).
 */
export function spectralPeaks(spectrum, sampleRate) {
  const n = (spectrum.length - 1) * 2
  const lo = Math.max(1, Math.floor((MIN_FREQUENCY * n) / sampleRate))
  const hi = Math.min(spectrum.length - 2, Math.ceil((MAX_FREQUENCY * n) / sampleRate))
  let loudest = 0
  for (let bin = lo; bin <= hi; bin += 1) loudest = Math.max(loudest, spectrum[bin])
  const peaks = []
  if (loudest === 0) return { peaks, loudest }
  for (let bin = lo; bin <= hi; bin += 1) {
    const [left, peak, right] = [spectrum[bin - 1], spectrum[bin], spectrum[bin + 1]]
    if (peak < loudest * PEAK_RATIO || peak < left || peak < right) continue
    const curve = left - 2 * peak + right
    const offset = curve === 0 ? 0 : (0.5 * (left - right)) / curve
    peaks.push({ frequency: ((bin + offset) * sampleRate) / n, magnitude: peak })
  }
  return { peaks, loudest }
}

function peakNear({ peaks }, frequency) {
  let best = 0
  for (const peak of peaks) {
    if (Math.abs(1200 * Math.log2(peak.frequency / frequency)) <= PEAK_CENTS) best = Math.max(best, peak.magnitude)
  }
  return best
}

/** Weighted sum of a note's partial peaks, discounted when only its upper partials are there. */
function partialSum(peakInfo, midi) {
  const f0 = midiToFrequency(midi)
  let sum = 0
  let low = false
  for (const [k, weight] of PARTIALS) {
    if (k * f0 > MAX_FREQUENCY) continue
    const peak = peakNear(peakInfo, k * f0)
    if (peak > 0 && k <= 2) low = true
    sum += weight * peak
  }
  return low ? sum : sum * UPPER_ONLY
}

/** 0 … 1: how strongly `midi` sounds, relative to the loudest peak. */
export function noteEvidence(peakInfo, midi) {
  return peakInfo.loudest > 0 ? partialSum(peakInfo, midi) / (PARTIAL_WEIGHT * peakInfo.loudest) : 0
}

/**
 * How much louder `midi` got from `before` to `after` (Infinity from
 * silence), measured on its lowest partial that sounds — the fundamental,
 * or the octave when the fundamental is weak (low strings on a phone mic).
 * Higher partials are shared with octave neighbours: A3 joining a ringing
 * A2 lifts A2's second partial, but not A2's fundamental.
 */
export function noteGain(after, before, midi) {
  const f0 = midiToFrequency(midi)
  for (const k of [1, 2]) {
    const now = peakNear(after, k * f0)
    if (now <= 0) continue
    const was = peakNear(before, k * f0)
    return was > 1e-9 ? now / was : Infinity
  }
  return 0
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Pitch error in cents → 'in-tune' (±50), 'octave' (right note, other octave), 'close' (a semitone), or 'wrong'. */
export function classifyGuitarCents(cents) {
  const abs = Math.abs(cents)
  if (abs <= 50) return 'in-tune'
  const folded = cents - 1200 * Math.round(cents / 1200)
  if (Math.abs(folded) <= 50) return 'octave'
  if (abs <= 150) return 'close'
  return 'wrong'
}

function judgeSingle(after, before, pitches, target) {
  const detected = pitches.length >= 2 ? median(pitches) : null
  const cents = detected === null ? null : centsOff(detected, target)
  const pitchVerdict = cents === null ? null : classifyGuitarCents(cents)
  const struck = noteEvidence(after, target) >= PRESENT && (!before || noteGain(after, before, target) >= STRUCK_GAIN)
  const detectedStruck = detected !== null && (!before || noteGain(after, before, Math.round(detected)) >= STRUCK_GAIN)
  const result = { detected, cents }

  if (pitchVerdict === 'in-tune') return { ...result, verdict: 'hit' }
  // The tracker locked onto a string that was already ringing; the expected note is the new one.
  if (struck && !detectedStruck) return { ...result, verdict: 'hit' }
  if (struck || pitchVerdict === 'octave' || pitchVerdict === 'close') return { ...result, verdict: 'close' }
  return { ...result, verdict: 'miss' }
}

/** Unit chroma (C … B) of the peaks. */
function chromaOf({ peaks }) {
  const chroma = new Float32Array(12)
  for (const { frequency, magnitude } of peaks) {
    const pitchClass = ((Math.round(69 + 12 * Math.log2(frequency / 440)) % 12) + 12) % 12
    chroma[pitchClass] += magnitude
  }
  let length = 0
  for (const value of chroma) length += value * value
  length = Math.sqrt(length)
  if (length > 0) for (let i = 0; i < 12; i += 1) chroma[i] /= length
  return chroma
}

function judgeChord(after, notes, { chordPresent = PRESENT, chordHit = CHORD_HIT } = {}) {
  const strings = {}
  let sounding = 0
  for (const { midi, string } of notes) {
    const present = noteEvidence(after, midi) >= chordPresent
    if (present) sounding += 1
    strings[string] = present ? 'good' : 'bad'
  }
  const match = dot(chromaOf(after), templateFromMidi(notes.map((n) => n.midi)))
  const share = sounding / notes.length
  const verdict = share >= chordHit && match >= CHROMA_MATCH ? 'hit' : share >= CHORD_CLOSE ? 'close' : 'miss'
  return { verdict, strings, sounding, total: notes.length, match }
}

/**
 * Judge one listening window against a timeline entry (songTimeline.js).
 * `spectra`: magnitude spectra of the frames after the onset (or `frames`,
 * time-domain, to compute them); `beforeSpectrum` / `before`: the frame just
 * before it, or null; `pitches`: pitch-tracker readings (MIDI) in the window.
 * `options` tightens the chord rule ({ chordPresent, chordHit }, e.g.
 * EVERY_STRING); the defaults are PRESENT and CHORD_HIT.
 */
export function judgeWindow({ spectra, frames, beforeSpectrum, before = null, sampleRate, pitches = [] }, entry, options) {
  if (UNSCORED_TECHNIQUES.has(entry.technique)) return { verdict: 'skipped' }
  const afterSpectra = spectra ?? (frames ?? []).map(magnitudeSpectrum)
  if (!afterSpectra.length) return { verdict: 'miss' }
  const after = spectralPeaks(averageSpectrum(afterSpectra), sampleRate)
  if (after.loudest === 0) return { verdict: 'miss' }
  const previous = beforeSpectrum ?? (before ? magnitudeSpectrum(before) : null)
  const beforePeaks = previous ? spectralPeaks(previous, sampleRate) : null
  if (entry.kind === 'single') return judgeSingle(after, beforePeaks, pitches, entry.notes[0].midi)
  return judgeChord(after, entry.notes, options)
}

/** Better-of for one entry heard more than once (a re-pick, a second strum). */
const RANK = { miss: 1, close: 2, hit: 3 }
export function betterVerdict(a, b) {
  if (!a) return b
  if (!b) return a
  return (RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a
}
