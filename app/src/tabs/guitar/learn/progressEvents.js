/**
 * "Learn progress was just saved in this browser": the chord lessons, the
 * one-minute changes and strum on the beat call progressSaved() after they
 * write, and useLearnProgressSync copies it to the player's account. Kept
 * apart from the sync so the lessons (and their tests) never load the
 * Supabase layer.
 */

const listeners = new Set()
const syncListeners = new Set()
let syncSnapshot = { userId: null, state: 'local' }

export const getProgressSyncStatus = () => syncSnapshot
export function onProgressSyncStatus(listener) {
  syncListeners.add(listener)
  return () => syncListeners.delete(listener)
}
export function setProgressSyncStatus(userId, state) {
  syncSnapshot = { userId, state }
  for (const listener of syncListeners) listener()
}

export function progressSaved() {
  for (const listener of listeners) listener()
}

/** Call `listener` after every save; returns a function that stops it. */
export function onProgressSaved(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
