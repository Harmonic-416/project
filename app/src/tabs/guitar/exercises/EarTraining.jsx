import EarRoundSummary from './EarRoundSummary.jsx'
import GuitarFeedback from '../practice/GuitarFeedback.jsx'
import { useEffect, useReducer, useRef, useState } from 'react'
import ChordDiagram from '../practice/ChordDiagram.jsx'
import { chordFor, chordsFor, loadSongChords } from '../practice/chordNames.js'
import { useChordPlayer } from '../practice/useChordPlayer.js'
import {
  DEFAULT_PICKS,
  LEVELS,
  MIN_POOL,
  QUALITY_POOL,
  QUESTIONS_PER_ROUND,
  accuracy,
  exerciseReducer,
  initialExercise,
  clearLegacyEarResults,
  makeRound,
  missWeights,
  recordAnswer,
} from './earTraining.js'
import '../../../auth/authTheme.css'
import './Exercises.css'

const QUALITY_LABEL = { major: 'Major', minor: 'Minor' }

const choiceLabel = (choice) => QUALITY_LABEL[choice] ?? chordFor(choice)?.name ?? choice
const percent = (share) => `${Math.round(share * 100)}%`

/**
 * Ear training (F41), one of the Exercises. Pick a level (and, for "Which
 * chord?", the chords to train), then for each of ten questions the app
 * strums a chord (again, or one string at a time, as often as you like) and
 * you pick what you heard. Each answer shows the chord's shape when there is
 * one, and a wrong one lets you compare your pick with the right chord.
 * Missed chords come up more often during this visit; no results are saved.
 * Needs no microphone. Rules in earTraining.js, sound in chordSound.js.
 */
