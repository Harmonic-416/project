import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { midiToNoteName } from '../../vocal/audio/pitchDetector.js'
import CheckBanner from './CheckBanner.jsx'
import ChordDiagram from './ChordDiagram.jsx'
import ChordTab from './ChordTab.jsx'
import PlayRun from './PlayRun.jsx'
import PracticeRun from './PracticeRun.jsx'
import StringStates from './StringStates.jsx'
import { CHORDS, LABEL_MODES } from './chords.js'
import { markedStrings } from './lessonVerdicts.js'
import ChangesRun from './ChangesRun.jsx'
import { initialPlay, learnedProgression, playReducer, progressionChords } from './playState.js'
import { initialPracticeRun, practiceRunReducer } from './practiceRunState.js'
import { initialPractice, practiceReducer } from './practiceState.js'
import { chordStatuses, loadCleared, saveCleared, unlockedCount } from './unlocks.js'
import { useChordPlayer } from './useChordPlayer.js'
import { useLessonListening } from './useLessonListening.js'
import '../../../auth/authTheme.css'
import './PracticeScreen.css'

const MODES = [
  { id: 'guided', title: 'Guided', text: 'One chord at a time, waits for you', tag: 'V1' },
  { id: 'practice', title: 'Practice', text: 'Pass it to unlock the next chord', tag: 'V1' },
  { id: 'play', title: 'Play', text: 'Straight through, no stops', tag: 'V1' },
  { id: 'changes', title: 'Changes', text: 'Two chords, one minute', tag: 'V1' },
]

// Chord pill marks by unlock status (unlocks.js); plain 'unlocked' has none.
const PILL_MARK = { passed: '✓', skipped: '↷', locked: '🔒' }

// What the app heard: lit green / red / yellow by the mic, or clicked to mark it yourself.
const RESULTS = [
  ['verified', 'The right chord'],
  ['wrong', 'A wrong chord'],
  ['silent', 'Nothing'],
]

// How long a Hint rings; the mic ignores it for that long. Each string one by one rings longer.
const HINT_SOUND_MS = 3000
const EACH_STRING_SOUND_MS = 5000

const LABEL_MODE_KEY = 'harmonic.guitar.labelMode'

function loadLabelMode() {
  try {
    const saved = globalThis.localStorage.getItem(LABEL_MODE_KEY)
    return LABEL_MODES.some((m) => m.id === saved) ? saved : 'fret'
  } catch {
    return 'fret'
  }
}

function saveLabelMode(mode) {
  try {
    globalThis.localStorage.setItem(LABEL_MODE_KEY, mode)
  } catch {
    // Private window or blocked storage: the choice lasts until reload.
  }
}

