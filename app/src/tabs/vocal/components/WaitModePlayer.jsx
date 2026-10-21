import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import './PracticeModes.css'
import PlaybackControls from './PlaybackControls.jsx'
import PracticeSummary from './PracticeSummary.jsx'
import { useMicPitch } from '../audio/useMicPitch.js'
import { frequencyToMidi, midiToNoteName } from '../audio/pitchDetector.js'
import { createHoldDetector, noteDistanceCents, soundingAt } from '../practice/practiceLogic.js'
import {
  createListeningClock,
  formatSeconds,
  liveVerdict,
  REACTION_FULL_MS,
  SLOW_NOTE_MS,
  STRICT_HOLD,
  summarizeWaitRun,
} from '../practice/scoring.js'
import { useSessionRuns } from '../practice/sessionRuns.js'

const TARGET_CLASS = 'practice-note--target'
const SUNG_CLASS = 'practice-note--sung'
const SLOW_CLASS = 'practice-note--slow'
const HINT_SECONDS = 0.8
// Ignore the mic while the hint tone (and a little room echo) is sounding,
// or the speaker would "sing" the note for the user.
const HINT_DEAF_MS = HINT_SECONDS * 1000 + 300

const HELD_CHORD_DB = -14

/**
 * What the other parts are sounding at the target's onset, minus anything
 * with the target's note name: through speakers the mic would hear that
 * pitch and move on without the singer.
 */
function heldChord(backingNotes, target) {
  const pitchClass = (midi) => ((Math.round(midi) % 12) + 12) % 12
  return soundingAt(backingNotes, target.time).filter(
    (f) => pitchClass(frequencyToMidi(f)) !== pitchClass(target.midi),
  )
}

/** There's no playback clock in this mode; any non-null time lets samples through. */
const wallClock = () => performance.now() / 1000

/**
 * "Wait for me": no backing track. The next melody note is highlighted
 * (cursor + coloured notehead) and the score only moves on once the mic
 * hears that note held on pitch (see practiceLogic.createHoldDetector).
 * Play/Pause start and stop listening, Stop goes back to the first note,
 * and the scrub bar jumps to a note.
 *
 * With `backingNotes` (the other parts, "with all parts"), whatever they
 * are sounding at the target's moment is held as a chord while waiting,
 * and changes as the singer moves on.
 *
 * Scoring (practice/scoring.js): each note is timed from when it's
 * highlighted to when the singer first lands on it, counting listening time
 * only. A run from the first note to the last gets a score and joins this
 * session's tries for `runsKey` (practice/sessionRuns.js); slow notes are
 * marked amber on the score.
 */
