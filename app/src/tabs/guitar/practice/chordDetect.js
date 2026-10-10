import { CHORDS, chordMidi } from './chords.js'

/**
 * Chord verification (F16), pure so it runs in Node for tests: does a strum
 * sound like the one chord we asked for, some other chord, or nothing (F21)?
 * Not arbitrary-chord recognition — each strum is turned into a chroma vector
 * (energy per pitch class, C … B) and compared with templates of the chords
 * the app teaches. Unit-tested in app/tests/chordDetect.test.js;
 * useChordDetection feeds it frames and onsets from the shared capture.
 *
 *   verdict: 'verified' – closest to the expected chord
 *            'wrong'    – closer to another chord, or to none of them
 *            'silent'   – nothing above SOUND_FLOOR for SILENCE_SECONDS
 */

// Tuning knobs: loosen or tighten by ear.
export const MIN_MATCH = 0.8 // cosine similarity the expected chord needs
export const MARGIN = 0.02 // how far behind another chord it may still be
export const SOUND_FLOOR = 0.01 // hop RMS that counts as sound
export const SILENCE_SECONDS = 2.5
export const ATTACK_SECONDS = 0.03 // skip the pick click right after the onset
export const WINDOW_SECONDS = 0.7 // how long after a strum to listen before deciding

const MIN_FREQUENCY = 75 // just under low E (82 Hz)
const MAX_FREQUENCY = 1400
const PEAK_RATIO = 0.1 // spectral peaks below 10% of the loudest are noise

// A plucked string's first overtones: octave, octave + fifth, two octaves and
// two octaves + major third (the one that makes E minor's low E hint at G#).
const HARMONICS = [
  [0, 1],
  [12, 0.6],
  [19, 0.36],
  [24, 0.22],
  [28, 0.13],
]

const pitchClass = (midi) => ((Math.round(midi) % 12) + 12) % 12

function normalize(vector) {
  let sum = 0
  for (const value of vector) sum += value * value
  const length = Math.sqrt(sum)
  if (length > 0) for (let i = 0; i < vector.length; i += 1) vector[i] /= length
  return vector
}

export function dot(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i]
  return sum
}

/** In-place radix-2 FFT; `re` and `im` must have the same power-of-two length. */
export function fft(re, im) {
  const n = re.length
  if (n & (n - 1)) throw new Error('FFT size must be a power of two')
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const r = re[i]
      re[i] = re[j]
      re[j] = r
      const m = im[i]
      im[i] = im[j]
      im[j] = m
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const angle = (-2 * Math.PI) / size
    for (let k = 0; k < half; k += 1) {
      const wRe = Math.cos(angle * k)
      const wIm = Math.sin(angle * k)
      for (let i = k; i < n; i += size) {
        const j = i + half
        const tRe = re[j] * wRe - im[j] * wIm
        const tIm = re[j] * wIm + im[j] * wRe
        re[j] = re[i] - tRe
        im[j] = im[i] - tIm
        re[i] += tRe
        im[i] += tIm
      }
    }
  }
}

const hannCache = new Map()
function hann(n) {
  if (!hannCache.has(n)) hannCache.set(n, Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))))
  return hannCache.get(n)
}

/**
 * One frame → unit-length chroma (12 bins, C first). Each spectral peak
 * counts once, at its interpolated frequency, so the window's leakage into
 * neighbouring bins can't smear low notes into the wrong pitch class.
 */
export function chromaFromFrame(samples, sampleRate) {
  const n = samples.length
  const window = hann(n)
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < n; i += 1) re[i] = samples[i] * window[i]
  fft(re, im)

  const lo = Math.max(1, Math.ceil((MIN_FREQUENCY * n) / sampleRate))
  const hi = Math.min(n / 2 - 1, Math.floor((MAX_FREQUENCY * n) / sampleRate))
  const magnitude = new Float64Array(hi + 2)
  let loudest = 0
  for (let bin = lo - 1; bin <= hi + 1; bin += 1) {
    magnitude[bin] = Math.hypot(re[bin], im[bin])
    if (bin >= lo && bin <= hi) loudest = Math.max(loudest, magnitude[bin])
  }

  const chroma = new Float32Array(12)
  if (loudest === 0) return chroma
  for (let bin = lo; bin <= hi; bin += 1) {
    const [left, peak, right] = [magnitude[bin - 1], magnitude[bin], magnitude[bin + 1]]
    if (peak < loudest * PEAK_RATIO || peak < left || peak < right) continue
    const curve = left - 2 * peak + right
    const offset = curve === 0 ? 0 : (0.5 * (left - right)) / curve
    const frequency = ((bin + offset) * sampleRate) / n
    chroma[pitchClass(69 + 12 * Math.log2(frequency / 440))] += peak
  }
  return normalize(chroma)
}

