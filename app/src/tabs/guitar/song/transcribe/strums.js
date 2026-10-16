import { fft } from '../../practice/chordDetect.js'
import { decibels, hz, power } from './ghostNotes.js'

/**
 * Every strum and pick in the separated guitar. Basic Pitch's note tracker
 * misses most of them in a strummed part: a strum re-strikes strings that
 * are still ringing, so the pitches never stop and no note starts, and
 * separation softens each string's attack. Two things still mark a strum:
 *
 *   - its attack: a burst of new high frequencies (pick and string noise)
 *     even over a chord that's still ringing — spectral flux above 1 kHz,
 *     each frame against the one two before it, with the earlier frame
 *     widened across neighbouring bins so a wobble in pitch isn't new;
 *   - Basic Pitch's onset activations summed over the guitar's pitches,
 *     which rise when strings are struck again, though rarely past the note
 *     tracker's threshold one string at a time.
 *
 * Each curve is scaled by the size of a loud strum (its 99th percentile:
 * between strums the curve is mostly the noise floor, whose spread says
 * nothing about strums) and the two are added; a strum is a peak standing
 * out from the curve's moving median, the strongest within 60 ms (one
 * strum's strings spread over ~40 ms). A drum leaking into the guitar has
 * an attack but no pitches starting, so with Basic Pitch's onsets a peak
 * also needs some of them.
 *
 * Not every strum strikes a chord: a picked note, or one string of an
 * arpeggio, makes an attack too, while the strings before it ring on.
 * struckPitches() and chordStrums() tell them apart.
 *
 * Pure; unit-tested in app/tests/strums.test.js.
 */

export const HOP = 256 // samples: Basic Pitch's own frame rate at 22.05 kHz (~86 a second)
const N = 1024 // the attack curve's window
const LOW_HZ = 1000
const HIGH_HZ = 8000
const LAG = 2 // frames: each frame's spectrum against the one this many before
const SPREAD_BINS = 1 // the earlier spectrum widened by this many bins either side
const GUITAR_PITCHES = [40, 88] // Basic Pitch's pitch index is MIDI − 21
const MEDIAN_SECONDS = 0.5 // the moving median: this much either side
const PEAK = 0.15 // a peak stands this far (a loud strum = 1) above the moving median …
const APART = 0.06 // seconds: … and is the strongest this close
const PITCHED = 0.1 // with Basic Pitch's onsets, a peak also needs this much of them (a loud strum's = 1)

const median = (values) => {
  const sorted = Float32Array.from(values).sort()
  return sorted.length ? sorted[sorted.length >> 1] : 0
}

/** `curve` scaled so a loud strum (its 99th percentile) is 1. */
export function normalize(curve) {
  const sorted = Float32Array.from(curve).sort()
  const loud = sorted[Math.floor(0.99 * (sorted.length - 1))] || 1
  return curve.map((v) => v / loud)
}

/** The attack curve of `samples`: new energy above 1 kHz per HOP (frame f centred on sample f × HOP). */
export function attackCurve(samples, { sampleRate = 22050 } = {}) {
  const frames = Math.ceil(samples.length / HOP)
  const lo = Math.round((LOW_HZ * N) / sampleRate)
  const hi = Math.min(N / 2 - 1, Math.round((HIGH_HZ * N) / sampleRate))
  const window = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
  const spectra = []
  const re = new Float64Array(N)
  const im = new Float64Array(N)
  const curve = new Float32Array(frames)
  for (let f = 0; f < frames; f += 1) {
    const start = f * HOP - N / 2
    for (let i = 0; i < N; i += 1) {
      re[i] = (samples[start + i] ?? 0) * window[i]
      im[i] = 0
    }
    fft(re, im)
    const spectrum = new Float32Array(hi + 1)
    for (let k = lo; k <= hi; k += 1) spectrum[k] = Math.log1p(100 * Math.hypot(re[k], im[k]))
    spectra.push(spectrum)
    if (spectra.length > LAG + 1) spectra.shift()
    if (f < LAG) continue
    const before = spectra[0]
    let flux = 0
    for (let k = lo; k <= hi; k += 1) {
      let widened = before[k]
      for (let d = 1; d <= SPREAD_BINS; d += 1) widened = Math.max(widened, before[k - d] ?? 0, before[k + d] ?? 0)
      flux += Math.max(0, spectrum[k] - widened)
    }
    curve[f] = flux
  }
  return curve
}

