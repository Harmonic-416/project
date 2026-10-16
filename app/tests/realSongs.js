import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseChordName } from '../src/tabs/guitar/practice/chordNames.js'
import { TRANSCRIBE, frameTime, notesFrom } from '../src/tabs/guitar/song/follow/refineWithBasicPitch.js'
import { TICKS_PER_QUARTER, buildTimeline } from '../src/tabs/guitar/song/follow/songTimeline.js'
import { draftScore, guitarNotes } from '../src/tabs/guitar/song/transcribe/pipeline.js'

/**
 * Real songs against a reference tab, for the transcription benchmark on
 * real recordings (realSongBenchmark.test.js). The songs and tabs are
 * copyrighted, so neither is in the repo; both come from paths in
 * environment variables.
 *
 * The models need Web Audio and want the GPU, so a browser run caches their
 * outputs for a song in a folder:
 *   stem.f32, mix.f32         the separated guitar and the whole song, 22.05 kHz mono
 *   bp-frames.f32, bp-onsets.f32, bp-contours.f32   Basic Pitch's output, frames × 88 (× contourBins)
 *   meta.json                 { seconds, frames, contourBins, bars (Beat This!), active, hopSeconds, … }
 * and everything after the models runs here, in seconds: draftOf() makes
 * the draft the app would, and compare() scores it against the reference.
 *
 * Both sides become onsets (onsetsOf): every moment notes start, in quarter
 * notes from the start of the score, with the notes' pitches, strings and
 * frets — repeats played out, tied notes part of the note they continue.
 */

/** A little-endian float32 file. */
function floats(file) {
  const bytes = readFileSync(file)
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}

/** Rows of `width` as plain arrays, the way Basic Pitch hands its output over in the browser. */
const rows = (data, width) => Array.from({ length: data.length / width }, (_, i) => Array.from(data.subarray(i * width, (i + 1) * width)))

export function loadCache(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))
  return {
    ...meta,
    stem: floats(join(dir, 'stem.f32')),
    mix: floats(join(dir, 'mix.f32')),
    output: {
      frames: rows(floats(join(dir, 'bp-frames.f32')), 88),
      onsets: rows(floats(join(dir, 'bp-onsets.f32')), 88),
      contours: rows(floats(join(dir, 'bp-contours.f32')), meta.contourBins),
    },
  }
}

/** The draft the app makes from the cached model outputs (pipeline.js's steps after the models). */
export function draftOf(cache, { thresholds = TRANSCRIBE } = {}) {
  const heard = notesFrom(cache.output, thresholds)
  const notes = guitarNotes(heard, { guitar: cache.stem, song: cache.mix, active: cache.active })
  return draftScore({ notes, frames: cache.output.frames, onsets: cache.output.onsets, bars: cache.bars, samples: cache.stem }, { frameTime })
}

/**
 * A loaded score's onsets: [{ beat (quarter notes from the start), notes:
 * [{ midi, string, fret }], muted (dead notes), chord (the name in force) }]
 * for `trackIndexes`, merged where they start together.
 */
export function onsetsOf(score, trackIndexes = [0]) {
  const byTick = new Map()
  for (const trackIndex of trackIndexes) {
    for (const entry of buildTimeline(score, { trackIndex }).entries) {
      const at = byTick.get(entry.tick) ?? { beat: entry.tick / TICKS_PER_QUARTER, notes: [], muted: 0, chord: null }
      for (const n of entry.notes) {
        if (n.note.isDead) at.muted += 1
        else at.notes.push({ midi: n.midi, string: n.string, fret: n.fret })
      }
      at.chord ??= entry.beats.map((b) => b.chord?.name).find(Boolean) ?? null
      byTick.set(entry.tick, at)
    }
  }
  const onsets = [...byTick.values()].sort((a, b) => a.beat - b.beat)
  let chord = null
  for (const o of onsets) {
    chord = o.chord ?? chord
    o.chord = chord
  }
  return onsets
}

const isBassProgram = (program) => program >= 32 && program <= 39 // General MIDI's basses

