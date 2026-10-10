import * as Tone from 'tone'

/**
 * Score time on the one Transport (F6), at any tempo (F37).
 *
 * Everything is scheduled in score seconds — the times in the score model —
 * as if the Transport ran at BASE_BPM; tempo then scales Transport.bpm, so
 * notes, cursor and metronome slow down together. Score time therefore lives
 * in Transport *ticks*: never read or write Transport.seconds (wall-clock
 * time at the current bpm) and never hand schedule()/Part a plain seconds
 * value, which Tone converts at whatever bpm is current at that moment.
 */

export const BASE_BPM = 120

/** Ticks per score second: PPQ ticks a quarter note, BASE_BPM / 60 quarters a second. */
export function ticksPerScoreSecond(ppq = Tone.Transport.PPQ) {
  return (ppq * BASE_BPM) / 60
}

/** A score time as Tone transport time, in whole ticks ("12.5i" would be read as seconds). */
export function scoreTicks(seconds) {
  return `${Math.round(seconds * ticksPerScoreSecond())}i`
}

/** Where the Transport is now, in score seconds. */
export function getScoreSeconds() {
  return Tone.Transport.getTicksAtTime(Tone.Transport.now()) / ticksPerScoreSecond()
}

export function setScoreSeconds(seconds) {
  Tone.Transport.ticks = Math.round(seconds * ticksPerScoreSecond())
}

/** 1 = written tempo, 0.5 = half speed. */
export function setTempoRate(rate) {
  Tone.Transport.bpm.value = BASE_BPM * rate
}
