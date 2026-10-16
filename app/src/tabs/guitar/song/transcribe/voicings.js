import { KINDS } from '../../practice/chordNames.js'
import { OPEN_STRING_MIDI } from '../../practice/chords.js'
import { heardPitches } from './strums.js'

/**
 * A chord shape for every strum. Basic Pitch hears a strummed chord as a
 * few of its strings at best, but which pitches sound just after the strum
 * (strums.js pitchEvidence) and the chord of the beat (chords.js) say a lot
 * more together: the shape a guitarist would hold is the playable voicing of
 * that chord that best explains what's heard. So:
 *
 *   - voicingsOf() makes every playable voicing of a chord — open chords,
 *     barres, the D shape, triads and partial shapes alike — from one rule:
 *     3 to 6 adjacent strings, the hand within four frets (anywhere up to
 *     fret 15) plus open strings, at most four fingers (a barre with the
 *     first finger counts as one), no note on two strings at once, every
 *     chord tone present (a seventh may drop its fifth), and the root in
 *     the bass unless the low E and A
 *     strings are left out (a triad on the top strings, any inversion);
 *   - each strum scores them against what's heard: a point for each of the
 *     shape's notes clearly sounding, a cost for a note in the shape not
 *     heard at all and for a strongly heard note it leaves out, and a bonus
 *     for having the heard bass. Voicings of the beat's recognised chord get
 *     a head start over those made from the heard notes alone;
 *   - a Viterbi pass over the strums prefers keeping the hand where it is:
 *     shapes that agree on every string both play (the same chord, or the
 *     top strings of it on an up-strum) cost nothing to move between.
 *
 * Shapes are written low E first, like practice/chords.js: frets[0] is the
 * low E string, −1 a string not played. Pure; unit-tested in
 * app/tests/voicings.test.js.
 */

const INTERVALS = Object.fromEntries(KINDS.map((k) => [k.quality, k.intervals]))
const HIGHEST_HAND = 12 // the hand's lowest fret, at most
const REACH = 3 // frets the other fingers reach above it
const MIN_STRINGS = 3

const SUPPORT = 0.3 // Basic Pitch activation at which a note is clearly sounding (a full point)
const HEARD = 0.12 // below this a note isn't heard at all …
const MISSING = 1 // … and costs this much in a shape
const STRONG = 0.3 // a pitch heard this strongly …
const LEFT_OUT = 0.5 // … costs this much if the shape leaves it out
const BASS = 0.5 // the shape's lowest note is the lowest strongly heard pitch
const CHORD_PRIOR = 0.5 // a voicing of the beat's recognised chord
const LOW = 0.02 // per fret up the neck: the same notes sound alike anywhere, so the lower shape wins a tie
const STRUMMED = 3 // pitches heard (≥ HEARD) for a strum to be a chord, not a picked note
const CHANGE = 0.6 // moving to a shape that disagrees on a string …
const MOVE = 0.15 // … plus this per fret the hand moves
const APART = 1.5 // seconds between strums after which the hand is free to start anywhere

const cache = new Map()

/** Every playable voicing of the chord with `root` (pitch class 0–11) and `intervals`: [{ frets, midis, hand }]. */
export function voicingsOf(root, intervals) {
  const key = `${root}:${intervals.join(',')}`
  if (cache.has(key)) return cache.get(key)
  const pcs = new Set(intervals.map((i) => (root + i) % 12))
  const optional = intervals.length >= 4 ? (root + 7) % 12 : null // a seventh chord's fifth
  const required = [...pcs].filter((pc) => pc !== optional)
  const found = new Map()
  const frets = new Array(6).fill(-1)

  const consider = (lo, hi) => {
    const midis = []
    const fretted = []
    for (let s = lo; s <= hi; s += 1) {
      midis.push(OPEN_STRING_MIDI[s] + frets[s])
      if (frets[s] > 0) fretted.push(frets[s])
    }
    if (new Set(midis).size < midis.length) return // the same note on two strings: not a chord shape
    const present = new Set(midis.map((m) => m % 12))
    if (!required.every((pc) => present.has(pc))) return
    if (lo < 2 && midis[0] % 12 !== root) return // the root in the bass, unless only the top strings play
    if (fretted.length > 4) {
      // A barre: the first finger across the lowest fret, from the lowest string on it up; the rest fretted above it.
      const bar = Math.min(...fretted)
      const from = frets.findIndex((f) => f === bar)
      for (let s = from; s <= hi; s += 1) if (frets[s] < bar) return
      if (1 + fretted.filter((f) => f > bar).length > 4) return
    }
    const key = frets.join(',')
    if (!found.has(key)) found.set(key, { frets: frets.slice(), midis, hand: fretted.length ? Math.min(...fretted) : 0 })
  }

  for (let hand = 0; hand <= HIGHEST_HAND; hand += 1) {
    const reachable = [0]
    for (let f = Math.max(1, hand); f <= hand + REACH; f += 1) reachable.push(f)
    for (let lo = 0; lo <= 6 - MIN_STRINGS; lo += 1) {
      for (let hi = lo + MIN_STRINGS - 1; hi < 6; hi += 1) {
        const visit = (s) => {
          if (s > hi) return consider(lo, hi)
          for (const f of reachable) {
            if (!pcs.has((OPEN_STRING_MIDI[s] + f) % 12)) continue
            frets[s] = f
            visit(s + 1)
          }
          frets[s] = -1
        }
        visit(lo)
      }
    }
  }
  const voicings = [...found.values()]
  cache.set(key, voicings)
  return voicings
}