/**
 * The guitar tracks of a score worth comparing, by index: six (or more)
 * strings tuned like a guitar (a bass's low E1 is below any guitar's lowest
 * string), and not named or sounding as a bass or a voice — a tab site's
 * file usually has the whole band.
 */
export function guitarTracks(score) {
  return score.tracks
    .filter((t) => !/bass|vocal|voice/i.test(t.name ?? '') && !isBassProgram(t.playbackInfo?.program))
    .filter((t) => t.staves.some((s) => s.isStringed && !s.isPercussion && s.tuning.length >= 6 && Math.min(...s.tuning) >= 35))
    .map((t) => t.index)
}

const TOLERANCE = 0.13 // quarter notes: half a sixteenth either way
const SECTION = 16 // reference beats per section (four bars of 4/4)

const setF1 = (a, b) => {
  if (!a.length && !b.length) return 1
  const common = a.filter((x) => b.includes(x)).length
  return (2 * common) / (a.length + b.length)
}
const chordId = (name) => (name ? (parseChordName(name)?.id ?? name) : null)
const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null)

/** One-to-one matches between `ref` and `ours` onsets (`ours` moved by `offset` beats), nearest first, within TOLERANCE. */
function matchOnsets(ref, ours, offset) {
  const pairs = []
  const used = new Set()
  let j = 0
  for (const r of ref) {
    while (j < ours.length && ours[j].beat - offset < r.beat - TOLERANCE) j += 1
    let best = -1
    for (let k = j; k < ours.length && ours[k].beat - offset <= r.beat + TOLERANCE; k += 1) {
      if (!used.has(k) && (best < 0 || Math.abs(ours[k].beat - offset - r.beat) < Math.abs(ours[best].beat - offset - r.beat))) best = k
    }
    if (best >= 0) {
      used.add(best)
      pairs.push([r, ours[best]])
    }
  }
  return pairs
}

/** The offset (beats, in sixteenths) that lines `ours` up with `ref` best, searched within `range` of `around`. */
function bestOffset(ref, ours, around, range) {
  let best = { offset: around, matched: -1 }
  for (let k = -range * 4; k <= range * 4; k += 1) {
    const offset = around + k / 4
    const matched = matchOnsets(ref, ours, offset).length
    if (matched > best.matched || (matched === best.matched && Math.abs(offset - around) < Math.abs(best.offset - around))) best = { offset, matched }
  }
  return best.offset
}

/** Metrics for `ref` onsets against `ours` moved by `offset`. */
function measure(ref, ours, offset) {
  const pitchedRef = ref.filter((o) => o.notes.length)
  const pitchedOurs = ours.filter((o) => o.notes.length)
  const pairs = matchOnsets(pitchedRef, pitchedOurs, offset)
  const midis = (o) => o.notes.map((n) => n.midi)
  const frets = (o) => o.notes.map((n) => `${n.string}:${n.fret}`)
  let common = 0
  for (const [r, o] of pairs) common += midis(r).filter((m) => midis(o).includes(m)).length
  const refNotes = pitchedRef.reduce((s, o) => s + o.notes.length, 0)
  const ourNotes = pitchedOurs.reduce((s, o) => s + o.notes.length, 0)
  // Chords per beat: the reference's name in force against ours at the same moment.
  const chordAt = (onsets, beat) => {
    let name = null
    for (const o of onsets) {
      if (o.beat > beat + 1e-6) break
      name = o.chord
    }
    return chordId(name)
  }
  const beats = []
  if (ref.length) for (let b = Math.ceil(ref[0].beat); b <= ref.at(-1).beat; b += 1) beats.push(b)
  const named = beats.filter((b) => chordAt(ref, b))
  return {
    refOnsets: pitchedRef.length,
    ourOnsets: pitchedOurs.length,
    onsetRecall: pitchedRef.length ? pairs.length / pitchedRef.length : null,
    onsetPrecision: pitchedOurs.length ? pairs.length / pitchedOurs.length : null,
    refStrings: mean(pitchedRef.map((o) => o.notes.length)),
    ourStrings: mean(pitchedOurs.map((o) => o.notes.length)),
    noteF1: refNotes + ourNotes ? (2 * common) / (refNotes + ourNotes) : null,
    pitchF1: mean(pairs.map(([r, o]) => setF1(midis(r), midis(o)))),
    pitchClassF1: mean(pairs.map(([r, o]) => setF1([...new Set(midis(r).map((m) => m % 12))], [...new Set(midis(o).map((m) => m % 12))]))),
    tabF1: mean(pairs.map(([r, o]) => setF1(frets(r), frets(o)))),
    chords: named.length ? named.filter((b) => chordAt(ref, b) === chordAt(ours, b + offset)).length / named.length : null,
    mutedStrums: ref.filter((o) => !o.notes.length && o.muted).length,
  }
}

