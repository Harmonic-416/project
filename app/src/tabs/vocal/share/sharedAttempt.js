import { centsOff, classifyCents, findActiveNote, midiToNoteName } from '../audio/pitchDetector.js'
import { createTroubleTracker, melodyLine } from '../practice/practiceLogic.js'

/**
 * Pure helpers for shared attempts (no DOM, no Supabase), unit-tested in
 * Node: the compact pitch trace that gets stored, per-note verdicts, song
 * fingerprints and the share link itself.
 */

/** Must match MAX_TRACE_SAMPLES in src/lib/attempts.ts (and the DB check). */
export const MAX_TRACE_SAMPLES = 30000

/** Pitch samples ({ time, midi }) → [[seconds, midi], ...], rounded, capped. */
export function toTrace(samples) {
  const trace = []
  for (const sample of samples) {
    if (trace.length >= MAX_TRACE_SAMPLES) break
    if (sample.time === null || !Number.isFinite(sample.time) || !Number.isFinite(sample.midi)) continue
    trace.push([Math.round(sample.time * 1000) / 1000, Math.round(sample.midi * 100) / 100])
  }
  return trace
}

export function fromTrace(trace) {
  return trace.map(([time, midi]) => ({ time, midi }))
}

/** Colour class for one sample against the practised part (same rule as the live trace). */
export function sampleVerdict(sample, sortedMelody) {
  const target = findActiveNote(sortedMelody, sample.time)
  return target ? classifyCents(centsOff(sample.midi, target.midi)) : 'rest'
}

/**
 * Which notes of the practised part (part 0 of the rendered score) were sung,
 * judged after the fact with the Trouble spots rule. Entries keep `index`
 * into scoreModel.notes so they can be marked on the score.
 */
export function judgeNotes(samples, scoreNotes) {
  const melody = melodyLine(scoreNotes)
  const tracker = createTroubleTracker(melody)
  for (const sample of samples) tracker.addSample(sample)
  const { hit, missed } = tracker.collect(Infinity)
  return { hit, missed, total: melody.length }
}

/** Missed notes as "bar 3 G4, bar 7 C5" (bar numbers when `measureOf` knows them). */
export function describeMissed(missed, measureOf = () => null) {
  return missed
    .map((note) => {
      const bar = measureOf(note)
      return `${bar ? `bar ${bar} ` : ''}${midiToNoteName(note.midi)}`
    })
    .join(', ')
}

/** SHA-256 of the song file as lowercase hex: two copies of the same file match. */
export async function fingerprintBytes(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const ATTEMPT_PARAM = 'attempt'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function shareUrlFor(id, origin) {
  return `${origin}/?${ATTEMPT_PARAM}=${id}`
}

/** The shared-attempt id in a link, or null. */
export function readSharedAttemptId(href) {
  try {
    const id = new URL(href).searchParams.get(ATTEMPT_PARAM)
    return id && UUID.test(id) ? id.toLowerCase() : null
  } catch {
    return null
  }
}
