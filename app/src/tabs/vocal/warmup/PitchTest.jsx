import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { useMicPitch } from '../audio/useMicPitch.js'
import Celebration from '../ui/Celebration.jsx'
import { noteName } from './warmupLogic.js'
import { TEST_NOTES, createNoteCatcher, judgePhrase, randomPhrase } from './pitchTestLogic.js'

const LENGTHS = [3, 4, 5, 6]
const NOTE_SECONDS = 0.6
const STEP_SECONDS = 0.8
// After the last note, wait this long before listening so the piano's tail isn't caught.
const DEAF_SECONDS = 0.4
const FADE_SECONDS = 0.1

/**
 * Pitch test: plays a few random notes within an octave that suits the voice
 * part, then listens while the singer sings them back in the same order.
 * Passed when every note matched.
 */
export default function PitchTest({ part, onExit }) {
  const [length, setLength] = useState(4)
  // null before the first try; otherwise { phrase, phase: 'playing' | 'singing' | 'done', sung: [midi] }
  const [run, setRun] = useState(null)
  const runRef = useRef(null)
  const listeningRef = useRef(false)
  const catcherRef = useRef(createNoteCatcher())
  const synthRef = useRef(null)
  const timersRef = useRef([])

  const update = useCallback((next) => {
    runRef.current = typeof next === 'function' ? next(runRef.current) : next
    setRun(runRef.current)
  }, [])

  const getTime = useCallback(() => (listeningRef.current ? performance.now() / 1000 : null), [])
  const onSample = useCallback(
    (sample) => {
      const r = runRef.current
      if (!listeningRef.current || !r || r.phase !== 'singing') return
      const caught = catcherRef.current.push(sample)
      if (!caught) return
      const sung = [...r.sung, caught.midi]
      const done = sung.length >= r.phrase.length
      if (done) listeningRef.current = false
      update({ ...r, sung, phase: done ? 'done' : 'singing' })
    },
    [update],
  )
  const mic = useMicPitch({ getTime, onSample })
  const { stop: stopMic } = mic

  const silence = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    listeningRef.current = false
    const synth = synthRef.current
    synthRef.current = null
    if (!synth) return
    synth.volume.rampTo(-Infinity, FADE_SECONDS)
    setTimeout(() => synth.dispose(), FADE_SECONDS * 2000)
  }, [])

  useEffect(
    () => () => {
      silence()
      stopMic()
    },
    [silence, stopMic],
  )

  // Done singing: let the microphone go.
  useEffect(() => {
    if (run?.phase === 'done') stopMic()
  }, [run?.phase, stopMic])

  const play = async (phrase) => {
    silence()
    if (!(await mic.start())) return
    await Tone.start()
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.3 },
    }).toDestination()
    synth.volume.value = -6
    synthRef.current = synth
    const at = Tone.now() + 0.15
    phrase.forEach((midi, i) => {
      synth.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), NOTE_SECONDS, at + i * STEP_SECONDS)
    })
    update({ phrase, phase: 'playing', sung: [] })
    const listenIn = at - Tone.now() + (phrase.length - 1) * STEP_SECONDS + NOTE_SECONDS + DEAF_SECONDS
    timersRef.current.push(
      setTimeout(() => {
        if (synthRef.current !== synth) return
        catcherRef.current.reset()
        listeningRef.current = true
        update((r) => r && { ...r, phase: 'singing' })
      }, Math.max(0, listenIn * 1000)),
    )
  }

  const stop = () => {
    silence()
    stopMic()
    update(null)
  }

  const results = run?.phase === 'done' ? judgePhrase(run.sung, run.phrase) : null
  const passed = results?.every((r) => r.right)
  const { low } = TEST_NOTES[part.id]

  if (!run) {
    return (
      <div className="warm-up">
        <div className="warm-up__now">
          <span className="warm-up__now-label">Pitch test · {part.name}</span>
          <strong className="warm-up__now-note">
            {noteName(low)}–{noteName(low + 12)}
          </strong>
          <span className="warm-up__now-detail">Random notes from this octave</span>
        </div>
        <h2 className="vocal-tab__section-title">How many notes</h2>
        <div className="warm-up__voices" role="radiogroup" aria-label="How many notes">
          {LENGTHS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={length === n}
              className={`warm-up__voice${length === n ? ' warm-up__voice--on' : ''}`}
              onClick={() => setLength(n)}
            >
              {n}
            </button>
          ))}
        </div>
        {mic.error && <p className="warm-up__error">Microphone: {mic.error}</p>}
        <div className="warm-up__controls">
          <button type="button" className="warm-up__primary" onClick={() => play(randomPhrase(part, length))}>
            Start
          </button>
          <button type="button" className="warm-up__secondary" onClick={onExit}>
            Done
          </button>
        </div>
        <details className="v-howto">
          <summary>How it works</summary>
          <ul className="warm-up__how">
            <li>Listen to the notes, then sing them back in the same order.</li>
            <li>Hold each note for a moment. To sing the same note twice, take a breath between.</li>
            <li>The same note an octave away counts.</li>
          </ul>
        </details>
      </div>
    )
  }

  return (
    <div className="warm-up">
      <div className="warm-up__now">
        <span className="warm-up__now-label">Pitch test · {part.name}</span>
        {run.phase === 'done' ? (
          <span className={`warm-up__cue warm-up__cue--${passed ? 'sing' : 'listen'}`} aria-live="polite">
            {passed ? 'Passed' : 'Not yet'}
          </span>
        ) : (
          <span className={`warm-up__cue warm-up__cue--${run.phase === 'singing' ? 'sing' : 'listen'}`} aria-live="polite">
            {run.phase === 'singing' ? 'Sing' : 'Listen'}
          </span>
        )}
        <ol className="pitch-test__chords" aria-label="Notes">
          {run.phrase.map((target, i) => {
            const result = results?.[i]
            const sung = run.sung[i]
            const state = result ? (result.right ? 'right' : 'wrong') : sung !== undefined ? 'sung' : 'todo'
            return (
              <li key={i} className={`pitch-test__chord pitch-test__chord--${state}`}>
                {result
                  ? `${noteName(target)}${result.right ? ' ✓' : ` ✗ (${sung === undefined ? '–' : noteName(Math.round(sung))})`}`
                  : sung !== undefined
                    ? noteName(Math.round(sung))
                    : '?'}
              </li>
            )
          })}
        </ol>
        <span className="warm-up__now-detail">
          {run.phase === 'playing'
            ? `${run.phrase.length} notes`
            : run.phase === 'singing'
              ? mic.current
                ? `Hearing ${mic.current.noteName}`
                : `Note ${run.sung.length + 1} of ${run.phrase.length}`
              : passed
                ? 'Every note in the right order.'
                : `${results.filter((r) => r.right).length} of ${run.phrase.length} right.`}
        </span>
      </div>
      {run.phase === 'done' && <Celebration id="pitch-test" right={results.filter((r) => r.right).length} total={run.phrase.length} />}
      {mic.error && <p className="warm-up__error">Microphone: {mic.error}</p>}
      <div className="warm-up__controls">
        {run.phase === 'done' ? (
          <>
            <button type="button" className="warm-up__primary" onClick={() => play(randomPhrase(part, length))}>
              New notes
            </button>
            <button type="button" className="warm-up__secondary" onClick={() => play(run.phrase)}>
              Same notes again
            </button>
            <button type="button" className="warm-up__secondary" onClick={stop}>
              Done
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="warm-up__secondary"
              disabled={run.phase === 'playing'}
              onClick={() => play(run.phrase)}
            >
              Hear them again
            </button>
            <button type="button" className="warm-up__primary" onClick={stop}>
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  )
}