function EarTraining() {
  const [levelId, setLevelId] = useState(LEVELS[0].id)
  const [picks, setPicks] = useState(() => [...DEFAULT_PICKS])
  const [stats, setStats] = useState({})
  const [song] = useState(loadSongChords) // { title, chords } of the last song opened with chord names
  const [state, dispatch] = useReducer(exerciseReducer, undefined, initialExercise)
  const [soundError, setSoundError] = useState(null)
  const [source, setSource] = useState('chosen')
  const [soundPending, setSoundPending] = useState(false)
  const audioGeneration = useRef(0)
  const actionLock = useRef(false)
  const player = useChordPlayer()
  const nextRef = useRef(null)
  const lastSound = useRef(null)

  const { status, questions, index, results } = state
  const level = LEVELS.find((l) => l.id === (state.level ?? levelId))
  const question = questions[index]
  const result = status === 'answered' ? results[index] : null
  const lastQuestion = index + 1 >= questions.length
  const songPool = chordsFor(song?.chords).filter((chord) => DEFAULT_PICKS.includes(chord.id))
  const pools = {
    quality: QUALITY_POOL,
    chord: source === 'song' ? songPool : QUALITY_POOL.filter((chord) => picks.includes(chord.id)),
  }
  const ready = (id) => pools[id].length >= MIN_POOL
  useEffect(clearLegacyEarResults, [])

  useEffect(() => { actionLock.current = false }, [status, index])
  useEffect(() => () => { audioGeneration.current += 1 }, [])

  // Answering disables the choices, so keep keyboard focus on the way on.
  useEffect(() => {
    if (status === 'answered') nextRef.current?.focus()
  }, [status])

  // Always from a tap (Start, Next, a play button), so the browser lets audio start.
  const listen = (chord, how = 'strum') => {
    if (!chord) return
    lastSound.current = { chord, how }
    const generation = ++audioGeneration.current
    setSoundError(null)
    setSoundPending(true)
    player[how](chord).catch((err) => {
      if (generation !== audioGeneration.current) return
      console.error('Exercise playback failed', err)
      setSoundError('The sound could not start. Check your audio output, then try Play again.')
    }).finally(() => {
      if (generation === audioGeneration.current) setSoundPending(false)
    })
  }

  const start = () => {
    const weights = levelId === 'quality' ? {} : missWeights(stats)
    const round = makeRound(levelId, { pool: pools[levelId], weights })
    if (!round.length) return
    actionLock.current = false
    dispatch({ type: 'start', level: levelId, questions: round })
    listen(round[0].answer)
  }

  // Naming a chord counts towards how you do on it; quality answers don't.
  const answer = (choice) => {
    if (actionLock.current || status !== 'asking' || soundPending || soundError || !question.choices.includes(choice)) return
    actionLock.current = true
    dispatch({ type: 'answer', choice })
    if (level.id === 'quality') return
    const updated = recordAnswer(stats, question.answer.id, choice === question.correct)
    setStats(updated)
  }

  const togglePick = (id) => {
    const updated = picks.includes(id) ? picks.filter((p) => p !== id) : QUALITY_POOL.map((c) => c.id).filter((c) => c === id || picks.includes(c))
    setPicks(updated)
  }

  const next = () => {
    if (actionLock.current || status !== 'answered') return
    actionLock.current = true
    if (lastQuestion) player.stop()
    else listen(questions[index + 1].answer)
    dispatch({ type: 'next' })
  }

  const quit = () => {
    audioGeneration.current += 1
    setSoundPending(false)
    setSoundError(null)
    player.stop()
    dispatch({ type: 'reset' })
  }

  return (
    <section className="exercises__card" aria-label="Ear training">
      <header className="exercises__header">
        <span>
          Ear training{status !== 'idle' && <> · <strong>{level.title}</strong></>}
        </span>
        {(status === 'asking' || status === 'answered') && (
          <span className="exercises__count">
            Question {index + 1} of {questions.length}
          </span>
        )}
      </header>

      {status === 'idle' && (
        <div className="exercises__intro">
          <p className="exercises__lead">Listen to a chord, then pick what you heard. No microphone needed.</p>
          <div className="exercises__levels" role="group" aria-label="Level">
            {LEVELS.map((l, i) => (
              <button
                key={l.id}
                type="button"
                className={`exercises__level ${levelId === l.id ? 'is-active' : ''}`}
                aria-pressed={levelId === l.id}
                onClick={() => setLevelId(l.id)}
              >
                <span className="exercises__level-top">
                  <strong>{l.title}</strong>
                  <small>Level {i + 1}</small>
                </span>
                <span className="exercises__level-text">{l.text}</span>
              </button>
            ))}
          </div>
          <p className="exercises__hint">Results are not saved. Leaving Exercises clears this visit.</p>
          {levelId === 'chord' && <div className="exercises__pick" role="group" aria-label="Practice material">
            <button type="button" aria-pressed={source === 'chosen'} onClick={() => setSource('chosen')}>Chosen chords</button>
            <button type="button" aria-pressed={source === 'song'} onClick={() => setSource('song')}>Last song</button>
          </div>}
          {levelId === 'chord' && source === 'chosen' && (
            <div className="exercises__picks">
              <p className="exercises__hint">
                Pick the chords to train; the ones you miss come up more often.
                {picks.length < MIN_POOL && ` Pick at least ${MIN_POOL}.`}
              </p>
              <div className="exercises__pick-chords" role="group" aria-label="Chords to train">
                {QUALITY_POOL.map((chord) => {
                  const share = accuracy(stats[chord.id])
                  return (
                    <button
                      key={chord.id}
                      type="button"
                      className="exercises__pick-chord"
                      aria-pressed={picks.includes(chord.id)}
                      title={chord.name}
                      onClick={() => togglePick(chord.id)}
                    >
                      <strong>{chord.id}</strong>
                      {share !== null && <small>{percent(share)}</small>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {levelId === 'chord' && source === 'song' && (
            <p className="exercises__hint">
              {songPool.length ? `Beginner chords from ${song.title}: ${songPool.map((chord) => chord.id).join(', ')}.` : 'Open a song with beginner chord names in Songs to use its material here.'}
              {!ready('chord') && ' At least four of Em, Am, C, G, D and E are needed for four answer choices. Choose Chosen chords to practise now.'}
            </p>
          )}
          <button type="button" className="exercises__primary" onClick={start} disabled={!ready(levelId)}>
            Start · {QUESTIONS_PER_ROUND} questions
          </button>
        </div>
      )}

      {(status === 'asking' || status === 'answered') && (
        <div className="exercises__question">
          {/* The header says "Question n of 10" for screen readers. */}
          <ol className="exercises__dots" aria-hidden="true">
            {questions.map((q, i) => (
              <li
                key={i}
                className={`exercises__dot ${i === index ? 'is-current' : ''} ${
                  results[i] ? (results[i].correct ? 'is-correct' : 'is-wrong') : ''
                }`}
              />
            ))}
          </ol>

          <div className="exercises__listen">
            <button type="button" className="exercises__play" onClick={() => listen(question.answer)}>
              ▶ Play again
            </button>
            <button type="button" className="exercises__secondary" onClick={() => listen(question.answer, 'arpeggiate')}>
              Note by note
            </button>
          </div>

          <p className="exercises__prompt">{level.title}</p>
          {soundPending && <GuitarFeedback>Starting guitar sound...</GuitarFeedback>}
          <div className="exercises__choices" role="group" aria-label="Answers">
            {question.choices.map((choice) => {
              const mark = !result
                ? ''
                : choice === question.correct
                  ? 'is-correct'
                  : choice === result.picked
                    ? 'is-wrong'
                    : 'is-dim'
              return (
                <button
                  key={choice}
                  type="button"
                  className={`exercises__choice ${mark}`}
                  disabled={status !== 'asking' || soundPending || Boolean(soundError)}
                  onClick={() => answer(choice)}
                >
                  {choiceLabel(choice)}
                </button>
              )
            })}
          </div>

          <p className="exercises__sr-only" role="status" aria-live="polite">
            {result && (result.correct ? `Correct, ${question.answer.name}` : `Not quite, that was ${question.answer.name}`)}
          </p>

          {result && (
            <div className="exercises__reveal">
              <p className={`exercises__verdict ${result.correct ? 'is-correct' : 'is-wrong'}`} aria-hidden="true">
                {result.correct ? '✓ Correct' : '✕ Not quite'} · <strong>{question.answer.name}</strong>
              </p>
              {question.answer.frets && (
                <div className="exercises__shape">
                  <ChordDiagram chord={question.answer} labelMode="fret" />
                  <span>This is how {question.answer.name} is played.</span>
                </div>
              )}
              {!result.correct && (
                <div className="exercises__compare" role="group" aria-label="Compare">
                  {level.id !== 'quality' && (
                    <button type="button" className="exercises__secondary" onClick={() => listen(chordFor(result.picked))}>
                      Hear yours ({result.picked})
                    </button>
                  )}
                  <button type="button" className="exercises__secondary" onClick={() => listen(question.answer)}>
                    Hear the answer ({question.answer.id})
                  </button>
                </div>
              )}
              <button type="button" ref={nextRef} className="exercises__primary" onClick={next}>
                {lastQuestion ? 'See results' : 'Next'}
              </button>
            </div>
          )}

          <button type="button" className="exercises__quit" onClick={quit}>
            End round
          </button>
        </div>
      )}

      {status === 'done' && <EarRoundSummary results={results} onListen={listen} onAgain={start} onChangeLevel={quit} />}

      {soundError && <GuitarFeedback kind="error" onRetry={() => lastSound.current && listen(lastSound.current.chord, lastSound.current.how)} retryLabel="Retry sound">{soundError}</GuitarFeedback>}
    </section>
  )
}

export default EarTraining
