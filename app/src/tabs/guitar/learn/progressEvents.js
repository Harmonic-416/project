/**
 * "Learn progress was just saved in this browser": the chord lessons, the
 * one-minute changes and strum on the beat call progressSaved() after they
 * write, and useLearnProgressSync copies it to the player's account. Kept
 * apart from the sync so the lessons (and their tests) never load the
 * Supabase layer.
 */

const listeners = new Set()

export function progressSaved() {
  for (const listener of listeners) listener()
}

/** Call `listener` after every save; returns a function that stops it. */
export function onProgressSaved(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
