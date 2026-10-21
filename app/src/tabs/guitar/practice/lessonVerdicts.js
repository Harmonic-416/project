import { OPEN_STRING_MIDI } from './chords.js'

/**
 * Glue between the chord lessons and the song listener (pure, unit-tested in
 * app/tests/practice.test.js): the lessons listen with the same rules as a
 * song's Wait for me (song/follow/waitListening.js) — noise isn't a strum,
 * one strum is judged once, a chord still ringing doesn't count again, and
 * every string must sound (noteJudge.EVERY_STRING).
 */

/** A chord as a one-entry song timeline (songTimeline.js), so the song judge can listen for it. Tab numbering: 1 = high e. */
export function lessonEntry(chord) {
  return {
    index: 0,
    kind: 'chord',
    technique: 'pick',
    notes: chord.frets.flatMap((fret, i) => (fret < 0 ? [] : [{ midi: OPEN_STRING_MIDI[i] + fret, string: 6 - i, fret }])),
  }
}

/**
 * A judgement (noteJudge.judgeWindow) as a lesson result: { verdict:
 * 'verified' | 'wrong', strings, extra }, with `strings` low E first, as
 * StringStates draws them (F34), and `extra` the notes heard that the chord
 * doesn't have.
 */
export function toLessonVerdict(result) {
  return {
    verdict: result.verdict === 'hit' ? 'verified' : 'wrong',
    strings: [6, 5, 4, 3, 2, 1].map((string) => result.strings?.[string] ?? 'idle'),
    extra: result.extra ?? [],
  }
}

/** String lights for a result the player marked themselves: the chord's strings lit for "right", dark otherwise. */
export function markedStrings(verdict, chord) {
  return chord.frets.map((fret) => (verdict === 'verified' && fret >= 0 ? 'good' : 'idle'))
}
