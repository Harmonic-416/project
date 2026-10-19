import { KINDS } from '../../guitar/practice/chordNames.js'
import { beatClock } from '../../guitar/song/transcribe/beatWarp.js'
import { chordId, harmonyXml } from '../../guitar/song/transcribe/chords.js'
import { SLOTS_PER_BEAT, partXml, scoreXml } from '../../guitar/song/transcribe/scoreXml.js'
import { placeLyrics } from './lyrics.js'

/**
 * A song's tune and chords → a new arrangement of it for voices (TTBB, SATB
 * or two parts), the way an arranger writes a simple a cappella cover:
 *   - the lead singer's melody (leadLine: Basic Pitch's notes on the
 *     separated vocals, cut to one line) goes to one part, moved to the key
 *     that best fits that part's range (bestShift);
 *   - the other parts sing the song's chords (chords.js's, one per beat)
 *     under it in block harmony: a new chord with every melody note that is
 *     on an eighth and either belongs to the chord or is held, and with
 *     every chord change; short passing notes are sung over held harmony.
 *     Where the tune rests a beat or more, the other parts keep singing the
 *     chords ("oo"), restated each bar;
 *   - each chord is voiced by a Viterbi pass over the candidate voicings:
 *     chord tones in each part's range, parts in order and not crossing the
 *     melody, the bass on the root where it can be, the root and third
 *     present, no doubled third or seventh, smooth motion and no parallel
 *     fifths or octaves from one chord to the next.
 * Not a transcription of what the singers on the recording sing: a lead
 * vocal is one line, and Basic Pitch can't reliably pull several voices
 * apart, so the harmony parts are written new from the chords.
 *
 *   note (Basic Pitch's): { startTimeSeconds, durationSeconds, pitchMidi, amplitude }
 *   event: { start, end (sixteenths from the start of bar 1), midi }
 *
 * Pure; unit-tested in app/tests/arrange.test.js.
 */

const TREBLE = '<clef><sign>G</sign><line>2</line></clef>'
const TENOR = '<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>'
const BASS = '<clef><sign>F</sign><line>4</line></clef>'

/** The ensembles, top part first; `low`/`high` are each part's range as MIDI notes. `melody`: where the tune can go. */
export const VOICINGS = {
  ttbb: {
    label: 'TTBB',
    voices: [
      { name: 'Tenor 1', low: 50, high: 69, clef: TENOR },
      { name: 'Tenor 2', low: 47, high: 65, clef: TENOR },
      { name: 'Baritone', low: 43, high: 62, clef: BASS },
      { name: 'Bass', low: 38, high: 57, clef: BASS },
    ],
    melody: [0, 1],
  },
  satb: {
    label: 'SATB',
    voices: [
      { name: 'Soprano', low: 60, high: 79, clef: TREBLE },
      { name: 'Alto', low: 55, high: 74, clef: TREBLE },
      { name: 'Tenor', low: 48, high: 67, clef: TENOR },
      { name: 'Bass', low: 40, high: 60, clef: BASS },
    ],
    melody: [0],
  },
  tb: {
    label: 'Two parts (TB)',
    voices: [
      { name: 'Tenor', low: 48, high: 69, clef: TENOR },
      { name: 'Bass', low: 40, high: 62, clef: BASS },
    ],
    melody: [0],
  },
}

// ── The tune ─────────────────────────────────────────────────────────────

const MIN_SECONDS = 0.08 // shorter than this is a slide or a consonant, not a note
const OVERLAP_SLACK = 0.03 // notes overlapping by less than this follow one another
const SAME_ONSET = 0.08 // seconds: a stronger note starting this soon after replaces the one before
const OVERTONES = [12, 19, 24] // an octave, a twelfth, two octaves: what a voice's overtones sound like as notes

const strength = (n) => n.amplitude * Math.min(n.end - n.start, 1)

/**
 * The lead singer's line from Basic Pitch's `notes` on the separated
 * vocals: one note at a time, as [{ start, end (seconds), midi, amplitude }].
 * Where notes overlap, the overtones of a sung note go, and of two voices
 * the stronger one sings.
 */
