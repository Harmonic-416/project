import { createPracticeProgress } from '../../shared/practiceProgress.js'
import { sfx } from '../../vocal/feedback/sfx.js'

export const guitarProgress = createPracticeProgress('harmonic.guitar.practice-streak')

/** Count a completed activity and optionally play its feedback after listening has stopped. */
export function finishGuitarPractice({ sound = true } = {}) {
  guitarProgress.recordActivity()
  if (sound) void sfx.complete()
}
