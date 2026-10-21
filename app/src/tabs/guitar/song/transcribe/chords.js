import { KINDS } from '../../practice/chordNames.js'

/**
 * The chord on every beat of a recording, the way Chordify does it in
 * outline: a pitch-class profile (chroma) for each beat, matched against
 * chord templates, then smoothed so the chord only changes when the music
 * clearly does — more readily at a bar line. The profile comes from Basic
 * Pitch's per-frame pitch activations (refineWithBasicPitch.js), so no
 * second model is needed; the lowest strong pitch is the bass, which helps
 * pick the root.
 *
 * The draft names each chord over the guitar's tab where it changes
 * (harmonyXml, written into the score by pipeline.js).
 *
 * Pure; unit-tested in app/tests/chords.test.js.
 *
 *   beat chord: { root: 0…11, kind: 'major' | 'minor' | '7' | 'maj7' | 'm7' | 'sus2' | 'sus4', id: 'F#m' } or null (no chord)
 */

const VOCABULARY = ['major', 'minor', '7', 'maj7', 'm7', 'sus2', 'sus4']
const KIND_BY_QUALITY = Object.fromEntries(KINDS.map((k) => [k.quality, k]))

// How much less likely each kind is than a plain triad: the richer and the rarer, the more evidence it needs.
const KIND_PENALTY = { major: 0, minor: 0, 7: 0.02, maj7: 0.04, m7: 0.03, sus2: 0.06, sus4: 0.06 }
const BASS_BONUS = 0.06 // the bass on the root
const CHANGE_COST = 0.18 // changing chord on a beat inside a bar …
const CHANGE_AT_BAR = 0.06 // … and on the first beat of a bar
const NO_CHORD_SCORE = 0.55 // a beat matching nothing better than this has no chord
const SILENT = 0.15 // total activation per frame below which a beat counts as silent

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
export const chordId = (root, kind) => NAMES[root] + KIND_BY_QUALITY[kind].suffix

/** Chord templates: { root, kind, id, vector } with `vector` the unit pitch-class profile. */
export const TEMPLATES = (() => {
  const templates = []
  for (const kind of VOCABULARY) {
    for (let root = 0; root < 12; root += 1) {
      const vector = new Float64Array(12)
      for (const interval of KIND_BY_QUALITY[kind].intervals) vector[(root + interval) % 12] = interval === 0 ? 1.2 : 1
      const norm = Math.hypot(...vector)
      templates.push({ root, kind, id: chordId(root, kind), vector: vector.map((v) => v / norm) })
    }
  }
  return templates
})()

/**
 * Per beat: { chroma (unit, 12), bass (pitch class or null), energy }.
 * `frames` are Basic Pitch's 88-pitch activations (A0 first), `frameTime`
 * maps a frame index to seconds, `beats` are beat times in seconds.
 */
export function beatChroma(frames, frameTime, beats) {
  const spans = beats.map((start, i) => [start, beats[i + 1] ?? start + (beats[i] - (beats[i - 1] ?? start - 0.5))])
  const out = spans.map(() => ({ sum: new Float64Array(12), lowest: new Float64Array(88), count: 0, energy: 0 }))
  let span = 0
  for (let f = 0; f < frames.length; f += 1) {
    const t = frameTime(f)
    while (span < spans.length && t >= spans[span][1]) span += 1
    if (span >= spans.length) break
    if (t < spans[span][0]) continue
    const acc = out[span]
    acc.count += 1
    const frame = frames[f]
    for (let p = 0; p < 88; p += 1) {
      const a = frame[p]
      if (a <= 0.05) continue
      acc.sum[(p + 21) % 12] += a * a // squared: confident pitches count for more
      acc.lowest[p] += a
      acc.energy += a
    }
  }
  return out.map(({ sum, lowest, count, energy }) => {
    const norm = Math.hypot(...sum)
    let bass = null
    for (let p = 0; p < 88 && count; p += 1) {
      if (lowest[p] / count > 0.3) {
        bass = (p + 21) % 12
        break
      }
    }
    return { chroma: norm ? sum.map((v) => v / norm) : sum, bass, energy: count ? energy / count : 0 }
  })
}

