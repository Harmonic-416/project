import { useSyncExternalStore } from 'react'
import { isMuted, setMuted, subscribe } from './sfx.js'

/** [muted, setMuted]: the shared practice sound-effects switch. */
export function useSfxMuted() {
  const muted = useSyncExternalStore(subscribe, isMuted, isMuted)
  return [muted, setMuted]
}
