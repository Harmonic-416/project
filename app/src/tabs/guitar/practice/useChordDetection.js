import { useCallback, useEffect, useRef, useState } from 'react'
import { createCapture } from '../../../audio/capture/createCapture.js'
import { createChordListener } from './chordDetect.js'

// 8192 samples ≈ 170 ms at 48 kHz: ~6 Hz bins, fine enough for the low strings.
const FRAME_SIZE = 8192
const HOP = 1024

/**
 * Microphone → 'verified' | 'wrong' | 'silent' for `chord`, entirely on the
 * device. Frames and strum onsets come from the shared AudioWorklet capture;
 * chordDetect.js decides. `chord` can change while listening (Play moves on
 * by itself) without restarting the mic. muteFor(ms) stops the app hearing
 * its own Hint.
 */
export function useChordDetection({ chord, onVerdict }) {
  const [status, setStatus] = useState('idle') // idle | requesting | listening | error
  const [error, setError] = useState(null)
  const captureRef = useRef(null)
  const listenerRef = useRef(null)
  const positionRef = useRef(0)
  const sessionRef = useRef(0) // bumped by stop(), so a start still awaiting the mic gives up
  const pendingRef = useRef(false)
  const chordRef = useRef(chord)
  const onVerdictRef = useRef(onVerdict)

  useEffect(() => {
    onVerdictRef.current = onVerdict
  }, [onVerdict])

  useEffect(() => {
    chordRef.current = chord
    listenerRef.current?.setChord(chord)
  }, [chord])

  const stop = useCallback(() => {
    sessionRef.current += 1
    captureRef.current?.stop()
    captureRef.current = null
    listenerRef.current = null
    setStatus('idle')
  }, [])

  // Stable identity: PracticeScreen wraps the run dispatches with it, and the
  // runs' timer effects depend on those.
  const start = useCallback(async () => {
    if (captureRef.current || pendingRef.current) return
    pendingRef.current = true
    const session = ++sessionRef.current
    setStatus('requesting')
    setError(null)
    let listener = null
    try {
      const capture = await createCapture({
        frameSize: FRAME_SIZE,
        hop: HOP,
        onFrame: (frame) => {
          positionRef.current = frame.position
          listener?.frame(frame)
        },
        onOnset: ({ position }) => listener?.onset(position),
      })
      if (session !== sessionRef.current) {
        capture.stop()
        return
      }
      listener = createChordListener({
        sampleRate: capture.sampleRate,
        chord: chordRef.current,
        onVerdict: (verdict) => onVerdictRef.current?.(verdict),
      })
      listenerRef.current = listener
      captureRef.current = capture
      setStatus('listening')
    } catch (err) {
      if (session !== sessionRef.current) return
      console.error(err)
      setError(err.name === 'NotAllowedError' ? 'Microphone permission was denied.' : err.message || 'Microphone unavailable.')
      setStatus('error')
    } finally {
      pendingRef.current = false
    }
  }, [])

  const muteFor = useCallback((ms) => {
    const capture = captureRef.current
    if (!capture) return
    listenerRef.current?.muteUntil(positionRef.current + Math.round((ms / 1000) * capture.sampleRate))
  }, [])

  useEffect(
    () => () => {
      sessionRef.current += 1
      captureRef.current?.stop()
    },
    [],
  )

  return { status, error, start, stop, muteFor }
}
