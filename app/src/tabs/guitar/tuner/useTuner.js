import { useCallback, useEffect, useRef, useState } from 'react'
import { createCapture } from '../../../audio/capture/createCapture.js'
import { createPitchTracker } from '../../vocal/audio/pitchDetector.js'
import { createStabilizer } from './tuner.js'

// 4096 samples ≈ 85 ms at 48 kHz: several periods of low E (82 Hz).
const FRAME_SIZE = 4096
const UI_INTERVAL_MS = 33 // ≥ 20 readout updates per second (F39)

/**
 * Microphone → tuner reading, entirely on the device. Frames come from the
 * shared AudioWorklet capture; Pitchy finds the pitch; the stabilizer turns
 * it into { string, cents, frequency, inTune } or null ("play a string").
 * `tuned` collects the ids of strings that have reached in-tune this session.
 */
export function useTuner() {
  const [status, setStatus] = useState('idle') // idle | requesting | listening | error
  const [error, setError] = useState(null)
  const [reading, setReading] = useState(null)
  const [tuned, setTuned] = useState(() => new Set())
  const [lockedId, setLockedIdState] = useState(null)
  const captureRef = useRef(null)
  const stabilizerRef = useRef(createStabilizer())
  const lastUiRef = useRef(0)

  const stop = useCallback(() => {
    captureRef.current?.stop()
    captureRef.current = null
    stabilizerRef.current.reset()
    setReading(null)
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (captureRef.current) return
    setStatus('requesting')
    setError(null)
    const tracker = createPitchTracker({ bufferSize: FRAME_SIZE, minRms: 0.005, maxFrequency: 1000 })
    const stabilizer = stabilizerRef.current
    stabilizer.reset()
    let capture = null
    try {
      capture = await createCapture({
        frameSize: FRAME_SIZE,
        onFrame: ({ samples, position }) => {
          if (!capture) return
          const detected = tracker.analyze(samples, capture.sampleRate)
          const timeMs = (position / capture.sampleRate) * 1000
          const next = stabilizer.push(detected ? detected.frequency : null, timeMs)
          if (next?.inTune) {
            setTuned((current) => (current.has(next.string.id) ? current : new Set(current).add(next.string.id)))
          }
          const now = performance.now()
          if (now - lastUiRef.current >= UI_INTERVAL_MS) {
            lastUiRef.current = now
            setReading(next)
          }
        },
      })
      captureRef.current = capture
      setStatus('listening')
    } catch (err) {
      console.error(err)
      setError(err.name === 'NotAllowedError' ? 'Microphone permission was denied.' : err.message || 'Microphone unavailable.')
      setStatus('error')
    }
  }, [])

  const setLockedId = useCallback((id) => {
    stabilizerRef.current.setLocked(id)
    setLockedIdState(id)
    setReading(null)
  }, [])

  useEffect(() => () => captureRef.current?.stop(), [])

  return { status, error, reading, tuned, lockedId, setLockedId, start, stop }
}
