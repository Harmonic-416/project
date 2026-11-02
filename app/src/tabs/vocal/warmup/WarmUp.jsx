import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import TempoControl from '../../../audio/tempo/TempoControl.jsx'
import { useSongTempo } from '../../../audio/tempo/useSongTempo.js'
import { parseMidiFile } from '../midi/parseMidi.js'
import { VOICE_PARTS, WARMUP_URL, noteName, splitWarmup, voicePart, warmupShifts } from './warmupLogic.js'
import './WarmUp.css'

const VOICE_KEY = 'harmonic.voicePart'
// Saved like a song's tempo, under its own key.
const TEMPO_KEY = 'warmup'
// How far ahead of each time through the next one's notes are put on the audio clock.
const LOOKAHEAD_SECONDS = 0.3
const FADE_SECONDS = 0.1

const DIRECTIONS = {
  upper: { title: 'Upper range', blurb: 'Climbs a half step each time', arrow: '↑' },
  lower: { title: 'Lower range', blurb: 'Drops a half step each time', arrow: '↓' },
}

function loadVoice() {
  try {
    return voicePart(globalThis.localStorage.getItem(VOICE_KEY))?.id ?? null
  } catch {
    return null
  }
}

function saveVoice(id) {
  try {
    globalThis.localStorage.setItem(VOICE_KEY, id)
  } catch {
    // Private window or blocked storage: asked again next time.
  }
}

function Instructions() {
  return (
    <ul className="warm-up__how">
      <li>Sing on any vowel: “ah”, “oh”, “oo”, whatever feels comfortable.</li>
      <li>
        Sing while it says <strong>Sing</strong>. The last two notes of each round aren’t sung: they’re the piano
        moving a half step and giving you the next starting note, so just <strong>Listen</strong>.
      </li>
      <li>Stop whenever you reach your limit.</li>
    </ul>
  )
}

/**
 * Warm up: piano-only guide through the upper- or lower-range exercise in
 * public/warmup/warmup.mid, a half step further each time through, from a
 * start that suits the chosen voice part until it reaches the edge of the
 * part's range or the singer stops it. It doesn't listen. The tempo dial
 * slows it to 50–100%; a change is heard from the next time through.
 */