/** Basic Pitch's `onsets` (per frame, 88 pitches from A0) summed over the guitar's pitches, on the HOP grid. */
export function onsetCurve(onsets, frameTime, frames, { sampleRate = 22050 } = {}) {
  const curve = new Float32Array(frames)
  for (let b = 0; b < onsets.length; b += 1) {
    const f = Math.round((frameTime(b) * sampleRate) / HOP)
    if (f < 0 || f >= frames) continue
    let sum = 0
    for (let p = GUITAR_PITCHES[0] - 21; p <= GUITAR_PITCHES[1] - 21; p += 1) sum += onsets[b][p]
    curve[f] = Math.max(curve[f], sum)
  }
  return curve
}

/** `curve` less its median over ±`half` frames. */
function aboveMovingMedian(curve, half) {
  const out = new Float32Array(curve.length)
  for (let f = 0; f < curve.length; f += 1) {
    const around = curve.subarray(Math.max(0, f - half), Math.min(curve.length, f + half + 1))
    out[f] = curve[f] - median(around)
  }
  return out
}

/**
 * The strums and picks in `samples` (the separated guitar, mono): [{ time
 * (seconds), strength }], in time order. With Basic Pitch's `onsets` (and
 * its `frameTime`), its onset activations count too, and a peak needs some
 * of them; without, the attack alone decides.
 */
export function findStrums(samples, { onsets = null, frameTime = null, sampleRate = 22050 } = {}) {
  const attack = normalize(attackCurve(samples, { sampleRate }))
  const pitched = onsets ? normalize(onsetCurve(onsets, frameTime, attack.length, { sampleRate })) : null
  const combined = pitched ? attack.map((v, f) => v + pitched[f]) : attack
  const novelty = aboveMovingMedian(combined, Math.round((MEDIAN_SECONDS * sampleRate) / HOP))
  const apart = Math.max(1, Math.round((APART * sampleRate) / HOP))
  const strums = []
  for (let f = 0; f < novelty.length; f += 1) {
    const v = novelty[f]
    if (v < PEAK) continue
    let top = true
    for (let d = -apart; d <= apart && top; d += 1) {
      const w = novelty[f + d]
      if (d && w !== undefined && (w > v || (w === v && d < 0))) top = false
    }
    if (!top) continue
    if (pitched) {
      let near = 0
      for (let d = -2; d <= 2; d += 1) near = Math.max(near, pitched[f + d] ?? 0)
      if (near < PITCHED) continue
    }
    strums.push({ time: (f * HOP) / sampleRate, strength: v })
  }
  return strums
}

/** The guitar's pitches (E2–E6) at least `level` in `evidence` (activation per MIDI pitch), low to high. */
export function heardPitches(evidence, level = 0.12) {
  const pitches = []
  for (let m = 40; m <= 88; m += 1) if (evidence[m] >= level) pitches.push(m)
  return pitches
}

/**
 * What sounds just after a strum, from Basic Pitch's `frames` (88 pitches
 * from A0, timed by `frameTime`): evidenceAt(time) is the mean activation of
 * each MIDI pitch (an array indexed by MIDI number) from `from` to `to`
 * seconds after `time` — past the pick's noise, before the next strum.
 */
