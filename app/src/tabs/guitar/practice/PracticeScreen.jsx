import { useEffect, useReducer, useRef, useState } from 'react'
import * as Tone from 'tone'
import CheckBanner from './CheckBanner.jsx'
import ChordDiagram from './ChordDiagram.jsx'
import PlayRun from './PlayRun.jsx'
import PracticeRun from './PracticeRun.jsx'
import StringStates from './StringStates.jsx'
import { CHORDS, LABEL_MODES, STRING_NAMES, chordMidi } from './chords.js'
import { initialPlay, playReducer, progressionChords } from './playState.js'
import { initialPracticeRun, practiceRunReducer } from './practiceRunState.js'
import { initialPractice, practiceReducer } from './practiceState.js'
import { chordStatuses, loadCleared, saveCleared, unlockedCount } from './unlocks.js'
import '../../../auth/authTheme.css'
import './PracticeScreen.css'

const MODES = [
  { id: 'learn', title: 'Learn', text: 'One chord at a time, waits for you', tag: 'V1' },
  { id: 'practice', title: 'Practice', text: 'Pass it to unlock the next chord', tag: 'V1' },
  { id: 'play', title: 'Play', text: 'Straight through, no stops', tag: 'V1' },
  { id: 'changes', title: 'Changes', text: 'Chord to chord, in time', tag: 'V2', disabled: true },
]

// Chord pill marks by unlock status (unlocks.js); plain 'unlocked' has none.
const PILL_MARK = { passed: '✓', skipped: '↷', locked: '🔒' }

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
  const lines = STRING_NAMES.map((name, i) => ({
    name: i === 5 ? 'e' : name,
    fret: chord.frets[i],
  })).reverse()
  return (
    <pre className="practice__tab" aria-label={`${chord.name} as tab`}>
      {lines.map(({ name, fret }) => `${name}|--${fret < 0 ? 'x' : fret}--|`).join('\n')}
    </pre>
  )
}

/**
 * Guitar practice screen (the "Learn" lesson from the team mockup):
 * chord diagram + string state + tab, the heard-it banner with Hint / Skip /
 * Retry, and the Learn / Practice / Play / Changes modes. Chords unlock one
 * at a time by passing Practice (unlocks.js). Uses demo data for now.
 */
