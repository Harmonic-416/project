import * as Tone from 'tone'

/**
 * The metronome's click (F40): a short burst of high-passed noise rather
 * than a beep. Noise has no pitch, so the vocal pitch tracker (clarity
 * >= 0.9 within 60–1500 Hz) can't mistake a click it hears through the
 * speakers for a sung note. Downbeats are louder and duller.
 */

const BEAT_CUTOFF = 3200
const ACCENT_CUTOFF = 1800
const BEAT_VELOCITY = 0.5 // about -6 dB under the accent
const CLICK_SECONDS = 0.03

export function createClick() {
  const output = new Tone.Volume(0).toDestination()
  let filter
  let synth

  const build = () => {
    filter = new Tone.Filter({ type: 'highpass', frequency: BEAT_CUTOFF, rolloff: -24 }).connect(output)
    synth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.01 },
    }).connect(filter)
  }
  const teardown = () => {
    synth.dispose()
    filter.dispose()
  }
  build()

  return {
    /** Click at audio-context `time`; `accent` marks a downbeat. */
    trigger(time, accent = false) {
      filter.frequency.setValueAtTime(accent ? ACCENT_CUTOFF : BEAT_CUTOFF, time)
      synth.triggerAttackRelease(CLICK_SECONDS, time, accent ? 1 : BEAT_VELOCITY)
    },
    /** 0–1 linear gain. */
    setVolume(volume) {
      output.mute = !(volume > 0)
      if (volume > 0) output.volume.value = Tone.gainToDb(Math.min(volume, 1))
    },
    /** Drop clicks already scheduled ahead (a cancelled count-in). */
    silence() {
      teardown()
      build()
    },
    dispose() {
      teardown()
      output.dispose()
    },
  }
}
