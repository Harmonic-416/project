import { createPracticeProgress } from '../../shared/practiceProgress.js'

export { dayKey } from '../../shared/practiceProgress.js'

// Keep the existing Vocal streak and stars on this device.
export const {
  loadProgress, subscribe, currentStreak, practisedToday,
  recordActivity, recordStars, bestStars, resetProgressCache,
} = createPracticeProgress('harmonic.vocal.progress')
