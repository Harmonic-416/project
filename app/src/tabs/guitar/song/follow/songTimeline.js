import * as alphaTab from '@coderline/alphatab'

/**
 * The Guitar Songs view's score model: every beat the practised track plays,
 * in playback order (repeats written out), with its time in seconds. Built
 * from alphaTab's own MIDI tick lookup — the same ticks its player and
 * cursor use — so judging, highlighting and playback share one clock, the
 * way the Vocal tab gets one from OSMD's cursor (vocal/notation/scoreModel.js).
 *
 * Ticks are the source of truth (alphaTab: 960 per quarter note); seconds
 * are always derived from the tempo map, so a playback-speed change never
 * moves a note. Pure (alphaTab's data model only, no rendering), so it runs
 * in Node for tests.
 *
 * Entry: { index, tick, endTick, time, duration, bar, barStartTick,
 *          barEndTick, beat, beats, notes: [{ midi, string, fret, note }],
 *          midi, kind: 'single' | 'chord', technique, letRing }
 * `string` uses tab numbering (1 = high e), like the tab and MusicXML.
 */

export const TICKS_PER_QUARTER = 960 // alphaTab's MidiUtils.QuarterTime (not exported)
const DEFAULT_BPM = 120

// Techniques the live judge can't hear reliably yet: the note is shown but
// not scored (see noteJudge.js). 'legato' and 'slide' notes are judged from
// the pitch change, since they have no pick attack.
export const UNSCORED_TECHNIQUES = new Set(['bend', 'dead', 'harmonic'])

const plain = (text) => (text ?? '').replace(/ /g, ' ').trim()

/**
 * Tracks a guitarist can practise, in score order: [{ index, name }] —
 * the stringed ones, or, in a file with no tab at all, every track that
 * isn't drums (judging needs pitches, not frets).
 */
export function practiceableTracks(score) {
  const named = (track) => ({ index: track.index, name: plain(track.name) || `Part ${track.index + 1}` })
  const pitched = score.tracks.filter((track) => track.staves.some((staff) => !staff.isPercussion))
  const stringed = pitched.filter((track) => track.staves.some((staff) => staff.isStringed && !staff.isPercussion))
  return (stringed.length ? stringed : pitched).map(named)
}

/** alphaTab's tick lookup for `score`, generated the way its player does (see exportGuitarNotation). */
export function tickLookupFor(score, settings = new alphaTab.Settings()) {
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(new alphaTab.midi.MidiFile(), true)
  const generator = new alphaTab.midi.MidiFileGenerator(score, settings, handler)
  generator.generate()
  return generator.tickLookup
}

/** [{ tick, bpm, seconds }] ascending: every tempo in playback order, with the time it starts. */
export function tempoMapFor(tickLookup) {
  const points = []
  for (const masterBar of tickLookup.masterBars) {
    for (const change of masterBar.tempoChanges) {
      const last = points[points.length - 1]
      if (last && last.tick === change.tick) last.bpm = change.tempo
      else if (!last || last.bpm !== change.tempo) points.push({ tick: change.tick, bpm: change.tempo })
    }
  }
  if (!points.length || points[0].tick > 0) points.unshift({ tick: 0, bpm: points[0]?.bpm ?? DEFAULT_BPM })
  let seconds = 0
  points.forEach((point, i) => {
    if (i > 0) {
      const previous = points[i - 1]
      seconds += ((point.tick - previous.tick) * 60) / (previous.bpm * TICKS_PER_QUARTER)
    }
    point.seconds = seconds
  })
  return points
}

function tempoAtTick(tempoMap, tick) {
  let point = tempoMap[0]
  for (const candidate of tempoMap) {
    if (candidate.tick > tick) break
    point = candidate
  }
  return point
}

export function ticksToSeconds(tempoMap, tick) {
  const point = tempoAtTick(tempoMap, tick)
  return point.seconds + ((tick - point.tick) * 60) / (point.bpm * TICKS_PER_QUARTER)
}

export function secondsToTicks(tempoMap, seconds) {
  let point = tempoMap[0]
  for (const candidate of tempoMap) {
    if (candidate.seconds > seconds) break
    point = candidate
  }
  return Math.round(point.tick + ((seconds - point.seconds) * point.bpm * TICKS_PER_QUARTER) / 60)
}

/** Tab numbering (1 = the highest string), from alphaTab's (1 = the lowest). */
function tabString(note) {
  const strings = note.beat.voice.bar.staff.tuning.length
  return strings ? strings - note.string + 1 : note.string
}

