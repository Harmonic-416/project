import { useCallback, useState } from 'react'
import { MAX_SHIFT, MIN_SHIFT } from './keyFit.js'

/**
 * A song's transposition (semitones), remembered in this browser per song
 * by its file fingerprint, the way its tempo is (audio/tempo/useSongTempo.js):
 * open the song again and it is still in the key that fits you.
 */
const PREFIX = 'harmonic.transpose.'

const clamp = (n) => Math.max(MIN_SHIFT, Math.min(MAX_SHIFT, Math.round(n)))

function storage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadSongShift(songKey) {
  if (!songKey) return 0
  try {
    const n = Number(storage()?.getItem(PREFIX + songKey) ?? 0)
    return Number.isFinite(n) ? clamp(n) : 0
  } catch {
    return 0
  }
}

export function saveSongShift(songKey, shift) {
  if (!songKey) return
  try {
    if (shift) storage()?.setItem(PREFIX + songKey, String(clamp(shift)))
    else storage()?.removeItem(PREFIX + songKey)
  } catch {
    // Private window or blocked storage: back to the written key next time.
  }
}

/** [shift, setShift] for the song identified by `songKey`, loaded when the song changes and saved on every change. */
export function useSongTranspose(songKey) {
  const [state, setState] = useState(() => ({ songKey, shift: loadSongShift(songKey) }))

  // A different song: load its shift during this render, so the viewer never
  // renders it in the previous song's key.
  let current = state
  if (state.songKey !== songKey) {
    current = { songKey, shift: loadSongShift(songKey) }
    setState(current)
  }

  const setShift = useCallback(
    (shift) => {
      const next = clamp(shift)
      saveSongShift(songKey, next)
      setState({ songKey, shift: next })
    },
    [songKey],
  )

  return [current.shift, setShift]
}