/**
 * The draft's onsets (`ours`) against the reference's (`ref`): lined up as a
 * whole (the bar and beat where the draft's bar 1 falls, and a ×2 or ×½
 * beat if the beat tracker counted in eighths or halves), then section by
 * section within two beats of that, so a beat the tracker lost or added
 * only costs its own section. Returns { offset, scale, overall, sections:
 * [{ beat, offset, …metrics }] }.
 */
export function compare(ref, ours, { maxShift = 64 } = {}) {
  let best = null
  for (const scale of [1, 2, 0.5]) {
    const scaled = ours.map((o) => ({ ...o, beat: o.beat * scale }))
    const offset = bestOffset(ref, scaled, 0, maxShift)
    const matched = matchOnsets(ref, scaled, offset).length
    if (!best || matched > best.matched) best = { scale, offset, matched, scaled }
  }
  const { scale, offset, scaled } = best
  const sections = []
  for (let from = Math.floor(ref[0]?.beat ?? 0); from <= (ref.at(-1)?.beat ?? 0); from += SECTION) {
    const inRef = ref.filter((o) => o.beat >= from && o.beat < from + SECTION)
    if (!inRef.length) continue
    const local = bestOffset(inRef, scaled, offset, 2)
    const inOurs = scaled.filter((o) => o.beat - local >= from - TOLERANCE && o.beat - local < from + SECTION - TOLERANCE)
    sections.push({ beat: from, offset: local, ...measure(inRef, inOurs, local) })
  }
  return { scale, offset, overall: measure(ref, scaled, offset), sections }
}

/** Without a reference: how many onsets per beat, how many strings each. */
export function describeOnsets(onsets, { beats }) {
  const pitched = onsets.filter((o) => o.notes.length)
  const sizes = {}
  for (const o of pitched) sizes[o.notes.length] = (sizes[o.notes.length] ?? 0) + 1
  return (
    `${pitched.length} onsets over ${beats} beats (${(pitched.length / beats).toFixed(2)} a beat), ` +
    `${(mean(pitched.map((o) => o.notes.length)) ?? 0).toFixed(2)} strings each, ` +
    `${((pitched.filter((o) => o.notes.length >= 3).length / Math.max(1, pitched.length)) * 100).toFixed(0)}% with 3+ | sizes ${JSON.stringify(sizes)}`
  )
}

const pct = (v) => (v === null ? '  - ' : `${Math.round(v * 100)}`.padStart(3) + '%')
const num = (v) => (v === null ? ' - ' : v.toFixed(1).padStart(3))

/** compare()'s result as a table. */
export function describeComparison(label, { scale, offset, overall, sections }) {
  const row = (m) =>
    `onsets R ${pct(m.onsetRecall)} P ${pct(m.onsetPrecision)} | strings ref ${num(m.refStrings)} ours ${num(m.ourStrings)} | ` +
    `notes F1 ${pct(m.noteF1)} | per strum: pitches ${pct(m.pitchF1)} pitch classes ${pct(m.pitchClassF1)} string+fret ${pct(m.tabF1)} | chords ${pct(m.chords)}`
  return [
    `${label}: lined up at beat ${offset} (×${scale}); reference ${overall.refOnsets} onsets (+${overall.mutedStrums} muted), ours ${overall.ourOnsets}`,
    `  overall      ${row(overall)}`,
    ...sections.map((s) => `  bar ${String(Math.floor(s.beat / 4) + 1).padStart(3)} (${String(s.offset).padStart(5)})  ${row(s)}`),
  ].join('\n')
}
