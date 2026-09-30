import { useCallback, useEffect, useRef, useState } from 'react'
import { createPitchTracker, midiToNoteName } from './pitchDetector.js'

const UI_INTERVAL_MS = 50

/**
 * Microphone → pitch samples, entirely client-side (live audio never leaves
 * the device; see README architecture rules). Every analysed frame becomes
 * { time, frequency, midi, clarity, noteName } where `time` comes from
 * `getTime(captureDelay)` — the playback clock, given how long ago (seconds)
 * the frame was actually sung — so samples line up with the score.
 * Frames `isBleed(time, midi)` flags as the device's own playback are
 * dropped before they are scored or stored (see practice/deviceBleed.js).
 * A MediaRecorder runs alongside and yields a compressed webm/opus Blob on
 * stop(), the shape the backend's uploadRecording expects.
 */
export function useMicPitch({ getTime, onSample, isBleed }) {
  const [status, setStatus] = useState('idle') // idle | requesting | listening | error
  const [error, setError] = useState(null)
  const [current, setCurrent] = useState(null)
  const rigRef = useRef(null)
  const samplesRef = useRef([])
  const getTimeRef = useRef(getTime)
  const onSampleRef = useRef(onSample)
  const isBleedRef = useRef(isBleed)

  useEffect(() => {
    getTimeRef.current = getTime
    onSampleRef.current = onSample
    isBleedRef.current = isBleed
  }, [getTime, onSample, isBleed])

  const stop = useCallback(
    () =>
      new Promise((resolve) => {
        const rig = rigRef.current
        rigRef.current = null
        if (!rig) {
          resolve(null)
          return
        }
        cancelAnimationFrame(rig.raf)
        const releaseAudio = () => {
          rig.stream.getTracks().forEach((track) => track.stop())
          rig.ctx.close().catch(() => {})
        }
        const finish = () => {
          setStatus('idle')
          setCurrent(null)
          resolve(rig.chunks.length ? new Blob(rig.chunks, { type: rig.recorder?.mimeType || 'audio/webm' }) : null)
        }
        // Stop the recorder first and wait for its final chunk; ending the
        // tracks first can end the recorder before that data arrives.
        if (rig.recorder && rig.recorder.state !== 'inactive') {
          rig.recorder.onstop = () => {
            releaseAudio()
            finish()
          }
          rig.recorder.stop()
        } else {
          releaseAudio()
          finish()
        }
      }),
    [],
  )

  /** Resolves true once listening, false if the microphone couldn't be opened. */
  const start = useCallback(async () => {
    if (rigRef.current) return true
    setStatus('requesting')
    setError(null)
    samplesRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      const ctx = new AudioContext()
      await ctx.resume()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      ctx.createMediaStreamSource(stream).connect(analyser)
      const tracker = createPitchTracker({ bufferSize: analyser.fftSize })
      const buffer = new Float32Array(analyser.fftSize)
      // How long ago the middle of an analysed frame was sung: input latency
      // (when the browser reports it) plus half the analysis window.
      const inputLatency = stream.getAudioTracks()[0]?.getSettings?.().latency ?? 0.01
      const captureDelay = inputLatency + (ctx.baseLatency || 0) + analyser.fftSize / 2 / ctx.sampleRate

      let recorder = null
      const chunks = []
      if (typeof MediaRecorder !== 'undefined') {
        try {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined
          recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
          recorder.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data)
          }
          recorder.onerror = (event) => console.warn('MediaRecorder error', event.error ?? event)
          recorder.start(250)
        } catch (err) {
          console.warn('MediaRecorder unavailable, pitch tracking only', err)
        }
      }

      const rig = { stream, ctx, analyser, buffer, tracker, raf: 0, recorder, chunks, lastUi: 0 }
      rigRef.current = rig
      const tick = () => {
        if (rigRef.current !== rig) return
        analyser.getFloatTimeDomainData(buffer)
        const analysed = tracker.analyze(buffer, ctx.sampleRate)
        const now = performance.now()
        const time = analysed ? getTimeRef.current(captureDelay) : null
        const result = analysed && !(time !== null && isBleedRef.current?.(time, analysed.midi)) ? analysed : null
        if (result) {
          const sample = { ...result, time, noteName: midiToNoteName(result.midi) }
          if (time !== null) {
            samplesRef.current.push(sample)
            onSampleRef.current?.(sample)
          }
          if (now - rig.lastUi > UI_INTERVAL_MS) {
            rig.lastUi = now
            setCurrent(sample)
          }
        } else if (now - rig.lastUi > UI_INTERVAL_MS) {
          rig.lastUi = now
          setCurrent(null)
        }
        rig.raf = requestAnimationFrame(tick)
      }
      rig.raf = requestAnimationFrame(tick)
      setStatus('listening')
      return true
    } catch (err) {
      console.error(err)
      setError(err.message || 'Microphone unavailable.')
      setStatus('error')
      return false
    }
  }, [])

  useEffect(() => () => {
    stop()
  }, [stop])

  const getSamples = useCallback(() => samplesRef.current, [])

  return { status, error, current, start, stop, getSamples }
}
