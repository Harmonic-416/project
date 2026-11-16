const FULL_SCALE = 32767 / 32768
const CLIPPED_SAMPLES = 4

/** Consecutive samples pinned at the same rail indicate overload. */
export function hasClippedSamples(samples) {
  let run = 0
  let rail = 0
  for (const sample of samples) {
    const next = sample >= FULL_SCALE ? 1 : sample <= -FULL_SCALE ? -1 : 0
    run = next && next === rail ? run + 1 : next ? 1 : 0
    rail = next
    if (run >= CLIPPED_SAMPLES) return true
  }
  return false
}

export const CLIPPING_HELP = 'Microphone input is clipping. Move the device back or lower your amp or input gain.'
