import { useSyncExternalStore } from 'react'
import { isMuted, setMuted, subscribe } from './sfx.js'

/** [muted, setMuted]: the Vocal tab's sound-effects switch, shared by every screen. */
export function useSfxMuted() {
  const muted = useSyncExternalStore(subscribe, isMuted, isMuted)
  return [muted, setMuted]
}
