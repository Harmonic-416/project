import { useEffect, useReducer, useRef, useState } from 'react'
import CheckBanner from './CheckBanner.jsx'
import ChordDiagram from './ChordDiagram.jsx'
import StringStates from './StringStates.jsx'
import { CHORDS, LABEL_MODES, STRING_NAMES, chordMidi } from './chords.js'
import { initialPractice, practiceReducer } from './practiceState.js'
import '../../../auth/authTheme.css'
import './PracticeScreen.css'

const MODES = [
  { id: 'learn', title: 'Learn', text: 'One chord at a time, waits for you', tag: 'V1' },
  { id: 'play', title: 'Play', text: 'Straight through, no stops', tag: 'V1' },
  { id: 'changes', title: 'Changes', text: 'Chord to chord, in time', tag: 'V2', disabled: true },
]

/**
 * Demo results until chord detection is connected. Detection will dispatch
 * exactly these actions (see practiceState.js), so nothing else changes.
 */
function demoResult(verdict, chord) {
  const used = chord.frets.map((fret) => fret >= 0)
  if (verdict === 'verified') return used.map((u) => (u ? 'good' : 'idle'))
  if (verdict === 'wrong') {
    // Mark the first two fretted strings as the problem ones.
    let marked = 0
    return chord.frets.map((fret) => {
      if (fret < 0) return 'idle'
      if (fret > 0 && marked < 2) {
        marked++
        return 'bad'
      }
      return 'good'
    })
  }
  return used.map(() => 'idle')
}

/** Strum the chord once, low to high, so the learner hears the target (F31). */
async function playChord(chord) {
  const Tone = await import('tone')
  await Tone.start()
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 1.2 },
  }).toDestination()
  synth.volume.value = -10
  const now = Tone.now()
  chordMidi(chord).forEach((midi, i) => {
    synth.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), 1.4, now + i * 0.045)
  })
  setTimeout(() => synth.dispose(), 3000)
}

/** Six-line tab for one chord, high e on top like real tab (picture item 2). */
function ChordTab({ chord }) {
  const lines = STRING_NAMES.map((name, i) => ({ name: i === 5 ? 'e' : name, fret: chord.frets[i] })).reverse()
  return (
    <pre className="practice__tab" aria-label={`${chord.name} as tab`}>
      {lines.map(({ name, fret }) => `${name}|--${fret < 0 ? 'x' : fret}--|`).join('\n')}
    </pre>
  )
}

/**
 * Guitar practice screen (the "Learn" lesson from the team mockup):
 * chord diagram + string state + tab, the heard-it banner with Hint / Skip /
 * Retry, and the Learn / Play / Changes modes. Uses demo data for now.
 */
function PracticeScreen() {
  const [state, dispatch] = useReducer(practiceReducer, undefined, () => initialPractice(0))
  const [labelMode, setLabelMode] = useState('fret')
  const [mode, setMode] = useState('learn')
  const [hinting, setHinting] = useState(false)
  const hintTimer = useRef(null)

  const chord = CHORDS[state.chordIndex]

  useEffect(() => () => clearTimeout(hintTimer.current), [])

  const hint = async () => {
    setHinting(true)
    clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHinting(false), 1600)
    try {
      await playChord(chord)
    } catch (err) {
      console.error('Hint playback failed', err)
    }
  }

  const simulate = (verdict) => dispatch({ type: 'result', verdict, strings: demoResult(verdict, chord) })

  return (
    <div className="practice">
      <section className="practice__lesson" aria-label="Lesson">
        <header className="practice__header">
          <span>
            Lesson {state.chordIndex + 1} · <strong>{chord.name}</strong>
          </span>
          <span className="practice__demo-pill">● Demo data</span>
        </header>

        <nav className="practice__chords" aria-label="Chord">
          {CHORDS.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={i === state.chordIndex ? 'is-active' : ''}
              aria-pressed={i === state.chordIndex}
              onClick={() => dispatch({ type: 'select', index: i })}
            >
              {c.id}
            </button>
          ))}
        </nav>

        <div className="practice__body">
          <div className="practice__chord">
            <div className="practice__chord-top">
              <h3>{chord.name}</h3>
              <div className="practice__labels" role="group" aria-label="Dot labels">
                {LABEL_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={labelMode === m.id ? 'is-active' : ''}
                    aria-pressed={labelMode === m.id}
                    onClick={() => setLabelMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <ChordDiagram chord={chord} labelMode={labelMode} pulse={hinting} />
            <StringStates chord={chord} strings={state.strings} />
          </div>

          <div className="practice__side">
            <span className="practice__side-label">Tab</span>
            <ChordTab chord={chord} />
            <p className="practice__side-note">Full songs with tab, notation and a playhead are in Songs.</p>
          </div>
        </div>

        {state.notice && <p className="practice__notice">{state.notice}</p>}

        <CheckBanner
          chord={chord}
          verdict={state.verdict}
          misses={state.misses}
          hinting={hinting}
          onHint={hint}
          onSkip={() => dispatch({ type: 'skip' })}
          onRetry={() => dispatch({ type: 'retry' })}
          onNext={() => dispatch({ type: 'next' })}
        />
      </section>

      <div className="practice__modes" role="group" aria-label="Practice mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`practice__mode ${mode === m.id ? 'is-active' : ''}`}
            aria-pressed={mode === m.id}
            disabled={m.disabled}
            onClick={() => setMode(m.id)}
          >
            <span className="practice__mode-top">
              <strong>{m.title}</strong>
              <small>{m.tag}</small>
            </span>
            <span className="practice__mode-text">{m.disabled ? 'Coming later' : m.text}</span>
          </button>
        ))}
      </div>

      <section className="practice__demo" aria-label="Demo controls">
        <span>Demo · pretend the app heard:</span>
        <div>
          <button type="button" onClick={() => simulate('verified')}>
            The right chord
          </button>
          <button type="button" onClick={() => simulate('wrong')}>
            A wrong chord
          </button>
          <button type="button" onClick={() => simulate('silent')}>
            Nothing
          </button>
        </div>
      </section>
    </div>
  )
}

export default PracticeScreen