export default function WarmUp() {
  const [patterns, setPatterns] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [voice, setVoice] = useState(loadVoice)
  // null, or { direction, shifts, rep, phase: 'sing' | 'listen', done } while a
  // warm-up is under way or just finished
  const [run, setRun] = useState(null)
  const [tempo, setTempo] = useSongTempo(TEMPO_KEY)
  const rateRef = useRef(tempo / 100)
  useEffect(() => {
    rateRef.current = tempo / 100
  }, [tempo])
  const synthRef = useRef(null)
  const timersRef = useRef([])

  useEffect(() => {
    let live = true
    fetch(WARMUP_URL)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load the warm-up.')
        return response.arrayBuffer()
      })
      .then(parseMidiFile)
      .then((midi) => live && setPatterns(splitWarmup(midi)))
      .catch((err) => live && setLoadError(err.message || 'Could not load the warm-up.'))
    return () => {
      live = false
    }
  }, [])

  const silence = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    const synth = synthRef.current
    synthRef.current = null
    if (!synth) return
    // Notes already on the audio clock would still sound: fade out, then dispose.
    synth.volume.rampTo(-Infinity, FADE_SECONDS)
    setTimeout(() => synth.dispose(), FADE_SECONDS * 2000)
  }, [])

  useEffect(() => silence, [silence])

  const later = (fn, seconds) => {
    timersRef.current.push(setTimeout(fn, Math.max(0, seconds * 1000)))
  }

  const start = async (direction) => {
    const part = voicePart(voice)
    if (!patterns || !part) return
    silence()
    await Tone.start()
    const pattern = patterns[direction]
    const shifts = warmupShifts(pattern, part, direction)
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.4, sustain: 0.25, release: 0.6 },
    }).toDestination()
    synth.volume.value = -6
    synthRef.current = synth
    setRun({ direction, shifts, rep: 0, phase: 'sing', done: false })

    // Each time through is laid out at the tempo of the moment, so the dial
    // can move while it plays.
    const playRep = (rep, at) => {
      if (synthRef.current !== synth) return
      const rate = rateRef.current
      for (const n of pattern.notes) {
        synth.triggerAttackRelease(
          Tone.Frequency(n.midi + shifts[rep], 'midi').toFrequency(),
          n.duration / rate,
          at + n.time / rate,
        )
      }
      later(() => setRun((r) => r && { ...r, rep, phase: 'sing' }), at - Tone.now())
      later(() => setRun((r) => r && { ...r, phase: 'listen' }), at + pattern.cueAt / rate - Tone.now())
      const next = rep + 1
      const nextAt = at + pattern.length / rate
      if (next < shifts.length) {
        later(() => playRep(next, nextAt), nextAt - Tone.now() - LOOKAHEAD_SECONDS)
      } else {
        later(() => {
          silence()
          setRun((r) => r && { ...r, done: true })
        }, nextAt - Tone.now() + 0.6)
      }
    }
    playRep(0, Tone.now() + 0.15)
  }

  const stop = () => {
    silence()
    setRun(null)
  }

  const part = voicePart(voice)

  if (run) {
    const pattern = patterns[run.direction]
    const { title, arrow } = DIRECTIONS[run.direction]
    const startNote = (rep) => noteName(pattern.notes[0].midi + run.shifts[rep])
    const singing = run.phase === 'sing'
    const lastRound = run.rep === run.shifts.length - 1
    return (
      <div className="warm-up">
        <div className="warm-up__now">
          <span className="warm-up__now-label">
            {title} · {part.name}
          </span>
          {run.done ? (
            <>
              <strong className="warm-up__now-note">Done</strong>
              <span className="warm-up__now-detail">
                That’s the {run.direction === 'upper' ? 'top' : 'bottom'} of a typical {part.name.toLowerCase()} range.
              </span>
            </>
          ) : (
            <>
              <span className={`warm-up__cue warm-up__cue--${run.phase}`} aria-live="polite">
                {singing ? 'Sing' : 'Listen'}
              </span>
              <strong className="warm-up__now-note">
                {arrow} {singing || lastRound ? startNote(run.rep) : startNote(run.rep + 1)}
              </strong>
              <span className="warm-up__now-detail">
                {singing
                  ? `Starting note · ${run.rep + 1} of ${run.shifts.length}`
                  : lastRound
                    ? 'Last round: no need to sing these'
                    : 'Next starting note: don’t sing these two, just listen'}
              </span>
            </>
          )}
        </div>
        <TempoControl pct={tempo} onChange={setTempo} bpm={pattern.bpm} />
        <div className="warm-up__controls">
          {run.done ? (
            <>
              <button type="button" className="warm-up__primary" onClick={() => start(run.direction)}>
                Again
              </button>
              <button type="button" className="warm-up__secondary" onClick={stop}>
                Done
              </button>
            </>
          ) : (
            <button type="button" className="warm-up__primary" onClick={stop}>
              Stop
            </button>
          )}
        </div>
        <Instructions />
      </div>
    )
  }

  return (
    <div className="warm-up">
      <p className="warm-up__hint">
        The piano plays a short exercise over and over, a half step further each time. Just sing along; it won’t
        listen.
      </p>
      <Instructions />

      <h2 className="vocal-tab__section-title">Your voice part</h2>
      <div className="warm-up__voices" role="radiogroup" aria-label="Voice part">
        {VOICE_PARTS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={voice === v.id}
            className={`warm-up__voice${voice === v.id ? ' warm-up__voice--on' : ''}`}
            onClick={() => {
              setVoice(v.id)
              saveVoice(v.id)
            }}
          >
            {v.name}
          </button>
        ))}
      </div>

      <TempoControl pct={tempo} onChange={setTempo} bpm={patterns?.upper.bpm} />

      {loadError && <p className="warm-up__error">{loadError}</p>}

      {Object.entries(DIRECTIONS).map(([direction, { title, blurb, arrow }]) => {
        const pattern = patterns?.[direction]
        const shifts = pattern && part ? warmupShifts(pattern, part, direction) : null
        return (
          <button
            key={direction}
            type="button"
            className="vocal-tab__search-songs"
            disabled={!shifts}
            onClick={() => start(direction)}
          >
            <span className="vocal-tab__search-icon" aria-hidden="true">
              {arrow}
            </span>
            <span>
              <strong>Warm up {title.toLowerCase()}</strong>
              <small>
                {shifts
                  ? `${blurb}, ${noteName(pattern.notes[0].midi + shifts[0])} to ${noteName(
                      pattern.notes[0].midi + shifts[shifts.length - 1],
                    )}`
                  : part
                    ? 'Loading…'
                    : 'Choose your voice part first'}
              </small>
            </span>
          </button>
        )
      })}
    </div>
  )
}
