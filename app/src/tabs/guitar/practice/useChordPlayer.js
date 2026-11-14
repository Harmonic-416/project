import { useCallback, useEffect, useRef } from 'react'
import * as Tone from 'tone'
import { createChordPlayer } from './chordSound.js'

/**
 * { strum, arpeggiate, stop } for a chord, on one guitar-sound player
 * (chordSound.js) that is made on first use and silenced when the component
 * goes away. Call strum / arpeggiate from a tap so the browser lets audio start.
 */
export function useChordPlayer() {
  const playerRef = useRef(null)
  const mountedRef = useRef(false)
  const generationRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      playerRef.current?.dispose()
      playerRef.current = null
    }
  }, [])

  const play = useCallback(async (how, chord) => {
    const generation = ++generationRef.current
    playerRef.current?.stop()
    await Tone.start()
    if (!mountedRef.current || generation !== generationRef.current) return // left while audio was starting
    if (!playerRef.current) playerRef.current = createChordPlayer()
    await playerRef.current[how](chord)
  }, [])

  const strum = useCallback((chord) => play('strum', chord), [play])
  const arpeggiate = useCallback((chord) => play('arpeggiate', chord), [play])
  const stop = useCallback(() => { generationRef.current += 1; playerRef.current?.stop() }, [])

  return { strum, arpeggiate, stop }
}