/** How well `voicing` explains `evidence`. */
function fit(voicing, evidence, strong) {
  let score = 0
  for (const m of voicing.midis) {
    score += Math.min(1, evidence[m] / SUPPORT)
    if (evidence[m] < HEARD) score -= MISSING
  }
  for (const m of strong) if (!voicing.midis.includes(m)) score -= LEFT_OUT
  if (strong.length && voicing.midis[0] === strong[0]) score += BASS
  return score - LOW * voicing.hand
}

/**
 * The voicings worth considering for one strum, best first, each with its
 * `score`: those of the beat's `chord` ({ root, kind }), and those of the
 * chord the heard pitches make on their own (their four strongest pitch
 * classes over the lowest). None for a strum that isn't a chord
 * (`strummed` false: a picked note, strums.js chordStrums) or with fewer
 * than three pitches heard.
 */
export function candidatesFor({ evidence, chord, strummed = true }, { keep = 16 } = {}) {
  const heard = heardPitches(evidence, HEARD)
  if (!strummed || heard.length < STRUMMED) return []
  const strong = heardPitches(evidence, STRONG)
  const pool = new Map()
  const add = (voicings, prior) => {
    for (const v of voicings) {
      const key = v.frets.join(',')
      const score = fit(v, evidence, strong) + prior
      if (!pool.has(key) || pool.get(key).score < score) pool.set(key, { ...v, score })
    }
  }
  if (chord && INTERVALS[chord.kind]) add(voicingsOf(chord.root, INTERVALS[chord.kind]), CHORD_PRIOR)
  const weight = new Array(12).fill(0)
  for (const m of heard) weight[m % 12] += evidence[m]
  const bass = heard[0] % 12
  const pcs = weight
    .map((w, pc) => ({ w, pc }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w)
    .slice(0, 4)
    .map((x) => x.pc)
  if (!pcs.includes(bass)) pcs.push(bass)
  add(voicingsOf(bass, [...new Set(pcs.map((pc) => (pc - bass + 12) % 12))].sort((a, b) => a - b)), 0)
  return [...pool.values()].sort((a, b) => b.score - a.score).slice(0, keep)
}

/** The cost of moving the hand from shape `a` to shape `b`: nothing if they agree on every string both play. */
export function changeCost(a, b) {
  for (let s = 0; s < 6; s += 1) {
    if (a.frets[s] >= 0 && b.frets[s] >= 0 && a.frets[s] !== b.frets[s]) return CHANGE + MOVE * Math.abs(a.hand - b.hand)
  }
  return 0
}

/**
 * A shape for each strum: `strums` are [{ time, evidence, chord }] in time
 * order (see candidatesFor). Returns, per strum, { frets, midis, hand } or
 * null where it's not a chord (a picked note, or silence).
 */
export function voiceStrums(strums) {
  const options = strums.map((s) => candidatesFor(s))
  const chosen = new Array(strums.length).fill(null)
  let i = 0
  while (i < strums.length) {
    if (!options[i].length) {
      i += 1
      continue
    }
    // A run of chords close enough together for the hand to carry over.
    const run = [i]
    while (i + 1 < strums.length && options[i + 1].length && strums[i + 1].time - strums[i].time < APART) run.push((i += 1))
    i += 1
    let totals = options[run[0]].map((o) => o.score)
    const back = []
    for (let r = 1; r < run.length; r += 1) {
      const here = options[run[r]]
      const before = options[run[r - 1]]
      const from = []
      totals = here.map((o) => {
        let best = -Infinity
        let at = 0
        before.forEach((p, k) => {
          const t = totals[k] - changeCost(p, o)
          if (t > best) {
            best = t
            at = k
          }
        })
        from.push(at)
        return best + o.score
      })
      back.push(from)
    }
    let k = totals.indexOf(Math.max(...totals))
    for (let r = run.length - 1; r >= 0; r -= 1) {
      const { frets, midis, hand } = options[run[r]][k]
      chosen[run[r]] = { frets, midis, hand }
      if (r > 0) k = back[r - 1][k]
    }
  }
  return chosen
}