function WaitModePlayer({ melody, duration, sheetMusicRef, disabled, backingNotes = null, runsKey }) {
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)
  const [detector] = useState(() => createHoldDetector(STRICT_HOLD))
  const [clock] = useState(createListeningClock)
  const listeningRef = useRef(false)
  // This run's times, and whether it started on the first note (only those are charted).
  const runRef = useRef({ fromStart: true, results: [] })
  const [lastMs, setLastMs] = useState(null)
  const [summary, setSummary] = useState(null)
  const [runs, addRun] = useSessionRuns(runsKey)
  const deafUntilRef = useRef(0)
  const synthRef = useRef(null)
  const chordSynthRef = useRef(null)
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
      clock.restart(performance.now(), listeningRef.current)
      highlight(i)
    },
    [clock, detector, highlight],
  )

  const newRun = useCallback(() => {
    runRef.current = { fromStart: true, results: [] }
    setLastMs(null)
    setSummary(null)
    sheetMusicRef.current?.clearMarks(SLOW_CLASS)
  }, [sheetMusicRef])

  // Last note sung: score the run, mark the slow notes, add it to the session.
  const finishRun = useCallback(() => {
    const { fromStart, results } = runRef.current
    if (!results.length) return
    const charted = fromStart && results.length === melody.length
    const result = summarizeWaitRun(results)
    for (const r of results) {
      if (r.ms <= SLOW_NOTE_MS) continue
      sheetMusicRef.current?.markNote(r.index, SUNG_CLASS, false)
      sheetMusicRef.current?.markNote(r.index, SLOW_CLASS)
    }
    if (charted) addRun(result.score)
    setSummary({ ...result, charted })
  }, [addRun, melody.length, sheetMusicRef])

  const handleSample = useCallback(
    (sample) => {
      const now = performance.now()
      if (now < deafUntilRef.current) return
      const note = melody[indexRef.current]
      if (!note || !detector.update(sample.midi, note.midi, now)) return
      // Timed to when the singer first landed on it, not to the end of the hold.
      const ms = clock.at(detector.onsetMs ?? now)
      runRef.current.results.push({ index: note.index, position: indexRef.current, midi: note.midi, ms })
      setLastMs(ms)
      sheetMusicRef.current?.markNote(note.index, SUNG_CLASS)
      goTo(indexRef.current + 1)
      if (indexRef.current >= melody.length) finishRun()
    },
    [clock, detector, finishRun, goTo, melody, sheetMusicRef],
  )

  const mic = useMicPitch({ getTime: wallClock, onSample: handleSample })
  const listening = mic.status === 'listening'

  // The note clock runs only while listening.
  useEffect(() => {
    listeningRef.current = listening
    if (listening) clock.resume(performance.now())
    else clock.pause(performance.now())
  }, [clock, listening])

  // Show the first target as soon as the mode is picked; leave a clean score behind.
  useEffect(() => {
    const viewer = sheetMusicRef.current
    highlight(indexRef.current)
    return () => {
      viewer?.clearMarks(TARGET_CLASS)
      viewer?.clearMarks(SUNG_CLASS)
      viewer?.clearMarks(SLOW_CLASS)
      viewer?.reset()
    }
  }, [highlight, sheetMusicRef])

  // Hold the other parts' chord under the current target while listening.
  useEffect(() => {
    const target = melody[index]
    if (!backingNotes || !listening || !target) return undefined
    if (!chordSynthRef.current) {
      chordSynthRef.current = new Tone.PolySynth(Tone.Synth, {
        envelope: { attack: 0.08, decay: 0.2, sustain: 0.7, release: 0.5 },
      }).toDestination()
      chordSynthRef.current.volume.value = HELD_CHORD_DB
    }
    const synth = chordSynthRef.current
    const chord = heldChord(backingNotes, target)
    if (chord.length) synth.triggerAttack(chord)
    return () => synth.releaseAll()
  }, [backingNotes, listening, index, melody])

  // Last note sung: release the microphone.
  useEffect(() => {
    if (done && listening) mic.stop()
  }, [done, listening, mic])

  useEffect(
    () => () => {
      synthRef.current?.dispose()
      synthRef.current = null
      chordSynthRef.current?.dispose()
      chordSynthRef.current = null
    },
    [],
  )

  const play = useCallback(async () => {
    if (done) {
      sheetMusicRef.current?.clearMarks(SUNG_CLASS)
      newRun()
      goTo(0)
    }
    if (backingNotes) await Tone.start() // audio must be unlocked inside the click
    await mic.start()
  }, [backingNotes, done, goTo, mic, newRun, sheetMusicRef])

  const stop = useCallback(() => {
    mic.stop()
    sheetMusicRef.current?.clearMarks(SUNG_CLASS)
    newRun()
    goTo(0)
  }, [goTo, mic, newRun, sheetMusicRef])

  const seek = useCallback(
    (time) => {
      const found = melody.findIndex((note) => note.time >= time - 1e-3)
      const i = found === -1 ? melody.length - 1 : found
      if (i === 0) newRun()
      else {
        // Skipping notes: still scored, but not charted.
        runRef.current.fromStart = false
        setSummary(null)
      }
      goTo(i)
    },
    [goTo, melody, newRun],
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
          <span className={`practice-status__live practice-status__live--${live ? liveVerdict(liveCents, STRICT_HOLD.toleranceCents) : 'rest'}`}>
            {live ? `you: ${live.noteName} (${liveCents > 0 ? '+' : ''}${Math.round(liveCents)}¢)` : 'listening…'}
          </span>
        )}
        {lastMs !== null && !done && <span>last note: found in {formatSeconds(lastMs)}</span>}
        {target && (
          <button type="button" className="practice-status__link" onClick={hearNote}>
            Hear note
          </button>
        )}
        {mic.status === 'error' && <span className="practice-status__error">{mic.error}</span>}
      </div>
      {(summary || runs.length > 0) && (
        <PracticeSummary
          title="How well you know the melody"
          score={summary?.score ?? null}
          runs={runs}
          charted={summary?.charted ?? true}
          chartLabel="Wait for me scores this session, by try"
        >
          {summary && (
            <>
              <p>
                You took {formatSeconds(summary.averageMs)} on average to find each note (full marks within{' '}
                {formatSeconds(REACTION_FULL_MS)}).
              </p>
              {summary.slow.length > 0 ? (
                <p>
                  Slowest (amber on the score):{' '}
                  {summary.slow
                    .map((r) => `note ${r.position + 1} (${midiToNoteName(r.midi)}) ${formatSeconds(r.ms)}`)
                    .join(', ')}
                </p>
              ) : (
                <p>Every note came within {formatSeconds(SLOW_NOTE_MS)}: you know this one.</p>
              )}
            </>
          )}
        </PracticeSummary>
      )}
    </>
  )
}

export default WaitModePlayer