export function leadLine(notes) {
  const sorted = notes
    .filter((n) => n.durationSeconds >= MIN_SECONDS)
    .map((n) => ({ start: n.startTimeSeconds, end: n.startTimeSeconds + n.durationSeconds, midi: n.pitchMidi, amplitude: n.amplitude ?? 0.5 }))
    .sort((a, b) => a.start - b.start || b.amplitude - a.amplitude)
  const line = []
  for (const note of sorted) {
    const last = line.at(-1)
    if (!last || note.start >= last.end - OVERLAP_SLACK) {
      line.push(note)
      continue
    }
    const above = note.midi - last.midi
    if (OVERTONES.includes(above) && note.amplitude < last.amplitude * 1.5) continue
    const lastIsOvertone = OVERTONES.includes(-above) && last.amplitude < note.amplitude * 1.5
    if (lastIsOvertone && note.start - last.start < SAME_ONSET) {
      line[line.length - 1] = note
      continue
    }
    if (!lastIsOvertone && strength(note) <= strength(last)) continue
    if (note.start - last.start < SAME_ONSET) line[line.length - 1] = note
    else {
      last.end = note.start
      line.push(note)
    }
  }
  return line.filter((n) => n.end - n.start >= MIN_SECONDS)
}

/** `line` (leadLine's) on the beat grid: one note per sixteenth, each ending by the next, at least a sixteenth long. */
export function placeLine(line, toSlot) {
  const placed = []
  for (const n of line) {
    const start = toSlot(n.start)
    if (placed.length && placed.at(-1).start >= start) continue
    placed.push({ start, end: toSlot(n.end), midi: n.midi })
  }
  return placed.map((e, i) => ({ ...e, end: Math.min(Math.max(e.end, e.start + 1), placed[i + 1]?.start ?? Infinity) }))
}

const outside = (midi, { low, high }) => (midi < low ? low - midi : midi > high ? midi - high : 0)
const KEY_COST = 0.15 // per semitone the key moves: a little out of range beats a new key

/**
 * The transposition (semitones, −24 … 24) that best fits `events` (the
 * tune) in `voice`'s range: least singing outside it, weighted by length,
 * then the nearest key (an octave away is the same key), then the middle
 * of the range. `octavesOnly` keeps the song's key.
 */
export function bestShift(events, voice, { octavesOnly = false } = {}) {
  const total = events.reduce((sum, e) => sum + (e.end - e.start), 0) || 1
  const mean = events.reduce((sum, e) => sum + e.midi * (e.end - e.start), 0) / total
  const centre = (voice.low + voice.high) / 2
  let best = { shift: 0, cost: Infinity }
  for (let shift = -24; shift <= 24; shift += 1) {
    const steps = ((shift % 12) + 12) % 12
    if (octavesOnly && steps) continue
    const away = events.reduce((sum, e) => sum + outside(e.midi + shift, voice) * (e.end - e.start), 0) / total
    const cost = away + KEY_COST * Math.min(steps, 12 - steps) + 0.01 * Math.abs(mean + shift - centre)
    if (cost < best.cost) best = { shift, cost }
  }
  return best.shift
}

const REACH = 4 // semitones past a part's range a note may go before it's taken for an octave error

/**
 * A tune's note moved by octaves to within REACH of `voice`'s range: one
 * that far out is Basic Pitch hearing an overtone (or a note an octave
 * low), and no singer of that part could sing it as written anyway.
 */
export function reach(midi, voice) {
  let p = midi
  while (p > voice.high + REACH && p - 12 >= voice.low - REACH) p -= 12
  while (p < voice.low - REACH && p + 12 <= voice.high + REACH) p += 12
  return p
}

// ── The key ──────────────────────────────────────────────────────────────

// Krumhansl–Kessler key profiles.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5] // C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const KIND = Object.fromEntries(KINDS.map((k) => [k.quality, k]))

const correlation = (a, b) => {
  const ma = a.reduce((s, v) => s + v, 0) / 12
  const mb = b.reduce((s, v) => s + v, 0) / 12
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < 12; i += 1) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

/**
 * The key of a tune (`events`) over its `chords` (one per beat, or null):
 * { tonic (0…11), minor, fifths (the key signature), name ('Eb major') },
 * by the Krumhansl–Schmuckler method on how long each pitch class sounds,
 * the tune's and the chords' alike.
 */
export function estimateKey(events, chords) {
  const weight = new Array(12).fill(0)
  for (const e of events) weight[e.midi % 12] += (e.end - e.start) / SLOTS_PER_BEAT
  for (const chord of chords) {
    if (!chord) continue
    for (const interval of KIND[chord.kind].intervals) weight[(chord.root + interval) % 12] += 1
  }
  let best = { tonic: 0, minor: false, score: -Infinity }
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const rotated = weight.map((_, i) => weight[(i + tonic) % 12])
    for (const [minor, profile] of [[false, MAJOR], [true, MINOR]]) {
      const score = correlation(rotated, profile)
      if (score > best.score) best = { tonic, minor, score }
    }
  }
  const { tonic, minor } = best
  const fifths = MAJOR_FIFTHS[minor ? (tonic + 3) % 12 : tonic]
  const name = `${(fifths < 0 ? FLAT_NAMES : SHARP_NAMES)[tonic]} ${minor ? 'minor' : 'major'}`
  return { tonic, minor, fifths, name }
}

