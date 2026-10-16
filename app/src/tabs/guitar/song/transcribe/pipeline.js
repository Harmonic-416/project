import { assignFrets, playableChord } from '../../notation/fretAssign.js'
import { OPEN_STRING_MIDI } from '../../practice/chords.js'
import { bufferOf, decodeFile, resample } from './audio.js'
import { barOrigin, beatClock, cleanNotes } from './beatWarp.js'
import { dropBleed } from './bleed.js'
import { beatChroma, harmonyXml, recognizeChords } from './chords.js'
import { dropGhostNotes } from './ghostNotes.js'
import { HOP_SECONDS, YAMNET_RATE, frameLevels, guitarFrames, screenRecording, yamnetScores } from './guitarPresence.js'
import { loadRuntime } from './onnx.js'
import { SLOTS_PER_BEAT, partXml, scoreXml } from './scoreXml.js'
import { chordStrums, findStrums, heardPitches, pitchEvidence, struckPitches } from './strums.js'
import { voiceStrums } from './voicings.js'

/**
 * A song → the guitarist's part of it, as a draft tab, on this device
 * (nothing is uploaded). Not the whole song squeezed onto a guitar: only
 * what the guitar in it plays, the way a band's guitarist learns their part.
 *
 *   decode    the file, then at each model's rate (audio.js)
 *   listen    YAMNet on the whole song (guitarPresence.js): a recording of
 *             just a guitar needs no separating
 *   isolate   the guitar pulled out of the band (separate.js, htdemucs_6s),
 *             then where it really plays: loud enough against the song, and
 *             not some other instrument leaking in. Too little of that and
 *             the song has no guitar part
 *   notes     Basic Pitch on the guitar alone, without ghost notes
 *             (ghostNotes.js), what other instruments bled into it
 *             (bleed.js), or anything where the guitar doesn't play
 *   beats     Beat This! on the whole song (steadier than the guitar alone)
 *   tab       the notes on the song's beat, chord names over them, as one
 *             "Guitar" part; opening it frets every note (loadGuitarNotation)
 *
 * Basic Pitch (TensorFlow.js) and the ONNX models are loaded only when a
 * transcription starts.
 */

// Each stage's share of the progress bar on the CPU (`weight`) and on a graphics card (`gpuWeight`,
// timed on "By The Way", 3:38: 48 s on an RTX 5090, isolating 24 s of it and Basic Pitch 18 s).
export const STAGES = [
  { id: 'decode', label: 'Reading the audio', weight: 0.03, gpuWeight: 0.07 },
  { id: 'listen', label: 'Listening for a guitar', weight: 0.03, gpuWeight: 0.04 },
  { id: 'isolate', label: 'Isolating the guitar', weight: 0.6, gpuWeight: 0.5 },
  { id: 'notes', label: 'Listening for notes', weight: 0.25, gpuWeight: 0.36 },
  { id: 'beats', label: 'Finding the beat', weight: 0.07, gpuWeight: 0.02 },
  { id: 'tab', label: 'Writing the tab', weight: 0.02, gpuWeight: 0.01 },
]

export const MAX_SECONDS = 10 * 60
export const MAX_BYTES = 100 * 1024 * 1024
const RATE = 22050 // Basic Pitch's and Beat This!'s

/** "Riff take 2.mp3" → "Riff take 2". */
const titleOf = (filename) => filename.replace(/\.[a-z0-9]+$/i, '').trim() || 'Recording'

/**
 * Transcribe the guitar of `file` (a File or Blob with a name).
 * `onProgress({ stage, label, value, device })`: `value` is the whole job's
 * 0 … 1, `device` where the separator runs: 'gpu' (a graphics card, the
 * whole job about 7× faster) or 'cpu' (also if the card gives out partway).
 * `signal` (an AbortSignal) cancels. `anyway` transcribes even when no
 * guitar was found.
 *
 * Returns { status: 'no-guitar', heard } when there's no guitar part to
 * teach (`heard`: the share of the song with guitar, 0 … 1), or { status:
 * 'ok', musicXml, title, bpm, beatsPerBar, chords, isolated, heard }:
 * `musicXml` the draft (open it with loadGuitarNotation), `chords` the chord
 * ids in order of use, `isolated` whether the guitar was separated from a
 * band (false: the recording was a guitar on its own).
 */