function techniqueOf(notes) {
  if (notes.some((n) => n.isDead)) return 'dead'
  if (notes.some((n) => n.harmonicType !== alphaTab.model.HarmonicType.None)) return 'harmonic'
  if (notes.some((n) => n.hasBend)) return 'bend'
  if (notes.every((n) => n.isHammerPullDestination)) return 'legato'
  if (notes.every((n) => n.slideOrigin)) return 'slide'
  return 'pick'
}

/**
 * The practised track's beats as entries (see the file comment). Notes tied
 * over from an earlier beat lengthen that beat's entry instead of starting a
 * new one; beats of several voices that start together become one entry.
 * Pass `tickLookup` to reuse the player's own (api.tickCache).
 */
export function buildTimeline(score, { trackIndex = 0, settings, tickLookup = tickLookupFor(score, settings) } = {}) {
  const tempoMap = tempoMapFor(tickLookup)
  const raw = []
  const entryByNote = new Map() // alphaTab Note → its entry, so ties can extend it

  tickLookup.masterBars.forEach((masterBar, occurrence) => {
    const seen = new Set()
    const atTick = new Map()
    for (let lookup = masterBar.firstBeat; lookup; lookup = lookup === masterBar.lastBeat ? null : lookup.nextBeat) {
      for (const { beat, playbackStart } of lookup.highlightedBeats) {
        if (beat.voice.bar.staff.track.index !== trackIndex || beat.isRest || seen.has(beat.id)) continue
        seen.add(beat.id)
        const tick = masterBar.start + playbackStart
        const endTick = tick + beat.playbackDuration
        const fresh = []
        for (const note of beat.notes) {
          if (note.isPercussion) continue
          const origin = note.isTieDestination ? entryByNote.get(note.tieOrigin) : null
          if (origin) {
            origin.endTick = Math.max(origin.endTick, endTick)
            entryByNote.set(note, origin)
          } else {
            fresh.push(note)
          }
        }
        if (!fresh.length) continue
        let entry = atTick.get(tick)
        if (!entry) {
          entry = {
            occurrence,
            tick,
            endTick,
            bar: masterBar.masterBar.index,
            barStartTick: masterBar.start,
            barEndTick: masterBar.end,
            beat,
            beats: [],
            alphaNotes: [],
          }
          atTick.set(tick, entry)
          raw.push(entry)
        }
        entry.endTick = Math.max(entry.endTick, endTick)
        entry.beats.push(beat)
        for (const note of fresh) {
          entry.alphaNotes.push(note)
          entryByNote.set(note, entry)
        }
      }
    }
  })

  const entries = raw
    .sort((a, b) => a.tick - b.tick)
    .map((entry, index) => {
      const notes = entry.alphaNotes
        .map((note) => ({ midi: note.realValue, string: tabString(note), fret: note.fret, note }))
        .sort((a, b) => a.midi - b.midi)
      const time = ticksToSeconds(tempoMap, entry.tick)
      return {
        index,
        tick: entry.tick,
        endTick: entry.endTick,
        time,
        duration: ticksToSeconds(tempoMap, entry.endTick) - time,
        bar: entry.bar,
        barStartTick: entry.barStartTick,
        barEndTick: entry.barEndTick,
        beat: entry.beat,
        beats: entry.beats,
        notes,
        midi: notes[notes.length - 1].midi, // the top note, for readouts
        kind: notes.length > 1 ? 'chord' : 'single',
        technique: techniqueOf(entry.alphaNotes),
        letRing: entry.alphaNotes.some((n) => n.isLetRing),
      }
    })

  const lastBar = tickLookup.masterBars[tickLookup.masterBars.length - 1]
  const endTick = lastBar ? lastBar.end : 0
  return { entries, tempoMap, endTick, duration: ticksToSeconds(tempoMap, endTick) }
}

/** Index of the first entry at or after `seconds` (the last entry past the end), or -1 with no entries. */
export function entryIndexAtTime(entries, seconds) {
  if (!entries.length) return -1
  const i = entries.findIndex((entry) => entry.time >= seconds - 1e-3)
  return i === -1 ? entries.length - 1 : i
}

/**
 * What to play, in tab terms: "string 2, fret 3" for one note, "0-2-2-0-0-0"
 * (low to high) for a chord; '' for notes without string/fret (no tab).
 */
export function fingeringLabel(entry) {
  if (!entry.notes.every((n) => n.string >= 1 && n.string <= 6 && n.fret >= 0)) return ''
  if (entry.kind === 'single') {
    const [{ string, fret }] = entry.notes
    return `string ${string}, fret ${fret}`
  }
  const frets = ['x', 'x', 'x', 'x', 'x', 'x'] // strings 6 … 1
  for (const { string, fret } of entry.notes) if (string >= 1 && string <= 6) frets[6 - string] = String(fret)
  return frets.join('-')
}