// ── The harmony ──────────────────────────────────────────────────────────

const chordTones = (chord) => KIND[chord.kind].intervals.map((i) => (chord.root + i) % 12)

/**
 * Where the harmony parts sing a new chord, and what over: [{ start, end,
 * chord, melody (the tune's note at the start, or null), low, high (the
 * tune's lowest and highest pitch in the segment, or null) }], chord null
 * for silence. `chordAt(slot)` is the chord on the beat a sixteenth is in.
 */
export function harmonySegments(melody, chordAt, { measures, beatsPerBar }) {
  const perBar = beatsPerBar * SLOTS_PER_BEAT
  const total = measures * perBar
  const sounding = (slot) => melody.find((e) => e.start <= slot && e.end > slot) ?? null
  const starts = new Set([0])
  let previous
  for (let slot = 0; slot < total; slot += SLOTS_PER_BEAT) {
    const chord = chordAt(slot)
    if (chord?.id !== previous?.id) starts.add(slot)
    previous = chord
  }
  melody.forEach((note, i) => {
    const chord = chordAt(note.start)
    const onEighth = note.start % (SLOTS_PER_BEAT / 2) === 0
    if (onEighth && chord && (chordTones(chord).includes(note.midi % 12) || note.end - note.start >= SLOTS_PER_BEAT)) starts.add(note.start)
    // A rest of a beat or more: the harmony goes on, voiced afresh without the tune.
    const next = melody[i + 1]?.start ?? total
    if (next - note.end >= SLOTS_PER_BEAT) starts.add(note.end)
  })
  // While the tune rests, the chords are restated every bar.
  for (let bar = perBar; bar < total; bar += perBar) if (!sounding(bar)) starts.add(bar)

  const ordered = [...starts].filter((s) => s < total).sort((a, b) => a - b)
  return ordered.map((start, i) => {
    const end = ordered[i + 1] ?? total
    const over = melody.filter((e) => e.start < end && e.end > start)
    return {
      start,
      end,
      chord: chordAt(start),
      melody: sounding(start)?.midi ?? null,
      low: over.length ? Math.min(...over.map((e) => e.midi)) : null,
      high: over.length ? Math.max(...over.map((e) => e.midi)) : null,
    }
  })
}

const KEEP = 40 // candidate voicings per chord, best first

/** The candidate voicings of one segment for the parts `harmony` (indices), as [{ pitches (by part, the tune's part null), cost }]. */
function candidates(segment, voices, tune, harmony) {
  const tones = chordTones(segment.chord)
  const kind = segment.chord.kind
  const [root, third, fifth, seventh] = tones
  const hasThird = kind !== 'sus2' && kind !== 'sus4'
  const options = harmony.map((v) => {
    const out = []
    for (let p = voices[v].low; p <= voices[v].high; p += 1) if (tones.includes(p % 12)) out.push(p)
    return out
  })
  const results = []
  const pitches = new Array(voices.length).fill(null)
  const lowest = voices.length - 1
  const local = () => {
    let cost = 0
    const sung = pitches.map((p, v) => (v === tune ? segment.melody : p))
    // Parts in order, apart enough, and not crossing the tune.
    for (const v of harmony) {
      const p = pitches[v]
      if (segment.high !== null && v < tune && p <= segment.high) cost += 20
      if (segment.low !== null && v > tune && p >= segment.low) cost += 20
      const centre = (voices[v].low + voices[v].high) / 2
      cost += 0.04 * Math.abs(p - centre) + 0.4 * Math.max(0, voices[v].low + 2 - p, p - (voices[v].high - 2))
    }
    for (let v = 0; v + 1 < voices.length; v += 1) {
      const [a, b] = [sung[v], sung[v + 1]]
      if (a === null || b === null) continue
      if (a <= b) cost += 20
      const room = v + 1 === lowest ? 19 : 12
      if (a - b > room) cost += 1.5 * (a - b - room)
    }
    // The bass on the root, or else an inversion.
    const bass = sung[lowest]
    if (bass !== null) {
      const pc = bass % 12
      cost += pc === root ? 0 : pc === third && hasThird ? 1.2 : pc === fifth ? 2 : 2.5
    }
    // The chord complete, without the wrong doublings.
    const count = (pc) => sung.filter((p) => p !== null && p % 12 === pc).length
    if (!count(root)) cost += 3
    if (hasThird && !count(third)) cost += 2.5
    if (!count(fifth)) cost += 0.4
    if (seventh !== undefined && !count(seventh)) cost += 1
    if (hasThird && count(third) > 1) cost += 1.2
    if (seventh !== undefined && count(seventh) > 1) cost += 3
    return cost
  }
  const walk = (k) => {
    if (k === harmony.length) {
      results.push({ pitches: pitches.slice(), cost: local() })
      return
    }
    for (const p of options[k]) {
      // Each part below the one before it (the parts in `harmony` run top to bottom).
      if (k > 0 && p >= pitches[harmony[k - 1]]) continue
      pitches[harmony[k]] = p
      walk(k + 1)
    }
    pitches[harmony[k]] = null
  }
  walk(0)
  return results.sort((a, b) => a.cost - b.cost).slice(0, KEEP)
}