export async function transcribeFile(file, { onProgress, signal, anyway = false } = {}) {
  if (file.size > MAX_BYTES) throw new Error('That file is over 100 MB. Try a shorter recording.')
  const { gpu } = await loadRuntime()
  let device = gpu ? 'gpu' : 'cpu'
  const share = (s) => (gpu ? s.gpuWeight : s.weight)
  let done = 0
  const stage = (id) => {
    const at = STAGES.findIndex((s) => s.id === id)
    done = STAGES.slice(0, at).reduce((sum, s) => sum + share(s), 0)
    const { label } = STAGES[at]
    const weight = share(STAGES[at])
    onProgress?.({ stage: id, label, value: done, device })
    return (fraction) => onProgress?.({ stage: id, label, value: done + weight * Math.min(1, Math.max(0, fraction)), device })
  }

  stage('decode')
  let decoded
  try {
    decoded = await decodeFile(file)
  } catch {
    throw new Error('This file couldn’t be read as audio. Try an MP3, WAV, M4A or OGG.')
  }
  if (decoded.duration > MAX_SECONDS) throw new Error('That recording is over 10 minutes. Try a shorter one.')
  const song = (await resample(decoded, 1, RATE)).getChannelData(0)
  const song16k = (await resample(decoded, 1, YAMNET_RATE)).getChannelData(0)
  signal?.throwIfAborted()

  stage('listen')
  const screen = screenRecording(await yamnetScores(song16k))
  signal?.throwIfAborted()

  // The guitar on its own: separated from the band, or the recording itself.
  let guitar = song
  let active = null
  let heard = 1
  if (screen.kind !== 'solo') {
    const { separateGuitar } = await import('./separate.js')
    const stereo = await resample(decoded, 2, 44100)
    const separated = await separateGuitar([stereo.getChannelData(0), stereo.getChannelData(1)], {
      onProgress: stage('isolate'),
      onDevice: (where) => {
        device = where
      },
      signal,
    })
    const stem = bufferOf(separated, 44100)
    guitar = (await resample(stem, 1, RATE)).getChannelData(0)
    const stem16k = (await resample(stem, 1, YAMNET_RATE)).getChannelData(0)
    const stemYamnet = await yamnetScores(stem16k)
    const frames = Math.min(stemYamnet.frames, Math.floor(song16k.length / (HOP_SECONDS * YAMNET_RATE)) + 1)
    const found = guitarFrames({ stemYamnet, stemLevels: frameLevels(stem16k, frames), songLevels: frameLevels(song16k, frames) })
    heard = found.presence
    if (!found.enough && !anyway) return { status: 'no-guitar', heard }
    // Asked to go ahead anyway: everything the separator kept, not only where YAMNet heard guitar.
    active = anyway ? null : found.active
  }

  const basicPitch = await import('../follow/refineWithBasicPitch.js')
  const { notes: transcribed, frames, onsets } = await basicPitch.transcribeAudio(guitar, { thresholds: basicPitch.TRANSCRIBE, onProgress: stage('notes'), signal })
  const notes = guitarNotes(transcribed, { guitar, song: guitar === song ? null : song, active })
  if (!notes.length) {
    if (!anyway) return { status: 'no-guitar', heard }
    throw new Error('No guitar notes were heard in this recording.')
  }

  const { trackBeats } = await import('./beats.js')
  const bars = await trackBeats(song, { onProgress: stage('beats'), signal })

  stage('tab')
  const draft = draftScore({ notes, frames, onsets, bars, samples: guitar }, { frameTime: basicPitch.frameTime })
  signal?.throwIfAborted()
  onProgress?.({ stage: 'tab', label: STAGES.at(-1).label, value: 1, device })

  const used = []
  for (const chord of draft.chords) if (chord && !used.includes(chord.id)) used.push(chord.id)
  return {
    status: 'ok',
    musicXml: draft.musicXml,
    title: titleOf(file.name ?? ''),
    bpm: draft.bpm,
    beatsPerBar: draft.beatsPerBar,
    chords: used,
    isolated: screen.kind !== 'solo',
    heard,
  }
}

