import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { useMicPitch } from '../audio/useMicPitch.js'
import Celebration from '../ui/Celebration.jsx'
import { noteName } from './warmupLogic.js'
import { harmonyShift, isRightNote, judgeMeasure } from './pitchTestLogic.js'

const FADE_SECONDS = 0.1
const TICK_MS = 50
// The singer's starting note sounds for this many beats of the one-bar count-in.
const REFERENCE_BEATS = 2

function moveLabel(move) {
  if (move > 0) return { arrow: '↑', text: move === 1 ? 'Half step up' : `${move} half steps up` }
  if (move < 0) return { arrow: '↓', text: move === -1 ? 'Half step down' : `${-move} half steps down` }
  return { arrow: '→', text: 'Stay on this note' }
}

/**
 * Harmony test: the piano plays the outer notes of each chord in
 * public/pitch-tests/harmony.mid, moved to suit the voice part, while the
 * microphone listens for the singer on the middle note. Beat 4 of each bar
 * shows which way the next chord moves. Passed when every bar was held in tune.
 */
export default function HarmonyTest({ harmony, part, onExit }) {
  const shift = harmonyShift(harmony, part)
  const { measures, beat } = harmony
  const bar = beat * 4
  // null before the first try; otherwise { elapsed, results, done }
  const [run, setRun] = useState(null)
  const startRef = useRef(null) // Tone time of bar 1, while a run is under way
  const samplesRef = useRef([])
  const synthRef = useRef(null)
  const timerRef = useRef(null)

  const getTime = useCallback(() => (startRef.current === null ? null : Tone.now() - startRef.current), [])
  const onSample = useCallback((sample) => {
    samplesRef.current.push({ time: sample.time, midi: sample.midi })
  }, [])
  const mic = useMicPitch({ getTime, onSample })
  const { stop: stopMic } = mic

  const silence = useCallback(() => {
    clearInterval(timerRef.current)
    timerRef.current = null
    startRef.current = null
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

  const start = async () => {
    silence()
    if (!(await mic.start())) return
    await Tone.start()
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.4 },
    }).toDestination()
    synth.volume.value = -8
    synthRef.current = synth

    const countIn = Tone.now() + 0.15
    const at = countIn + bar
    const hz = (midi) => Tone.Frequency(midi + shift, 'midi').toFrequency()
    synth.triggerAttackRelease(hz(measures[0].target), beat * REFERENCE_BEATS, countIn)
    for (const n of harmony.backing) synth.triggerAttackRelease(hz(n.midi), n.duration, at + n.time)

    samplesRef.current = []
    startRef.current = at
    setRun({ elapsed: -bar, results: [], done: false })
    timerRef.current = setInterval(() => {
      if (synthRef.current !== synth) return
      const elapsed = Tone.now() - at
      setRun((r) => {
        if (!r || r.done) return r
        const results = [...r.results]
        while (results.length < measures.length && elapsed >= measures[results.length].end) {
          const m = measures[results.length]
          results.push(judgeMeasure(samplesRef.current, m, m.target + shift))
        }
        const done = results.length === measures.length
        return { elapsed, results, done }
      })
      if (elapsed >= harmony.length) {
        silence()
        stopMic()
      }
    }, TICK_MS)
  }

  const stop = () => {
    silence()
    stopMic()
    setRun(null)
  }

  const passed = run?.done && run.results.every((r) => r.pass)

  let display
  if (!run) {
    display = (
      <>
        <strong className="warm-up__now-note">{noteName(measures[0].target + shift)}</strong>
        <span className="warm-up__now-detail">Your starting note, the middle of the chord</span>
      </>
    )
  } else if (run.done) {
    display = (
      <>
        <span className={`warm-up__cue warm-up__cue--${passed ? 'sing' : 'listen'}`} aria-live="polite">
          {passed ? 'Passed' : 'Not yet'}
        </span>
        <span className="warm-up__now-detail">
          {passed
            ? 'You held the middle note through every chord.'
            : `In tune on ${run.results.filter((r) => r.pass).length} of ${measures.length} chords. Try again.`}
        </span>
      </>
    )
  } else if (run.elapsed < 0) {
    const count = Math.min(4, Math.floor((run.elapsed + bar) / beat) + 1)
    display = (
      <>
        <span className="warm-up__cue warm-up__cue--listen" aria-live="polite">
          {count <= REFERENCE_BEATS ? 'Listen' : `Get ready · ${count}`}
        </span>
        <strong className="warm-up__now-note">{noteName(measures[0].target + shift)}</strong>
        <span className="warm-up__now-detail">Your starting note</span>
      </>
    )
  } else {
    const index = measures.findIndex((m) => run.elapsed < m.end)
    const m = measures[index === -1 ? measures.length - 1 : index]
    const target = m.target + shift
    const cue = m.cueAt !== null && run.elapsed >= m.cueAt
    const sung = mic.current
    const onNote = sung && isRightNote(sung.midi, target)
    const { arrow, text } = cue ? moveLabel(m.move) : {}
    display = (
      <>
        <span className="warm-up__cue warm-up__cue--sing" aria-live="polite">
          Sing
        </span>
        <strong className="warm-up__now-note">{noteName(target)}</strong>
        <div className={`pitch-test__move${cue ? ' pitch-test__move--on' : ''}`} aria-live="polite">
          {cue ? (
            <>
              <span className="pitch-test__move-arrow" aria-hidden="true">
                {arrow}
              </span>
              <span>
                {text} next · {noteName(target + m.move)}
              </span>
            </>
          ) : (
            <span>Hold it</span>
          )}
        </div>
        <span className={`pitch-test__heard${sung ? (onNote ? ' pitch-test__heard--right' : ' pitch-test__heard--off') : ''}`}>
          {sung ? `Hearing ${sung.noteName}${onNote ? ' ✓' : ''}` : 'Not hearing you yet'}
        </span>
      </>
    )
  }

  return (
    <div className="warm-up">
      <div className="warm-up__now">
        <span className="warm-up__now-label">Harmony test · {part.name}</span>
        {display}
        {run && (
          <ol className="pitch-test__chords" aria-label="Chords">
            {measures.map((m, i) => {
              const result = run.results[i]
              const state = result ? (result.pass ? 'right' : 'wrong') : 'todo'
              return (
                <li key={m.start} className={`pitch-test__chord pitch-test__chord--${state}`}>
                  {noteName(m.target + shift)}
                  {result && <span aria-label={result.pass ? 'in tune' : 'off'}>{result.pass ? ' ✓' : ' ✗'}</span>}
                </li>
              )
            })}
          </ol>
        )}
      </div>
      {run?.done && <Celebration id="harmony-test" right={run.results.filter((r) => r.pass).length} total={measures.length} />}
      {mic.error && <p className="warm-up__error">Microphone: {mic.error}</p>}
      <div className="warm-up__controls">
        {run && !run.done ? (
          <button type="button" className="warm-up__primary" onClick={stop}>
            Stop
          </button>
        ) : (
          <>
            <button type="button" className="warm-up__primary" onClick={start}>
              {run ? 'Again' : 'Start'}
            </button>
            <button type="button" className="warm-up__secondary" onClick={onExit}>
              Done
            </button>
          </>
        )}
      </div>
      <details className="v-howto">
        <summary>How it works</summary>
        <ul className="warm-up__how">
          <li>Wear headphones so the microphone hears you, not the piano.</li>
          <li>
            The piano gives you your starting note, counts you in, then plays the top and bottom of each chord. Sing the
            middle note.
          </li>
          <li>On beat 4 of each bar an arrow shows whether the next chord moves a half step up or down.</li>
          <li>You pass if you’re in tune for at least half of every chord. The same note an octave away counts.</li>
        </ul>
      </details>
    </div>
  )
}