export function pitchEvidence(frames, frameTime, { from = 0.04, to = 0.14 } = {}) {
  const times = frames.map((_, f) => frameTime(f))
  const firstAfter = (t) => {
    let lo = 0
    let hi = times.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (times[mid] < t) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  return (time) => {
    const evidence = new Float32Array(128)
    let count = 0
    for (let f = firstAfter(time + from); f < times.length && times[f] <= time + to; f += 1) {
      count += 1
      for (let p = 0; p < 88; p += 1) evidence[p + 21] += frames[f][p]
    }
    if (count) for (let m = 0; m < 128; m += 1) evidence[m] /= count
    return evidence
  }
}

const STRUCK_DB = 4 // a string struck at the strum: its pitch this much louder just after than just before
const OVERTONES = [12, 19, 24, 28, 31, 34, 36] // semitones above a string where its 2nd–8th harmonics sound
const OVERTONE_SHARE = 0.5 // an overtone is heard at most this share of its string's own pitch
const LEAK_HZ = 15 // a rise this close to a bigger one is that one leaking in …
const SIDELOBE_HZ = 45 // … and so is one this close to a rise this much bigger
const SIDELOBE_DB = 20
const CHORD_STRINGS = 3 // strings struck at once: a chord, not a picked note
const SAME_CHORD = 0.5 // shared share of the notes heard (Jaccard) for a strum to strike the chord before it again
const CARRIES = 1.5 // seconds a chord carries over to the next strum …
const RESTRUM_DB = 20 // … if nothing in it gets louder than this: more is a string picked after it had died away

/**
 * The strings `time`'s strum struck, out of the pitches heard just after it
 * (`evidence`, Basic Pitch's activation per MIDI pitch; see heardPitches):
 * those whose pitch gets louder across it in `samples` (a ringing
 * string only fades), measured over 100 ms either side so low strings a
 * few semitones apart (B2 and D3 are 23 Hz apart) don't blur together.
 * Left out: a pitch just 15 Hz from one that rose more, or 45 Hz from one
 * that rose 20 dB more (its rise is that one leaking in), and an overtone:
 * a harmonic of a lower pitch heard, heard less than half as strongly as
 * it (Basic Pitch reports a string's own pitch much more strongly than its
 * overtones; an octave or a fifth on a string of its own, as in a power
 * chord, is heard as strongly as the root). The lower pitch needn't rise:
 * a re-picked string's pitch, still ringing, barely does, while its upper
 * harmonics, which had died away, jump. Returns {
 * struck (MIDI, low to high), rise (dB, the most any heard pitch rose) }.
 */
export function struckPitches(samples, time, evidence, { sampleRate = 22050 } = {}) {
  const heard = heardPitches(evidence)
  const rising = []
  for (const midi of heard) {
    const f = hz(midi)
    const rise = decibels(power(samples, sampleRate, f, time + 0.015, time + 0.115), power(samples, sampleRate, f, time - 0.11, time - 0.01))
    if (rise >= STRUCK_DB) rising.push({ midi, f, rise })
  }
  const loudest = Math.max(0, ...rising.map((r) => r.rise))
  const clear = []
  for (const r of rising.sort((a, b) => b.rise - a.rise)) {
    const leaked = clear.some((c) => Math.abs(c.f - r.f) < LEAK_HZ || (Math.abs(c.f - r.f) < SIDELOBE_HZ && c.rise - r.rise >= SIDELOBE_DB))
    if (!leaked) clear.push(r)
  }
  const overtone = (midi) => heard.some((lower) => OVERTONES.includes(midi - lower) && evidence[midi] < OVERTONE_SHARE * evidence[lower])
  const struck = clear
    .map((c) => c.midi)
    .filter((midi) => !overtone(midi))
    .sort((a, b) => a - b)
  return { struck, rise: loudest }
}

/**
 * Which strums strike a chord rather than pick a note, for strums
 * `[{ time, heard, struck, rise }]` in time order (pitches heard just
 * after; struckPitches' strings struck and biggest rise). A strum striking
 * three or more strings is a chord. So is one soon after a chord that
 * strikes a string again while mostly the same notes sound, none of them
 * jumping by more than 20 dB: the chord strummed again, its strings still
 * ringing, so they only get somewhat louder. An arpeggio picks one string
 * at a time — never three, so it never starts a chord — and each pick
 * re-strikes a string that has died away, a jump too big for a re-strum.
 */
export function chordStrums(list) {
  const chord = new Array(list.length).fill(false)
  let last = null // the last chord strum
  list.forEach((s, i) => {
    const heard = new Set(s.heard)
    const again =
      last &&
      s.time - last.time < CARRIES &&
      s.struck.length > 0 &&
      s.rise <= RESTRUM_DB &&
      [...heard].filter((m) => last.heard.includes(m)).length / new Set([...heard, ...last.heard]).size >= SAME_CHORD
    chord[i] = s.struck.length >= CHORD_STRINGS || Boolean(again)
    if (chord[i]) last = s
  })
  return chord
}
