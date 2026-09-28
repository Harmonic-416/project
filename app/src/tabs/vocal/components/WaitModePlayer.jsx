import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import './PracticeModes.css'
import PlaybackControls from './PlaybackControls.jsx'
import { useMicPitch } from '../audio/useMicPitch.js'
import { midiToNoteName } from '../audio/pitchDetector.js'
import { createHoldDetector, noteDistanceCents } from '../practice/practiceLogic.js'

const TARGET_CLASS = 'practice-note--target'
const SUNG_CLASS = 'practice-note--sung'
const HINT_SECONDS = 0.8
// Ignore the mic while the hint tone (and a little room echo) is sounding,
// or the speaker would "sing" the note for the user.
const HINT_DEAF_MS = HINT_SECONDS * 1000 + 300

/** There's no playback clock in this mode; any non-null time lets samples through. */
const wallClock = () => performance.now() / 1000

function verdictFor(cents) {
  const abs = Math.abs(cents)
  if (abs <= 50) return 'in-tune'
  if (abs <= 100) return 'close'
  return 'wrong'
}

/**
 * "Wait for me": no backing track. The next melody note is highlighted
 * (cursor + coloured notehead) and the score only moves on once the mic
 * hears that note held on pitch (see practiceLogic.createHoldDetector).
 * Play/Pause start and stop listening, Stop goes back to the first note,
 * and the scrub bar jumps to a note.
 */
function WaitModePlayer({ melody, duration, sheetMusicRef, disabled }) {
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)
  const [detector] = useState(() => createHoldDetector())
  const deafUntilRef = useRef(0)
  const synthRef = useRef(null)
  const done = melody.length > 0 && index >= melody.length

  const highlight = useCallback(
    (i) => {
      const viewer = sheetMusicRef.current
      viewer?.clearMarks(TARGET_CLASS)
      const note = melody[i]
      if (!note) return
      viewer?.show()
      viewer?.goToStep(note.step)
      viewer?.markNote(note.index, TARGET_CLASS)
    },
    [melody, sheetMusicRef],
  )

  const goTo = useCallback(
    (i) => {
      indexRef.current = i
      setIndex(i)
      detector.reset()
      highlight(i)
    },
    [detector, highlight],
  )

  const handleSample = useCallback(
    (sample) => {
      const now = performance.now()
      if (now < deafUntilRef.current) return
      const note = melody[indexRef.current]
      if (!note || !detector.update(sample.midi, note.midi, now)) return
      sheetMusicRef.current?.markNote(note.index, SUNG_CLASS)
      goTo(indexRef.current + 1)
    },
    [detector, goTo, melody, sheetMusicRef],
  )

  const mic = useMicPitch({ getTime: wallClock, onSample: handleSample })
  const listening = mic.status === 'listening'

  // Show the first target as soon as the mode is picked; leave a clean score behind.
  useEffect(() => {
    const viewer = sheetMusicRef.current
    highlight(indexRef.current)
    return () => {
      viewer?.clearMarks(TARGET_CLASS)
      viewer?.clearMarks(SUNG_CLASS)
      viewer?.reset()
    }
  }, [highlight, sheetMusicRef])

  // Last note sung: release the microphone.
  useEffect(() => {
    if (done && listening) mic.stop()
  }, [done, listening, mic])

  useEffect(
    () => () => {
      synthRef.current?.dispose()
      synthRef.current = null
    },
    [],
  )

  const play = useCallback(async () => {
    if (done) {
      sheetMusicRef.current?.clearMarks(SUNG_CLASS)
      goTo(0)
    }
    await mic.start()
  }, [done, goTo, mic, sheetMusicRef])

  const stop = useCallback(() => {
    mic.stop()
    sheetMusicRef.current?.clearMarks(SUNG_CLASS)
    goTo(0)
  }, [goTo, mic, sheetMusicRef])

  const seek = useCallback(
    (time) => {
      const i = melody.findIndex((note) => note.time >= time - 1e-3)
      goTo(i === -1 ? melody.length - 1 : i)
    },
    [goTo, melody],
  )

  const hearNote = useCallback(async () => {
    const note = melody[indexRef.current]
    if (!note) return
    await Tone.start()
    if (!synthRef.current) synthRef.current = new Tone.Synth().toDestination()
    deafUntilRef.current = performance.now() + HINT_DEAF_MS
    detector.reset()
    synthRef.current.triggerAttackRelease(note.frequency, HINT_SECONDS)
  }, [detector, melody])

  const target = melody[index] ?? null
  const live = mic.current
  const liveCents = live && target ? noteDistanceCents(live.midi, target.midi) : null
  const controlState = done ? 'stopped' : listening ? 'playing' : index > 0 ? 'paused' : 'idle'

  return (
    <>
      <PlaybackControls
        state={controlState}
        position={(target ?? melody[melody.length - 1])?.time ?? 0}
        duration={duration}
        onPlay={play}
        onPause={mic.stop}
        onStop={stop}
        onSeek={seek}
        disabled={disabled || !melody.length || mic.status === 'requesting'}
      />
      <div className="practice-status" aria-live="polite">
        {done ? (
          <strong>Nice — you sang every note. Press Play to go again.</strong>
        ) : (
          target && (
            <span>
              Note {index + 1} of {melody.length}: sing <strong>{midiToNoteName(target.midi)}</strong>
            </span>
          )
        )}
        {listening && !done && (
          <span className={`practice-status__live practice-status__live--${live ? verdictFor(liveCents) : 'rest'}`}>
            {live ? `you: ${live.noteName} (${liveCents > 0 ? '+' : ''}${Math.round(liveCents)}¢)` : 'listening…'}
          </span>
        )}
        {target && (
          <button type="button" className="practice-status__link" onClick={hearNote}>
            Hear note
          </button>
        )}
        {mic.status === 'error' && <span className="practice-status__error">{mic.error}</span>}
      </div>
    </>
  )
}

export default WaitModePlayer
