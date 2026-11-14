import { useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { createClick } from '../../../audio/metronome/click.js'

/** Audible feedback follows the existing countdown state; it owns no timer. */
export function useLessonCountIn(status, count) {
  const click = useRef(null)
  const [error, setError] = useState(null)
  useEffect(() => () => { click.current?.dispose(); click.current = null }, [])
  useEffect(() => {
    if (status !== 'countdown') return undefined
    let live = true
    Tone.start().then(() => {
      if (!live) return
      click.current ??= createClick()
      click.current.setVolume(0.6)
      click.current.trigger(Tone.now() + 0.01, count === 3)
      setError(null)
    }).catch(() => {
      if (live) setError('Countdown sound is unavailable. Follow the on-screen 3–2–1 instead.')
    })
    return () => { live = false }
  }, [status, count])
  return error
}
