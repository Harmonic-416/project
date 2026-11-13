import { useSyncExternalStore } from 'react'
import { loadProgress, subscribe } from './progress.js'

/** The Vocal tab's on-device progress ({ streak, lastDay, stars }), re-rendering when it changes. */
export function useVocalProgress() {
  return useSyncExternalStore(subscribe, loadProgress, loadProgress)
}
