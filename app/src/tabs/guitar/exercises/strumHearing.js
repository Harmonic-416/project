/**
 * Is that onset a strum, or the drill's own click coming back through the
 * speakers? The click (audio/metronome/click.js) is noise with everything
 * under 1.8–3.2 kHz filtered out; a strum — ringing or muted — puts most of
 * its energy lower down, in the strings and the guitar's body. So an onset
 * counts only when enough of its sound, in the frames just after it, is
 * below SPLIT_HZ: the click alone never is, and a strum on the beat still
 * is, click and all. Pure, unit-tested in app/tests/strumHearing.test.js.
 */

const LOW_HZ = 70 // below this: rumble, not the guitar
const SPLIT_HZ = 1500
const HIGH_HZ = 8000
const ATTACK_FRAMES = 2 // the spectra just after the onset
// Measured on synthetic sound (tests): the click alone 0.00–0.01, strums — muted or ringing, with a
// loud click on top — 0.97–0.99. Set well below a strum, for real ones with more pick noise up high.
export const MIN_LOW_SHARE = 0.2

/** The share (0 … 1) of a listening window's energy between LOW_HZ and SPLIT_HZ, of all between LOW_HZ and HIGH_HZ. */
export function lowShare({ spectra, sampleRate }) {
  let low = 0
  let all = 0
  for (const spectrum of spectra.slice(0, ATTACK_FRAMES)) {
    const binHz = sampleRate / (2 * (spectrum.length - 1))
    for (let bin = Math.ceil(LOW_HZ / binHz); bin * binHz < HIGH_HZ && bin < spectrum.length; bin += 1) {
      const energy = spectrum[bin] * spectrum[bin]
      all += energy
      if (bin * binHz < SPLIT_HZ) low += energy
    }
  }
  return all > 0 ? low / all : 0
}

/** Whether a listening window (listenWindows.js, with `sampleRate`) sounds like a strum rather than the click. */
export const soundsLikeAStrum = (window) => lowShare(window) >= MIN_LOW_SHARE