/** How well each template fits one beat's profile (cosine, with the kind's penalty and the bass bonus), in TEMPLATES' order. */
export function chordScores({ chroma, bass }) {
  return TEMPLATES.map(({ root, kind, vector }) => {
    let s = 0
    for (let i = 0; i < 12; i += 1) s += chroma[i] * vector[i]
    return s - KIND_PENALTY[kind] + (bass === root ? BASS_BONUS : 0)
  })
}

/** Each beat's scores for every template and, last, for no chord (-1 … 1); a silent beat scores 1 for no chord. */
export function chordEmission(beatProfiles, bonus = null) {
  return beatProfiles.map((profile) => {
    if (profile.energy < SILENT) return [...TEMPLATES.map(() => -1), 1]
    const fit = chordScores(profile)
    return [...(bonus ? fit.map((s, i) => s + bonus[i]) : fit), NO_CHORD_SCORE]
  })
}

/**
 * The best path through `emission` (chordEmission's: a score per state per
 * beat) when staying on a state costs nothing and moving to another costs
 * `changeCost(t)` on beat `t`: the state index on each beat.
 */
export function smoothChords(emission, changeCost) {
  const n = emission.length
  if (!n) return []
  const states = emission[0].length
  let best = emission[0].slice()
  const back = []
  for (let t = 1; t < n; t += 1) {
    const change = changeCost(t)
    let top = 0
    for (let s = 1; s < states; s += 1) if (best[s] > best[top]) top = s
    const next = new Array(states)
    const from = new Array(states)
    for (let s = 0; s < states; s += 1) {
      const stay = best[s]
      const move = best[top] - change
      if (stay >= move) {
        next[s] = stay + emission[t][s]
        from[s] = s
      } else {
        next[s] = move + emission[t][s]
        from[s] = top
      }
    }
    back.push(from)
    best = next
  }
  let state = 0
  for (let s = 1; s < states; s += 1) if (best[s] > best[state]) state = s
  const path = [state]
  for (let t = n - 2; t >= 0; t -= 1) {
    state = back[t][state]
    path.unshift(state)
  }
  return path
}

/** A path's states (smoothChords') as beat chords: { root, kind, id }, or null for no chord. */
export const pathChords = (path) => path.map((s) => (s === TEMPLATES.length ? null : { root: TEMPLATES[s].root, kind: TEMPLATES[s].kind, id: TEMPLATES[s].id }))

/**
 * The chord on each beat (null where there's none), smoothed by a Viterbi
 * pass over the beats: staying costs nothing, changing costs CHANGE_COST,
 * or CHANGE_AT_BAR on a bar's first beat (`beatsPerBar`, `firstDownbeat`).
 */
export function recognizeChords(beatProfiles, { beatsPerBar = 4, firstDownbeat = 0 } = {}) {
  const atBar = (t) => (((t - firstDownbeat) % beatsPerBar) + beatsPerBar) % beatsPerBar === 0
  return pathChords(smoothChords(chordEmission(beatProfiles), (t) => (atBar(t) ? CHANGE_AT_BAR : CHANGE_COST)))
}

// ── Chord names ──────────────────────────────────────────────────────────

const ROOT_SPELLING = { 1: ['C', 1], 3: ['E', -1], 6: ['F', 1], 8: ['A', -1], 10: ['B', -1] }
const HARMONY_KIND = { major: 'major', minor: 'minor', 7: 'dominant', maj7: 'major-seventh', m7: 'minor-seventh', sus2: 'suspended-second', sus4: 'suspended-fourth' }

/** A chord name as MusicXML: <harmony> with its root and kind. */
export function harmonyXml({ root, kind }) {
  const [step, alter] = ROOT_SPELLING[root] ?? [NAMES[root], 0]
  return `<harmony><root><root-step>${step}</root-step>${alter ? `<root-alter>${alter}</root-alter>` : ''}</root><kind text="${KIND_BY_QUALITY[kind].suffix}">${HARMONY_KIND[kind]}</kind></harmony>`
}