/** Moving from one voicing to the next: how far the parts go (the bass may leap), and parallel fifths and octaves. */
function motionCost(before, after, voices, harmony) {
  let cost = 0
  for (const v of harmony) {
    const move = Math.abs(after[v] - before[v])
    const weight = v === voices.length - 1 ? 0.5 : 1
    cost += weight * (0.12 * move + 0.25 * Math.max(0, move - 7))
  }
  for (let a = 0; a < voices.length; a += 1) {
    for (let b = a + 1; b < voices.length; b += 1) {
      if ([before[a], before[b], after[a], after[b]].includes(null)) continue
      const was = (before[a] - before[b]) % 12
      const is = (after[a] - after[b]) % 12
      const same = (after[a] - before[a]) * (after[b] - before[b]) > 0
      if (same && was === is && (is === 0 || is === 7)) cost += 1.5
    }
  }
  return cost
}

/**
 * The harmony parts' pitches for `segments` (harmonySegments'), as one
 * array per segment (by part; the tune's part and silent segments null),
 * chosen together by a Viterbi pass over each stretch of sung chords.
 */
export function voiceSegments(segments, voices, tune) {
  const harmony = voices.map((_, v) => v).filter((v) => v !== tune)
  const out = segments.map(() => null)
  let i = 0
  while (i < segments.length) {
    if (!segments[i].chord) {
      i += 1
      continue
    }
    let j = i
    while (j < segments.length && segments[j].chord) j += 1
    // Segments i … j - 1 sing without a break.
    const layers = []
    for (let s = i; s < j; s += 1) {
      const options = candidates(segments[s], voices, tune, harmony)
      const withTune = (pitches) => pitches.map((p, v) => (v === tune ? segments[s].melody : p))
      if (s === i) layers.push(options.map((o) => ({ ...o, total: o.cost, from: -1 })))
      else {
        layers.push(
          options.map((o) => {
            let best = { total: Infinity, from: -1 }
            layers.at(-1).forEach((prev, k) => {
              const total = prev.total + o.cost + motionCost(prev.pitches, withTune(o.pitches), voices, harmony)
              if (total < best.total) best = { total, from: k }
            })
            return { ...o, ...best }
          }),
        )
      }
      // With the tune's pitch filled in, for the motion to the next segment.
      layers.at(-1).forEach((o) => {
        o.pitches = withTune(o.pitches)
      })
    }
    let k = layers.at(-1).reduce((best, o, n, all) => (o.total < all[best].total ? n : best), 0)
    for (let s = j - 1; s >= i; s -= 1) {
      const chosen = layers[s - i][k]
      out[s] = chosen.pitches.map((p, v) => (v === tune ? null : p))
      k = chosen.from
    }
    i = j
  }
  return out
}

// ── The score ────────────────────────────────────────────────────────────

