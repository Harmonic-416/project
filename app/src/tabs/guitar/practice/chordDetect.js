/**
 * Spectrum helpers for chord checking, pure so they run in Node for tests:
 * the FFT, and a chord's expected chroma (energy per pitch class, C … B)
 * with its strings' first overtones. The note judge (song/follow/noteJudge.js)
 * compares a strum with the chord it expects using these; it is what Wait
 * for me and Trouble spots listen with. Unit-tested in
 * app/tests/chordDetect.test.js.
 */

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

/** What a set of sounded notes should look like as unit chroma: the notes plus their first overtones. */
export function templateFromMidi(midis) {
  const template = new Float32Array(12)
  for (const midi of midis) {
    for (const [semitones, weight] of HARMONICS) template[pitchClass(midi + semitones)] += weight
  }
  return normalize(template)
}