/**
 * Basic Pitch's notes cut to the guitar's own: only where it plays
 * (`active`, guitarPresence's frames; null for everywhere) and not what the
 * band bled into the separated `guitar` (judged against the whole `song`;
 * null when the recording was a guitar on its own, so nothing to cut).
 */
export function guitarNotes(notes, { guitar, song = null, active = null }) {
  if (!song) return notes
  const playing = (seconds) => {
    const f = Math.floor(seconds / HOP_SECONDS)
    return !active || Boolean(active[f] || active[f - 1])
  }
  return dropBleed(notes.filter((n) => playing(n.startTimeSeconds)), guitar, song)
}

const STRUM_LEAD = 0.05 // seconds: Basic Pitch's notes starting this soon before a strum are its strings
const RING_FLOOR = 0.1 // a strummed chord rings until its notes' mean activation stays under this

/** The first of `times` (ascending) at or after `t`. */
function firstAt(times, t) {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** When notes `midis` stop ringing after `from` seconds (Basic Pitch's `frames` at `times`), by `until` at the latest. */
function ringsUntil(frames, times, midis, from, until) {
  let quiet = 0
  for (let f = firstAt(times, from); f < times.length && times[f] < until; f += 1) {
    const level = midis.reduce((sum, m) => sum + frames[f][m - 21], 0) / midis.length
    quiet = level < RING_FLOOR ? quiet + 1 : 0
    if (quiet === 3) return times[f - 2]
  }
  return until
}

/** `events` ({ start, end, midi }) with a string and fret each, fretted chord by chord (fretAssign); notes no hand can add are left out. */
function withFrets(events) {
  const byStart = new Map()
  for (const e of events) {
    if (!byStart.has(e.start)) byStart.set(e.start, [])
    byStart.get(e.start).push(e)
  }
  const groups = [...byStart.values()].map((group) => {
    const kept = playableChord(group.map((e) => e.midi))
    return kept.map((midi) => group.find((e) => e.midi === midi))
  })
  const positions = assignFrets(groups.map((group) => group.map((e) => e.midi)))
  return groups.flatMap((group, g) => group.flatMap((e, i) => (positions[g]?.[i] ? [{ ...e, ...positions[g][i] }] : [])))
}

/**
 * The steps after the models, as a one-part score on the song's beat
 * (`bars`, Beat This!'s):
 *   - strummed chords: every strum in the guitar (`samples`, at 22.05 kHz,
 *     with Basic Pitch's `onsets`; strums.js), each with three or more
 *     pitches sounding written as the chord shape that best fits them and
 *     the beat's chord (voicings.js), ringing until the next strum or until
 *     it dies away;
 *   - picked notes: Basic Pitch's `notes` outside the strums, ghost notes out;
 *   - the chord the guitar plays on each beat (from Basic Pitch's `frames`,
 *     timed by `frameTime`), named where it changes.
 * With chord shapes in it the part carries its own strings and frets
 * (addGuitarTab leaves such a part as it is); without, opening it frets it.
 * Returns { musicXml, notes (the notes written, Basic Pitch's shape),
 * strums ([{ time, end, shape }], the strummed chords), chords (one per
 * beat, or null), origin (the beat bar 1 starts on), beatsPerBar, bpm }.
 */
export function draftScore({ notes: heard, frames, onsets = null, bars, samples }, { frameTime }) {
  const beatsPerBar = bars.beatsPerBar ?? 4
  const chords = bars.beats.length ? recognizeChords(beatChroma(frames, frameTime, bars.beats), bars) : []
  const { toBeats, period } = beatClock(bars.beats)

  // Strummed chords, each held until the next strum or until it stops ringing (two bars at most).
  const found = samples ? findStrums(samples, { onsets, frameTime }) : []
  const evidenceAt = pitchEvidence(frames, frameTime)
  const evidence = found.map((s) => evidenceAt(s.time))
  const sounding = evidence.map((e) => heardPitches(e))
  const isChord = chordStrums(found.map((s, i) => ({ time: s.time, heard: sounding[i], ...struckPitches(samples, s.time, evidence[i]) })))
  const chordOf = (seconds) => chords[Math.floor(toBeats(seconds) + 0.1)] ?? null
  const shapes = voiceStrums(found.map((s, i) => ({ time: s.time, evidence: evidence[i], chord: chordOf(s.time), strummed: isChord[i] })))
  const times = frames.map((_, f) => frameTime(f))
  const strums = []
  found.forEach((s, i) => {
    if (!shapes[i]) return
    const next = found[i + 1]?.time ?? Infinity
    const end = ringsUntil(frames, times, shapes[i].midis, s.time + 0.05, Math.min(next, s.time + 2 * beatsPerBar * period))
    strums.push({ time: s.time, end, until: Math.min(next, end + STRUM_LEAD), shape: shapes[i] })
  })

  // Basic Pitch's notes inside a strum are its strings: the shape stands for them.
  let k = 0
  const inStrum = (seconds) => {
    while (k < strums.length && strums[k].until <= seconds) k += 1
    return k < strums.length && seconds >= strums[k].time - STRUM_LEAD
  }
  const picked = [...heard].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds).filter((n) => !inStrum(n.startTimeSeconds))
  const notes = samples ? dropGhostNotes(picked, samples) : picked
  const placed = cleanNotes(notes, toBeats)

  // Bar 1 at the first downbeat, with whole bars in front for anything that starts earlier.
  const earliest = Math.min(bars.firstDownbeat ?? 0, ...placed.map((n) => toBeats(n.startTimeSeconds)), ...strums.map((s) => toBeats(s.time)))
  const origin = barOrigin(earliest, bars)
  const toSlot = (seconds) => Math.round((toBeats(seconds) - origin) * SLOTS_PER_BEAT)
  const taken = new Set() // sixteenths a strum starts on: one strum each, and no picked note on top
  const strumEvents = strums.flatMap(({ time, end, shape }) => {
    const start = toSlot(time)
    if (taken.has(start)) return []
    taken.add(start)
    const stop = Math.max(start + 1, toSlot(end))
    return shape.frets.flatMap((fret, s) => (fret < 0 ? [] : [{ start, end: stop, midi: OPEN_STRING_MIDI[s] + fret, string: 6 - s, fret }]))
  })
  const pickedEvents = placed
    .map((n) => {
      const start = toSlot(n.startTimeSeconds)
      return { start, end: Math.max(start + 1, toSlot(n.startTimeSeconds + n.durationSeconds)), midi: n.pitchMidi }
    })
    .filter((e) => !taken.has(e.start))
  const tab = strumEvents.length > 0
  const events = tab ? [...strumEvents, ...withFrets(pickedEvents)] : pickedEvents

  const perBar = beatsPerBar * SLOTS_PER_BEAT
  const measures = Math.max(1, Math.ceil(Math.max(...events.map((e) => e.end), perBar) / perBar))
  // Chord names where the chord changes, on beats the guitar is playing.
  const playing = new Set()
  for (const e of events) for (let s = Math.floor(e.start / SLOTS_PER_BEAT); s * SLOTS_PER_BEAT < e.end; s += 1) playing.add(s)
  const harmonies = []
  let last = null
  for (let beat = 0; beat < measures * beatsPerBar; beat += 1) {
    const chord = playing.has(beat) ? (chords[origin + beat] ?? null) : null
    if (chord && (chord.id !== last?.id || beat % beatsPerBar === 0)) harmonies.push({ slot: beat * SLOTS_PER_BEAT, xml: harmonyXml(chord) })
    last = chord
  }

  const bpm = 60 / period
  const xml = partXml(events, { id: 'P1', beatsPerBar, measures, harmonies, tempo: bpm, tab })
  const written = [
    ...notes,
    ...strums.flatMap((s) => s.shape.midis.map((pitchMidi) => ({ startTimeSeconds: s.time, durationSeconds: s.end - s.time, pitchMidi, amplitude: 0.8 }))),
  ].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
  return {
    musicXml: scoreXml([{ id: 'P1', name: 'Guitar', xml }]),
    notes: written,
    strums: strums.map(({ time, end, shape }) => ({ time, end, shape })),
    chords,
    origin,
    beatsPerBar,
    bpm,
  }
}
