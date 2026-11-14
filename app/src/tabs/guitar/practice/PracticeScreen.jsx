import LessonFocus from './LessonFocus.jsx'
import LessonModes from './LessonModes.jsx'
import GuitarFeedback from './GuitarFeedback.jsx'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { midiToNoteName } from '../../vocal/audio/pitchDetector.js'
import CheckBanner from './CheckBanner.jsx'
import PlayRun from './PlayRun.jsx'
import PracticeRun from './PracticeRun.jsx'
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
  const [hintError, setHintError] = useState(null)
  const [saveError, setSaveError] = useState(false)
  const hintTimer = useRef(null)
  const launchVersion = useRef(0)
  const hintVersion = useRef(0)
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState(null)
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
    if ((isPlay && play.status !== 'running') || (isPractice && run.status !== 'running')) return
    showHeard(verdict, extra)
    if (isPlay) playDispatch({ type: 'result', verdict })
    else if (isPractice) practiceResult(verdict)
    else dispatch({ type: 'result', verdict, strings: strings ?? undefined })
  }

  const listening = useLessonListening({ chord: expectedChord, onVerdict: result })
  const isListening = listening.status === 'listening'
  // Hint strums the chord, low to high, so the learner hears the target (F31).
  const player = useChordPlayer()

  const { stop: stopReference } = player
  const { start: startListening, stop: stopListening, restart: restartListening } = listening
  const clearHeard = useCallback(() => setHeard(({ n }) => ({ verdict: null, chordId: null, extra: [], n })), [])
  const cancelHint = useCallback(() => {
    hintVersion.current += 1
    clearTimeout(hintTimer.current)
    stopReference?.()
    setHinting(false)
    setHintError(null)
  }, [stopReference])

  // The microphone must finish opening before the countdown. Every exit
  // invalidates a pending start so permission delays cannot restart a lesson.
  const controlRun = useCallback(async (action, send) => {
    if (action.type === 'start') {
      const version = ++launchVersion.current
      cancelHint()
      clearHeard()
      restartListening()
      setLaunchError(null)
      setLaunching(true)
      try {
        if (!(await startListening()) || version !== launchVersion.current) return
      } catch {
        if (version === launchVersion.current) setLaunchError('The microphone could not start. Try again, or start without the microphone.')
        return
      } finally {
        if (version === launchVersion.current) setLaunching(false)
      }
    } else if (action.type === 'reset') {
      launchVersion.current += 1
      setLaunching(false)
      stopListening()
      cancelHint()
      clearHeard()
    }
    send(action)
  }, [cancelHint, clearHeard, restartListening, startListening, stopListening])
  const runDispatchWithMic = useCallback((action) => controlRun(action, runDispatch), [controlRun])
  const playDispatchWithMic = useCallback((action) => controlRun(action, playDispatch), [controlRun])
  useEffect(() => {
    if ((isPractice && ['passed', 'failed'].includes(run.status)) || (isPlay && play.status === 'done')) stopListening()
  }, [isPractice, isPlay, run.status, play.status, stopListening])
  useEffect(() => () => {
    launchVersion.current += 1
    hintVersion.current += 1
    clearTimeout(hintTimer.current)
    stopReference?.()
    stopListening()
  }, [stopReference, stopListening])

  const chooseMode = (id) => {
    launchVersion.current += 1
    setLaunching(false)
    setLaunchError(null)
    cancelHint()
    listening.stop()
    setMode(id)
    setHeard(({ n }) => ({ verdict: null, chordId: null, extra: [], n }))
    runDispatch({ type: 'reset' })
    playDispatch({ type: 'reset' })
  }

  const chooseLabelMode = (id) => {
    setLabelMode(id)
    saveLabelMode(id)
  }


  // A different chord in Guided gets a fresh Practice run.
  useEffect(() => runDispatch({ type: 'chord' }), [state.chordIndex])

  const updateCleared = (updated) => {
    setCleared(updated)
    setSaveError(!saveCleared(updated))
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
    chooseMode('guided')
    dispatch({ type: 'retry' })
    updateCleared({})
    runDispatch({ type: 'chord' })
  }

  // Hint strums the chord; pressed again while it rings, it plays each string on its own.
  const hint = async (stringIndex = null) => {
    const version = ++hintVersion.current
    const singleString = Number.isInteger(stringIndex) && stringIndex >= 0 && stringIndex < 6
    if (singleString && chord.frets[stringIndex] < 0) return
    const eachString = !singleString && hinting
    listening.muteFor(eachString ? EACH_STRING_SOUND_MS : HINT_SOUND_MS)
    setHintError(null)
    setHinting(true)
    clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => { if (version === hintVersion.current) setHinting(false) }, eachString ? 3000 : 1600)
    try {
      const sound = singleString ? { ...chord, frets: chord.frets.map((fret, index) => index === stringIndex ? fret : -1) } : chord
      await (eachString ? player.arpeggiate(sound) : player.strum(sound))
    } catch (err) {
      if (version !== hintVersion.current) return
      setHintError('The reference sound could not start. Try Hint again.')
      setHinting(false)
      console.error('Hint playback failed', err)
    }
  }

  const retry = () => {
    cancelHint()
    clearHeard()
    listening.restart()
    dispatch({ type: 'retry' })
  }

  const moveChord = (action) => {
    launchVersion.current += 1
    setLaunching(false)
    cancelHint()
    clearHeard()
    listening.restart()
    dispatch(action)
  }
  const startManually = () => {
    launchVersion.current += 1
    setLaunching(false)
    stopListening()
    cancelHint()
    clearHeard()
    ;(isPractice ? runDispatch : playDispatch)({ type: 'start' })
  }
  const microphoneError = launchError || listening.error
  const canStartManually = (isPractice && !['countdown', 'running'].includes(run.status)) || (isPlay && !['countdown', 'running'].includes(play.status))

  // The result buttons: the player says what they played, the same way the mic does.
  const markIt = (verdict) => result({ verdict, strings: markedStrings(verdict, chord) })
  const markDisabled = (isPlay && play.status !== 'running') || (isPractice && run.status !== 'running')

  const listeningLabel = isListening ? 'Listening - Stop' : listening.status === 'requesting' ? 'Starting microphone...' : isPractice || isPlay ? 'Listen' : 'Check my chord'

  return (
    <div className="practice">
      {saveError && <p role="status">Progress is available for this visit, but browser storage is blocked. Sign in to sync it, or allow storage before leaving.</p>}
      {hintError && <GuitarFeedback kind="error">{hintError}</GuitarFeedback>}
      {launching && <GuitarFeedback onRetry={() => (isPractice ? runDispatchWithMic : playDispatchWithMic)({ type: 'reset' })} retryLabel="Cancel start">Opening the microphone before the countdown...</GuitarFeedback>}
      <LessonModes mode={mode} onChange={chooseMode} />
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
            onHint={() => { runDispatchWithMic({ type: 'reset' }); hint() }}
            onSkip={() => { runDispatch({ type: 'reset' }); dispatch({ type: 'skip' }); chooseMode('guided') }}
          />
        ) : (
          <>
            <details className="practice__chord-picker"><summary>Choose a chord <span>{chord.id} &middot; {state.chordIndex + 1} / {CHORDS.length}</span></summary>
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
                    onClick={() => moveChord({ type: 'select', index: i })}
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
            </nav></details>

            <LessonFocus chord={chord} labelMode={labelMode} onLabelMode={chooseLabelMode} hinting={hinting} onHint={hint} strings={state.strings} verdict={state.verdict} />

            {state.notice && <p className="practice__notice" role="status">{state.notice}</p>}
            {state.skips.length > 0 && <p className="practice__side-note">Manual skips this visit: {state.skips.length}. Skipping does not mark a chord as passed.</p>}

            <CheckBanner
              chord={chord}
              verdict={state.verdict}
              misses={state.misses}
              extra={heardVerdict === 'wrong' ? extraText(heard.extra) : null}
              hinting={hinting}
              onHint={hint}
              onSkip={() => moveChord({ type: 'skip' })}
              onRetry={retry}
              onNext={() => (needsPractice ? chooseMode('practice') : moveChord({ type: 'next' }))}
              nextLabel={needsPractice ? 'Practice' : 'Next'}
            />
          </>
        )}
      </section>

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
            {listeningLabel}
          </button>
          {microphoneError && <GuitarFeedback kind="error">{microphoneError}</GuitarFeedback>}
          {microphoneError && canStartManually && !launching && <button type="button" onClick={startManually}>Start without microphone</button>}
        </div>
        <details className="practice__self-mark"><summary>Mark it yourself</summary><div>
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
        </div></details>
        <p className="practice__sr-only" role="status" aria-live="polite">
          {heardVerdict && `Heard: ${RESULTS.find(([v]) => v === heardVerdict)[1].toLowerCase()}`}
        </p>
      </section>
      )}
    </div>
  )
}

export default PracticeScreen
