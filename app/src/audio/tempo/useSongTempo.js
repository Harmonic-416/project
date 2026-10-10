import { useCallback, useState } from 'react'
import { clampTempo, loadSongTempo, saveSongTempo } from './tempo.js'

/**
 * [pct, setPct] — the tempo for the song identified by `songKey` (its file
 * fingerprint), loaded when the song changes and saved on every change.
 */
export function useSongTempo(songKey) {
  const [state, setState] = useState(() => ({ songKey, pct: loadSongTempo(songKey) }))

  // A different song: load its tempo during this render, so playback never
  // sees the previous song's tempo and nothing is saved under the wrong key.
  let current = state
  if (state.songKey !== songKey) {
    current = { songKey, pct: loadSongTempo(songKey) }
    setState(current)
  }

  const setPct = useCallback(
    (pct) => {
      const tempo = clampTempo(pct)
      saveSongTempo(songKey, tempo)
      setState({ songKey, pct: tempo })
    },
    [songKey],
  )

  return [current.pct, setPct]
}
