import { useEffect, useRef, useState } from 'react'
import { BEATS_PER_BAR } from './playState.js'

/** Beat cues and bar advancement share one origin, including after a late tick. */
export function useStrummingClock(status, index, bpm, dispatch) {
  const origin = useRef(null)
  const [beat, setBeat] = useState(0)
  useEffect(() => {
    if (status !== 'running') { origin.current = null; return undefined }
    origin.current ??= performance.now()
    const beatMs = 60000 / bpm
    let timer
    const update = () => {
      const elapsed = Math.max(0, performance.now() - origin.current)
      if (elapsed >= (index + 1) * BEATS_PER_BAR * beatMs) { dispatch({type:'advance'}); return }
      const step = Math.floor(elapsed / beatMs)
      setBeat(step % BEATS_PER_BAR)
      timer = setTimeout(update, Math.max(1, (step + 1) * beatMs - elapsed))
    }
    timer = setTimeout(update, 0)
    return () => clearTimeout(timer)
  }, [status, index, bpm, dispatch])
  return status === 'running' ? beat : 0
}
