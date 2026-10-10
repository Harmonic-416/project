import { useCallback, useEffect, useRef, useState } from 'react'
import { createCapture } from '../../../../audio/capture/createCapture.js'
import { createPitchTracker, midiToNoteName } from '../../../vocal/audio/pitchDetector.js'
import { createWindowCollector } from './listenWindows.js'

// 4096 samples ≈ 85 ms at 48 kHz: several periods of low E (82 Hz), as in the tuner.
const FRAME_SIZE = 4096
const HOP = 512
const UI_INTERVAL_MS = 80
const SOUND_FLOOR = 0.01 // hop RMS that counts as sound
const QUIET_MS = 2500 // this long below it while listening: "couldn't hear you" (F21)

/**
 * Microphone → listening windows for a guitar song, entirely on the device
 * (live audio never leaves it): the shared AudioWorklet capture (frames +
 * energy onsets), the pitch tracker on every frame, and listenWindows'
 * collector. Each window reaches `onWindow` with `sampleRate` and `wall`,
 * the page time (performance.now()) of its onset, for the song clock.
 *
 * With `record`, a MediaRecorder keeps a compressed copy of the input;
 * stop() resolves to that Blob (or null), and `recordingStartWall` says when
 * it began. muteFor(ms) stops the app hearing its own hint.
 */
export function useGuitarListener({ onWindow, record = false } = {}) {
  const [status, setStatus] = useState('idle') // idle | requesting | listening | error
  const [error, setError] = useState(null)
  const [live, setLive] = useState(null) // { midi, noteName } | null
  const [quiet, setQuiet] = useState(false)
  const rigRef = useRef(null) // { capture, collector, recorder, chunks, map, recordingStartWall }
  const sessionRef = useRef(0) // bumped by stop(), so a start still awaiting the mic gives up
  const onWindowRef = useRef(onWindow)

  useEffect(() => {
    onWindowRef.current = onWindow
  }, [onWindow])

  const stop = useCallback(
    () =>
      new Promise((resolve) => {
        sessionRef.current += 1
        const rig = rigRef.current
        rigRef.current = null
        setStatus('idle')
        setLive(null)
        setQuiet(false)
        if (!rig) {
          resolve(null)
          return
        }
        const finish = () => {
          rig.capture.stop()
          resolve(rig.chunks.length ? new Blob(rig.chunks, { type: rig.recorder?.mimeType || 'audio/webm' }) : null)
        }
        // Stop the recorder first and wait for its last chunk; ending the
        // tracks first can end it before that data arrives.
        if (rig.recorder && rig.recorder.state !== 'inactive') {
          rig.recorder.onstop = finish
          rig.recorder.stop()
        } else {
          finish()
        }
      }),
    [],
  )

  /** Resolves true once listening, false if the microphone couldn't be opened. Call from a tap. */
  const start = useCallback(async () => {
    if (rigRef.current) return true
    const session = ++sessionRef.current
    setStatus('requesting')
    setError(null)
    const pitch = createPitchTracker({ bufferSize: FRAME_SIZE, minRms: 0.005, maxFrequency: 1400 })
    let rig = null
    try {
      const capture = await createCapture({
        frameSize: FRAME_SIZE,
        hop: HOP,
        onFrame: ({ samples, level, position }) => {
          if (!rig) return
          const now = performance.now()
          rig.map = { position, wall: now }
          const reading = pitch.analyze(samples, capture.sampleRate)
          rig.collector.frame({ samples, position, level, midi: reading?.midi ?? null })
          if (level >= SOUND_FLOOR) rig.lastSound = now
          if (now - rig.lastUi >= UI_INTERVAL_MS) {
            rig.lastUi = now
            setLive(reading ? { midi: reading.midi, noteName: midiToNoteName(reading.midi) } : null)
            setQuiet(now - rig.lastSound > QUIET_MS)
          }
        },
        onOnset: ({ position }) => rig?.collector.onset(position),
      })
      if (session !== sessionRef.current) {
        capture.stop()
        return false
      }
      const sampleRate = capture.sampleRate
      const toWall = (position) => rig.map.wall - ((rig.map.position - position) / sampleRate) * 1000
      const collector = createWindowCollector({
        sampleRate,
        frameSize: FRAME_SIZE,
        hop: HOP,
        onWindow: (w) => onWindowRef.current?.({ ...w, sampleRate, wall: toWall(w.onset) }),
      })

      let recorder = null
      const chunks = []
      if (record && typeof MediaRecorder !== 'undefined') {
        try {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined
          recorder = new MediaRecorder(capture.stream, mimeType ? { mimeType } : undefined)
          recorder.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data)
          }
          recorder.start(250)
        } catch (err) {
          console.warn('MediaRecorder unavailable, listening only', err)
          recorder = null
        }
      }

      const now = performance.now()
      rig = { capture, collector, recorder, chunks, map: { position: 0, wall: now }, lastSound: now, lastUi: 0, recordingStartWall: now }
      rigRef.current = rig
      setStatus('listening')
      return true
    } catch (err) {
      if (session !== sessionRef.current) return false
      console.error(err)
      setError(err.name === 'NotAllowedError' ? 'Microphone permission was denied.' : err.message || 'Microphone unavailable.')
      setStatus('error')
      return false
    }
  }, [record])

  const muteFor = useCallback((ms) => {
    const rig = rigRef.current
    if (!rig) return
    rig.collector.muteUntil(rig.map.position + Math.round((ms / 1000) * rig.capture.sampleRate))
  }, [])

  const getRecordingStartWall = useCallback(() => rigRef.current?.recordingStartWall ?? null, [])

  useEffect(
    () => () => {
      sessionRef.current += 1
      const rig = rigRef.current
      rigRef.current = null
      if (rig?.recorder && rig.recorder.state !== 'inactive') rig.recorder.stop()
      rig?.capture.stop()
    },
    [],
  )

  return { status, error, live, quiet, start, stop, muteFor, getRecordingStartWall }
}