const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The arrangement. `notes` are Basic Pitch's on the separated vocals,
 * `chords` the song's chord on each beat (chords.js), `bars` its beats
 * (beats.js: { beats, beatsPerBar, firstDownbeat }). Options: `voicing`
 * (a VOICINGS key), `melodyPart` (the part that sings the tune, one of
 * that voicing's `melody`), `keepKey` (move the tune by octaves only),
 * `title`. `words` (lyrics.js's, timed in the recording) are written under
 * the tune, and under the other parts where they sing with it; where they
 * hold the chords alone, they sing "oo". Returns { musicXml, parts: [{
 * name, events }], voicing, melodyPart (the part with the tune), shift
 * (semitones the song moved), key, bpm, beatsPerBar, measures, lyrics
 * (whether any words were placed) }, or null when no singing was heard.
 */
export function arrangeSong({ notes, chords, bars, words = null }, { voicing = 'ttbb', melodyPart = 0, keepKey = false, title = '' } = {}) {
  const ensemble = VOICINGS[voicing]
  if (!ensemble) throw new Error(`No such voicing: ${voicing}`)
  const tune = ensemble.melody.includes(melodyPart) ? melodyPart : ensemble.melody[0]
  const { voices } = ensemble
  const line = leadLine(notes)
  if (!line.length) return null

  const beatsPerBar = bars.beatsPerBar ?? 4
  const firstDownbeat = bars.firstDownbeat ?? 0
  const { toBeats, period } = beatClock(bars.beats)
  // Bar 1 is a bar before the tune comes in (a long intro is left out).
  const earliest = toBeats(line[0].start)
  const origin = firstDownbeat + (Math.floor((earliest + 0.5 / SLOTS_PER_BEAT - firstDownbeat) / beatsPerBar) - 1) * beatsPerBar
  const toSlot = (seconds) => Math.round((toBeats(seconds) - origin) * SLOTS_PER_BEAT)
  const placed = placeLine(line, toSlot)

  const shift = bestShift(placed, voices[tune], { octavesOnly: keepKey })
  const steps = ((shift % 12) + 12) % 12
  const tuned = placed.map((e) => ({ ...e, midi: reach(e.midi + shift, voices[tune]) }))
  const melody = words?.length ? placeLyrics(tuned, words, toSlot) : tuned
  const moved = (chord) => (chord ? { root: (chord.root + steps) % 12, kind: chord.kind, id: chordId((chord.root + steps) % 12, chord.kind) } : null)
  const perBar = beatsPerBar * SLOTS_PER_BEAT
  const measures = Math.ceil(melody.at(-1).end / perBar) + 1 // and a bar after it ends
  const chordAt = (slot) => moved(chords[origin + Math.floor(slot / SLOTS_PER_BEAT)] ?? null)

  const segments = harmonySegments(melody, chordAt, { measures, beatsPerBar })
  const voiced = voiceSegments(segments, voices, tune)
  // The other parts sing the tune's syllable when they start with it, and "oo" holding chords on their own.
  const lyricAt = new Map(melody.filter((e) => e.lyric).map((e) => [e.start, e.lyric]))
  const sung = lyricAt.size > 0
  const harmonyLyric = (i) => {
    if (!sung) return null
    const s = segments[i]
    if (s.melody !== null) return lyricAt.get(s.start) ?? null
    return i === 0 || segments[i - 1].melody !== null || !voiced[i - 1] ? { text: 'oo', syllabic: 'single' } : null
  }
  const parts = voices.map((voice, v) => ({
    name: voice.name,
    events:
      v === tune
        ? melody
        : segments.flatMap((s, i) => {
            if (!voiced[i]) return []
            const lyric = harmonyLyric(i)
            return [{ start: s.start, end: s.end, midi: voiced[i][v], ...(lyric ? { lyric } : {}) }]
          }),
  }))

  const songChords = Array.from({ length: measures * beatsPerBar }, (_, b) => chordAt(b * SLOTS_PER_BEAT))
  const key = estimateKey(melody, songChords)
  const harmonies = []
  songChords.forEach((chord, b) => {
    if (chord && chord.id !== songChords[b - 1]?.id) harmonies.push({ slot: b * SLOTS_PER_BEAT, xml: harmonyXml(chord) })
  })
  const bpm = 60 / period
  const xml = parts.map((part, v) => ({
    id: `P${v + 1}`,
    name: part.name,
    xml: partXml(part.events, {
      id: `P${v + 1}`,
      beatsPerBar,
      measures,
      clef: voices[v].clef,
      fifths: key.fifths,
      tempo: bpm,
      harmonies: v === 0 ? harmonies : [],
    }),
  }))
  let musicXml = scoreXml(xml)
  if (title) musicXml = musicXml.replace('<score-partwise version="4.0">', `<score-partwise version="4.0"><work><work-title>${escapeXml(title)}</work-title></work>`)
  return { musicXml, parts, voicing, melodyPart: tune, shift, key, bpm, beatsPerBar, measures, lyrics: sung }
}
