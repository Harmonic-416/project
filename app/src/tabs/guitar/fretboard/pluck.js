import * as Tone from 'tone'
import { ringResonance } from '../practice/chordSound.js'

/**
 * One plucked string for the Fretboard: tap a spot, hear its note. Same
 * Karplus-Strong string as the chord sound (practice/chordSound.js); a new
 * pluck lets the previous one ring out underneath, like a real guitar.
 */

const VOLUME_DB = -8
let output = null

export async function pluckNote(midi) {
  await Tone.start() // browsers only start audio after a tap
  output ??= new Tone.Volume(VOLUME_DB).toDestination()
  const frequency = Tone.Frequency(midi, 'midi').toFrequency()
  const string = new Tone.PluckSynth({ attackNoise: 1, dampening: 3000, resonance: ringResonance(frequency, 1.8) }).connect(
    output,
  )
  await Tone.getContext().workletsAreReady()
  string.triggerAttack(frequency, Tone.now())
  setTimeout(() => string.dispose(), 2500)
}