const templateCache = new WeakMap()

/** What any set of sounded notes should look like as chroma: the notes plus their first overtones. */
export function templateFromMidi(midis) {
  const template = new Float32Array(12)
  for (const midi of midis) {
    for (const [semitones, weight] of HARMONICS) template[pitchClass(midi + semitones)] += weight
  }
  return normalize(template)
}

/** What a chord should look like as chroma (see templateFromMidi). */
export function chordTemplate(chord) {
  if (!templateCache.has(chord)) templateCache.set(chord, templateFromMidi(chordMidi(chord)))
  return templateCache.get(chord)
}

/** 'verified' if `chroma` is closest (within MARGIN) to `expected` and close enough overall, else 'wrong'. */
export function matchChord(chroma, expected, candidates = CHORDS) {
  const target = dot(chroma, chordTemplate(expected))
  let bestOther = -Infinity
  for (const chord of candidates) {
    if (chord.id !== expected.id) bestOther = Math.max(bestOther, dot(chroma, chordTemplate(chord)))
  }
  return target >= MIN_MATCH && target >= bestOther - MARGIN ? 'verified' : 'wrong'
}

/**
 * Turns capture events into verdicts. Positions are sample indices on the
 * capture clock, as FrameAssembler reports them.
 *
 * - onset(position): a strum opens a window; frames that start after the
 *   attack and end within WINDOW_SECONDS are averaged into one chroma and
 *   matched when the window closes. A new strum restarts the window.
 * - frame({ samples, level, position }): feeds the window and the silence
 *   timer — SILENCE_SECONDS below SOUND_FLOOR reports 'silent' once, and
 *   sound re-arms it.
 * - setChord(chord): a new expected chord drops any open window.
 * - muteUntil(position): ignore everything until then (e.g. the Hint synth).
 */
export function createChordListener({ sampleRate, onVerdict, chord = null }) {
  const attack = Math.round(ATTACK_SECONDS * sampleRate)
  const windowLength = Math.round(WINDOW_SECONDS * sampleRate)
  const silenceLength = Math.round(SILENCE_SECONDS * sampleRate)

  let expected = chord
  let strum = null // { onset, sum, frames, level }
  let lastSoundAt = null
  let silenceReported = false
  let mutedUntil = -Infinity
  let lastPosition = 0

  const emit = (verdict) => onVerdict?.(verdict)
  const restartSilence = () => {
    lastSoundAt = lastPosition
    silenceReported = false
  }

  return {
    onset(position) {
      if (!expected || position < mutedUntil) return
      strum = { onset: position, sum: new Float32Array(12), frames: 0, level: 0 }
    },

    frame({ samples, level, position }) {
      lastPosition = position
      if (lastSoundAt === null || position < mutedUntil) {
        restartSilence()
        return
      }
      if (level >= SOUND_FLOOR) restartSilence()

      if (strum) {
        const end = strum.onset + windowLength
        if (position - samples.length >= strum.onset + attack && position <= end) {
          const chroma = chromaFromFrame(samples, sampleRate)
          for (let i = 0; i < 12; i += 1) strum.sum[i] += chroma[i]
          strum.frames += 1
          strum.level += level
        }
        if (position >= end) {
          const { sum, frames, level: levels } = strum
          strum = null
          if (frames && levels / frames >= SOUND_FLOOR) emit(matchChord(normalize(sum), expected))
        }
        return
      }

      if (expected && !silenceReported && position - lastSoundAt >= silenceLength) {
        silenceReported = true
        emit('silent')
      }
    },

    setChord(next) {
      if (next?.id === expected?.id) return
      expected = next
      strum = null
      restartSilence()
    },

    muteUntil(position) {
      mutedUntil = position
      strum = null
    },

    reset() {
      strum = null
      lastSoundAt = null
      silenceReported = false
      mutedUntil = -Infinity
    },
  }
}
