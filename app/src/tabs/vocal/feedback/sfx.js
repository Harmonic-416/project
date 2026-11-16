import * as Tone from 'tone'

// The Vocal tab's little feedback sounds: synthesised, so there are no files to
// ship. Each is a few short notes on a soft bell-like synth, quieter than the
// music. Muting is remembered in this browser.

const MUTE_KEY = 'harmonic.vocal.sfx'
const VOLUME_DB = -14

const listeners = new Set()
let muted = readMuted()

function readMuted() {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === 'off'
  } catch {
    return false
  }
}

export function isMuted() {
  return muted
}

export function setMuted(next) {
  muted = Boolean(next)
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, muted ? 'off' : 'on')
  } catch {
    // Private window or blocked storage: muted for this visit only.
  }
  listeners.forEach((fn) => fn())
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let bell = null
let thud = null

function voices() {
  bell ??= new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.18, sustain: 0.15, release: 0.3 },
    volume: VOLUME_DB,
  }).toDestination()
  thud ??= new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.12 },
    volume: VOLUME_DB - 2,
  }).toDestination()
  return { bell, thud }
}

const buzz = (pattern) => globalThis.navigator?.vibrate?.(pattern)

/** Plays `notes` ([note, offsetSeconds, lengthSeconds]) on the bell, unless muted. */
async function chime(notes) {
  if (muted) return
  try {
    await Tone.start()
    const { bell } = voices()
    const t0 = Tone.now() + 0.01
    notes.forEach(([note, at, len = 0.12]) => bell.triggerAttackRelease(note, len, t0 + at))
  } catch {
    // No audio (tests, blocked autoplay): feedback is visual only.
  }
}

export const sfx = {
  /** A tap on a button or box. */
  tap: () => chime([['C6', 0, 0.03]]),
  /** A right answer: a bright rising third. */
  correct: () =>
    chime([
      ['E5', 0, 0.09],
      ['G#5', 0.08, 0.16],
    ]),
  /** A wrong answer: a soft low bump. */
  wrong: async () => {
    buzz(60)
    if (muted) return
    try {
      await Tone.start()
      const { thud } = voices()
      const t0 = Tone.now() + 0.01
      thud.triggerAttackRelease('A2', 0.1, t0)
      thud.triggerAttackRelease('G#2', 0.14, t0 + 0.09)
    } catch {
      // see chime
    }
  },
  /** Several right in a row. */
  streak: () =>
    chime([
      ['C6', 0, 0.06],
      ['E6', 0.05, 0.06],
      ['G6', 0.1, 0.12],
    ]),
  /** Finished a lesson, test or warm-up. */
  complete: () => {
    buzz([30, 40, 30])
    return chime([
      ['C5', 0, 0.12],
      ['E5', 0.1, 0.12],
      ['G5', 0.2, 0.12],
      ['C6', 0.3, 0.35],
    ])
  },
  /** Finished with everything right. */
  perfect: () => {
    buzz([30, 40, 30, 40, 60])
    return chime([
      ['C5', 0, 0.1],
      ['E5', 0.08, 0.1],
      ['G5', 0.16, 0.1],
      ['C6', 0.24, 0.2],
      ['E6', 0.42, 0.08],
      ['G6', 0.48, 0.08],
      ['C7', 0.54, 0.4],
    ])
  },
}