/** "an extra G", "extra G and C" — notes heard that the chord doesn't have. */
function extraText(extra) {
  const names = [...new Set(extra.map((midi) => midiToNoteName(midi).replace(/-?\d+$/, '')))]
  if (!names.length) return null
  return names.length === 1 ? `an extra ${names[0]}` : `extra ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * Guitar chord lessons (the "Learn" lesson from the team mockup): chord
 * diagram + string state + tab, the heard-it banner with Hint / Skip /
 * Retry, and the Guided / Practice / Play / Changes modes. Chords unlock one
 * at a time by passing Practice (unlocks.js). The mic decides every result
 * (useLessonListening.js); the result buttons let the player mark it
 * themselves, so a detection miss never blocks them (F28). `initialChord`
 * (an id) opens on that chord if it's unlocked, e.g. Today's chord.
 */
function PracticeScreen({ initialMode = 'guided', initialChord = null }) {
  // Chords cleared in Practice mode, saved in this browser.
  const [cleared, setCleared] = useState(loadCleared)
  const statuses = chordStatuses(cleared)
  const [state, dispatch] = useReducer(practiceReducer, unlockedCount(cleared), (count) => {
    const index = CHORDS.findIndex((c) => c.id === initialChord)
    return initialPractice(index >= 0 && index < count ? index : 0, count)
  })
  const [labelMode, setLabelMode] = useState(loadLabelMode)
  const [mode, setMode] = useState(initialMode)
  const [hinting, setHinting] = useState(false)
  const hintTimer = useRef(null)
  // Practice and Play have their own run state (practiceRunState.js, playState.js).
  const [run, runDispatch] = useReducer(practiceRunReducer, undefined, () => initialPracticeRun())
  const [play, playDispatch] = useReducer(playReducer, undefined, () => initialPlay())
  const playChords = progressionChords(learnedProgression(cleared))

  const chord = CHORDS[state.chordIndex]
  const nextChord = CHORDS[state.chordIndex + 1]
  const isPlay = mode === 'play'
  const isPractice = mode === 'practice'
  const isChanges = mode === 'changes'
  // The chord in Guided that hasn't been cleared yet leads on to Practice.
  const needsPractice = statuses[chord.id] === 'unlocked'

  // Last result, heard by the mic or marked by the player, for the chord that
  // was up; it goes dark once another chord is. `n` replays the flash.
  const expectedChord = isPlay ? playChords[play.index] : chord
  const [heard, setHeard] = useState({ verdict: null, chordId: null, extra: [], n: 0 })
  const showHeard = (verdict, extra = []) => setHeard(({ n }) => ({ verdict, chordId: expectedChord.id, extra, n: n + 1 }))
  const heardVerdict = heard.chordId === expectedChord.id ? heard.verdict : null

  // Every result comes through here, from the mic or from the result buttons.
  const result = ({ verdict, strings, extra = [] }) => {
    showHeard(verdict, extra)
    if (isPlay) playDispatch({ type: 'result', verdict })
    else if (isPractice) practiceResult(verdict)
    else dispatch({ type: 'result', verdict, strings: strings ?? undefined })
  }

  const listening = useLessonListening({ chord: expectedChord, onVerdict: result })
  const isListening = listening.status === 'listening'
  // Hint strums the chord, low to high, so the learner hears the target (F31).
  const player = useChordPlayer()

  // Starting a Practice or Play run turns the mic on too (a tap, so the browser allows it).
  const { start: startListening } = listening
  const runDispatchWithMic = useCallback(
    (action) => {
      if (action.type === 'start') startListening()
      runDispatch(action)
    },
    [startListening],
  )
  const playDispatchWithMic = useCallback(
    (action) => {
      if (action.type === 'start') startListening()
      playDispatch(action)
    },
    [startListening],
  )

  const chooseMode = (id) => {
    setMode(id)
    setHeard(({ n }) => ({ verdict: null, chordId: null, extra: [], n }))
    runDispatch({ type: 'reset' })
    playDispatch({ type: 'reset' })
  }

  const chooseLabelMode = (id) => {
    setLabelMode(id)
    saveLabelMode(id)
  }

  useEffect(() => () => clearTimeout(hintTimer.current), [])

  // A different chord in Guided gets a fresh Practice run.
  useEffect(() => runDispatch({ type: 'chord' }), [state.chordIndex])

  const updateCleared = (updated) => {
    setCleared(updated)
    saveCleared(updated)
    dispatch({ type: 'unlocked', count: unlockedCount(updated) })
  }

  // Passing or "Unlock anyway" clears the chord; a pass is never downgraded to a skip.
  const clearChord = (outcome) =>
    updateCleared({ ...cleared, [chord.id]: cleared[chord.id] === 'passed' ? 'passed' : outcome })

  function practiceResult(verdict) {
    const action = { type: 'result', verdict }
    if (practiceRunReducer(run, action).status === 'passed') clearChord('passed')
    runDispatch(action)
  }

  const learnNext = () => {
    dispatch({ type: 'select', index: state.chordIndex + 1 })
    chooseMode('guided')
  }

  const unlockAnyway = () => {
    clearChord('skipped')
    learnNext()
  }

  const resetUnlocks = () => {
    updateCleared({})
    runDispatch({ type: 'chord' })
  }

  // Hint strums the chord; pressed again while it rings, it plays each string on its own.
  const hint = async () => {
    const eachString = hinting
    listening.muteFor(eachString ? EACH_STRING_SOUND_MS : HINT_SOUND_MS)
    setHinting(true)
    clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHinting(false), eachString ? 3000 : 1600)
    try {
      await (eachString ? player.arpeggiate(chord) : player.strum(chord))
    } catch (err) {
      console.error('Hint playback failed', err)
    }
  }

  const retry = () => {
    listening.restart()
    dispatch({ type: 'retry' })
  }

  // The result buttons: the player says what they played, the same way the mic does.
  const markIt = (verdict) => result({ verdict, strings: markedStrings(verdict, chord) })
  const markDisabled = (isPlay && play.status !== 'running') || (isPractice && run.status !== 'running')

  return (
    <div className="practice">
      <section className="practice__lesson" aria-label="Lesson">
        <header className="practice__header">
          {isChanges ? (
            <span>
              Changes · <strong>one minute</strong>
            </span>
          ) : isPlay ? (
            <span>
              Play · <strong>straight through</strong>
            </span>
          ) : isPractice ? (
            <span>
              Practice · <strong>{chord.name}</strong>
            </span>
          ) : (
            <span>
              Lesson {state.chordIndex + 1} of {CHORDS.length} · <strong>{chord.name}</strong>
            </span>
          )}
        </header>

        {isChanges ? (
          <ChangesRun unlocked={state.unlocked} />
        ) : isPlay ? (
          <PlayRun chords={playChords} state={play} dispatch={playDispatchWithMic} labelMode={labelMode} />
        ) : isPractice ? (
          <PracticeRun
            chord={chord}
            nextChord={nextChord}
            state={run}
            dispatch={runDispatchWithMic}
            labelMode={labelMode}
            onLearnNext={learnNext}
            onBackToLearn={() => chooseMode('guided')}
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
                        onClick={() => chooseLabelMode(m.id)}
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
              extra={heardVerdict === 'wrong' ? extraText(heard.extra) : null}
              hinting={hinting}
              onHint={hint}
              onSkip={() => dispatch({ type: 'skip' })}
              onRetry={retry}
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

      {/* One-minute changes listens and counts by itself. */}
      {!isChanges && (
      <section className="practice__demo" aria-label="What the app heard">
        <div>
          <button
            type="button"
            className={`practice__listen ${isListening ? 'is-on' : ''}`}
            aria-pressed={isListening}
            disabled={listening.status === 'requesting'}
            onClick={isListening ? listening.stop : listening.start}
          >
            {isListening ? '● Listening · Stop' : listening.status === 'requesting' ? 'Starting mic…' : '🎤 Listen'}
          </button>
          {listening.error && <span className="practice__listen-error">{listening.error}</span>}
        </div>
        <div>
          <span className="practice__mark-label">Mark it yourself:</span>
          {RESULTS.map(([verdict, label]) => {
            const lit = heardVerdict === verdict
            return (
              <button
                key={verdict}
                type="button"
                className={lit ? `is-lit is-${verdict}` : ''}
                disabled={markDisabled}
                onClick={() => markIt(verdict)}
              >
                {lit && <span key={heard.n} className="practice__flash" aria-hidden="true" />}
                {label}
              </button>
            )
          })}
          <button type="button" className="practice__demo-reset" onClick={resetUnlocks}>
            Reset unlocks
          </button>
        </div>
        <p className="practice__sr-only" role="status" aria-live="polite">
          {heardVerdict && `Heard: ${RESULTS.find(([v]) => v === heardVerdict)[1].toLowerCase()}`}
        </p>
      </section>
      )}
    </div>
  )
}

export default PracticeScreen