function PracticeScreen() {
  // Chords cleared in Practice mode, saved in this browser.
  const [cleared, setCleared] = useState(loadCleared)
  const statuses = chordStatuses(cleared)
  const [state, dispatch] = useReducer(practiceReducer, unlockedCount(cleared), (count) => initialPractice(0, count))
  const [labelMode, setLabelMode] = useState('fret')
  const [mode, setMode] = useState('learn')
  const [hinting, setHinting] = useState(false)
  const hintTimer = useRef(null)
  // Practice and Play have their own run state (practiceRunState.js, playState.js).
  const [run, runDispatch] = useReducer(practiceRunReducer, undefined, () => initialPracticeRun())
  const [play, playDispatch] = useReducer(playReducer, undefined, () => initialPlay())
  const playChords = progressionChords()

  const chord = CHORDS[state.chordIndex]
  const nextChord = CHORDS[state.chordIndex + 1]
  const isPlay = mode === 'play'
  const isPractice = mode === 'practice'
  // The chord in Learn that hasn't been cleared yet leads on to Practice.
  const needsPractice = statuses[chord.id] === 'unlocked'

  const chooseMode = (id) => {
    setMode(id)
    runDispatch({ type: 'reset' })
    playDispatch({ type: 'reset' })
  }

  useEffect(() => () => clearTimeout(hintTimer.current), [])

  // A different chord in Learn gets a fresh Practice run.
  useEffect(() => runDispatch({ type: 'chord' }), [state.chordIndex])

  const updateCleared = (updated) => {
    setCleared(updated)
    saveCleared(updated)
    dispatch({ type: 'unlocked', count: unlockedCount(updated) })
  }

  // Passing or "Unlock anyway" clears the chord; a pass is never downgraded to a skip.
  const clearChord = (result) =>
    updateCleared({ ...cleared, [chord.id]: cleared[chord.id] === 'passed' ? 'passed' : result })

  // Every Practice result comes through here: demo buttons now, chord detection later.
  const practiceResult = (verdict) => {
    const action = { type: 'result', verdict }
    if (practiceRunReducer(run, action).status === 'passed') clearChord('passed')
    runDispatch(action)
  }

  const learnNext = () => {
    dispatch({ type: 'select', index: state.chordIndex + 1 })
    chooseMode('learn')
  }

  const unlockAnyway = () => {
    clearChord('skipped')
    learnNext()
  }

  const resetUnlocks = () => {
    updateCleared({})
    runDispatch({ type: 'chord' })
  }

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

  // Demo buttons feed whichever mode is showing, the same way detection will.
  const simulate = (verdict) => {
    if (isPlay) playDispatch({ type: 'result', verdict })
    else if (isPractice) practiceResult(verdict)
    else dispatch({ type: 'result', verdict, strings: demoResult(verdict, chord) })
  }
  const demoDisabled = (isPlay && play.status !== 'running') || (isPractice && run.status !== 'running')

  return (
    <div className="practice">
      <section className="practice__lesson" aria-label="Lesson">
        <header className="practice__header">
          {isPlay ? (
            <span>
              Play · <strong>straight through</strong>
            </span>
          ) : isPractice ? (
            <span>
              Practice · <strong>{chord.name}</strong>
            </span>
          ) : (
            <span>
              Lesson {state.chordIndex + 1} · <strong>{chord.name}</strong>
            </span>
          )}
          <span className="practice__demo-pill">● Demo data</span>
        </header>

        {isPlay ? (
          <PlayRun chords={playChords} state={play} dispatch={playDispatch} labelMode={labelMode} />
        ) : isPractice ? (
          <PracticeRun
            chord={chord}
            nextChord={nextChord}
            state={run}
            dispatch={runDispatch}
            labelMode={labelMode}
            onLearnNext={learnNext}
            onBackToLearn={() => chooseMode('learn')}
            onUnlockAnyway={unlockAnyway}
          />
        ) : (
          <>
            <nav className="practice__chords" aria-label="Chord">
              {CHORDS.map((c, i) => {
                const status = statuses[c.id]
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`practice__chord-pill--${status} ${i === state.chordIndex ? 'is-active' : ''}`}
                    aria-pressed={i === state.chordIndex}
                    aria-label={status === 'unlocked' ? c.name : `${c.name}, ${status}`}
                    title={status === 'locked' ? `Pass ${CHORDS[i - 1].name} in Practice to unlock` : undefined}
                    disabled={status === 'locked'}
                    onClick={() => dispatch({ type: 'select', index: i })}
                  >
                    {c.id}
                    {PILL_MARK[status] && (
                      <span className="practice__chord-mark" aria-hidden="true">
                        {PILL_MARK[status]}
                      </span>
                    )}
                  </button>
                )
              })}
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
                <p className="practice__side-note">
                  Full songs with tab, notation and a playhead are in Songs.
                </p>
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
              onNext={() => (needsPractice ? chooseMode('practice') : dispatch({ type: 'next' }))}
              nextLabel={needsPractice ? 'Practice' : 'Next'}
            />
          </>
        )}
      </section>

      <div className="practice__modes" role="group" aria-label="Practice mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`practice__mode ${mode === m.id ? 'is-active' : ''}`}
            aria-pressed={mode === m.id}
            disabled={m.disabled}
            onClick={() => chooseMode(m.id)}
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
          {[
            ['verified', 'The right chord'],
            ['wrong', 'A wrong chord'],
            ['silent', 'Nothing'],
          ].map(([verdict, label]) => (
            <button key={verdict} type="button" disabled={demoDisabled} onClick={() => simulate(verdict)}>
              {label}
            </button>
          ))}
          <button type="button" className="practice__demo-reset" onClick={resetUnlocks}>
            Reset unlocks
          </button>
        </div>
      </section>
    </div>
  )
}

export default PracticeScreen