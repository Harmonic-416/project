import * as Tone from 'tone'
import { chordMidi } from './chords.js'

/**
 * The guitar sound for Hint (F31) and the ear-training exercises: one
 * plucked string per guitar string (Tone's Karplus-Strong PluckSynth), so a
 * chord sounds strummed on a guitar rather than played on a keyboard.
 *
 * Each strum or arpeggio gets fresh strings; playing again, or stop(),
 * fades the previous ones out and drops them along with anything they still
 * had scheduled (an arpeggio's later strings), like click.js's silence().
 *
 * Call strum / arpeggiate from a tap after `await Tone.start()` (iOS only
 * starts audio after one).
 */

const STRUM_GAP = 0.04 // seconds between strings, low to high
const ARPEGGIO_GAP = 0.35
const RING_SECONDS = 2.4 // until a string is 60 dB down; Hint mutes the mic for 3 s
const STOP_SECONDS = 0.05 // fade when a chord is cut off
const DAMPENING = 3000 // Hz: how bright the pick attack is
const VOLUME_DB = -6 // a strum peaks about 9–11 dB under full scale

/** Feedback per period that lets a string at `frequency` ring for `seconds` (to -60 dB). */
export function ringResonance(frequency, seconds = RING_SECONDS) {
  return 0.001 ** (1 / (seconds * frequency))
}

export function createChordPlayer() {
  const output = new Tone.Volume(VOLUME_DB).toDestination()
  let take = null // { gain, strings } of the chord sounding now

  const stop = () => {
    if (!take) return
    const { gain, strings } = take
    take = null
    gain.gain.rampTo(0, STOP_SECONDS)
    setTimeout(() => {
      strings.forEach((string) => string.dispose())
      gain.dispose()
    }, 500)
  }

  /** Pluck the chord's strings low to high, `gap` seconds apart. */
  const pluck = async (chord, gap) => {
    stop()
    const gain = new Tone.Gain(1).connect(output)
    // Tone's comb filter rounds each string to whole samples, leaving it up
    // to ~12 cents flat; all strings err the same way, so a chord stays clean.
    const notes = chordMidi(chord).map((midi) => Tone.Frequency(midi, 'midi').toFrequency())
    const strings = notes.map((frequency) =>
      new Tone.PluckSynth({ attackNoise: 1, dampening: DAMPENING, resonance: ringResonance(frequency) }).connect(gain),
    )
    const current = { gain, strings }
    take = current
    // The comb filter is an AudioWorklet that Tone wires up once its module
    // has loaded; a string plucked before then would stay silent.
    await Tone.getContext().workletsAreReady()
    if (take !== current) return // stopped or replaced while loading
    const start = Tone.now()
    strings.forEach((string, i) => string.triggerAttack(notes[i], start + i * gap))
  }

  return {
    strum: (chord) => pluck(chord, STRUM_GAP),
    /** One string at a time, so each note of the chord can be heard. */
    arpeggiate: (chord) => pluck(chord, ARPEGGIO_GAP),
    stop,
    dispose() {
      stop()
      setTimeout(() => output.dispose(), 600)
    },
  }
}
