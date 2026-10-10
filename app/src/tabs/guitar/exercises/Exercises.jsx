import { useEffect, useReducer, useRef, useState } from 'react'
import ChordDiagram from '../practice/ChordDiagram.jsx'
import { CHORDS } from '../practice/chords.js'
import { useChordPlayer } from '../practice/useChordPlayer.js'
import {
  LEVELS,
  QUESTIONS_PER_ROUND,
  exerciseReducer,
  initialExercise,
  makeRound,
  missedChords,
  roundScore,
} from './earTraining.js'
import '../../../auth/authTheme.css'
import './Exercises.css'

const CHORD_BY_ID = Object.fromEntries(CHORDS.map((chord) => [chord.id, chord]))
const QUALITY_LABEL = { major: 'Major', minor: 'Minor' }

const choiceLabel = (choice) => QUALITY_LABEL[choice] ?? CHORD_BY_ID[choice].name

/**
 * Exercises: ear training (F41). Pick a level, then for each of ten
 * questions the app strums a chord (again, or one string at a time, as often
 * as you like) and you pick what you heard. Each answer shows the chord's
 * shape, and a wrong one lets you hear your pick beside the right chord.
 * Needs no microphone. Rules in earTraining.js, sound in chordSound.js.
 */
function Exercises() {
  const [levelId, setLevelId] = useState(LEVELS[0].id)
  const [state, dispatch] = useReducer(exerciseReducer, undefined, initialExercise)
  const [soundError, setSoundError] = useState(null)
  const player = useChordPlayer()
  const nextRef = useRef(null)

  const { status, questions, index, results } = state
  const level = LEVELS.find((l) => l.id === (state.level ?? levelId))
  const question = questions[index]
  const result = status === 'answered' ? results[index] : null
  const lastQuestion = index + 1 >= questions.length

  // Answering disables the choices, so keep keyboard focus on the way on.
  useEffect(() => {
    if (status === 'answered') nextRef.current?.focus()
  }, [status])

  // Always from a tap (Start, Next, a play button), so the browser lets audio start.
  const listen = (chord, how = 'strum') => {
    setSoundError(null)
    player[how](chord).catch((err) => {
      console.error('Exercise playback failed', err)
      setSoundError('The sound couldn’t start. On a phone, open the app over HTTPS.')
    })
  }

  const start = () => {
    const round = makeRound(levelId)
    dispatch({ type: 'start', level: levelId, questions: round })
    listen(round[0].answer)
  }

  const next = () => {
    if (lastQuestion) player.stop()
    else listen(questions[index + 1].answer)
    dispatch({ type: 'next' })
  }

  const quit = () => {
    player.stop()
    dispatch({ type: 'reset' })
  }

  return (
    <div className="exercises">
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
            <button type="button" className="exercises__primary" onClick={start}>
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
                    disabled={status !== 'asking'}
                    onClick={() => dispatch({ type: 'answer', choice })}
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
                <div className="exercises__shape">
                  <ChordDiagram chord={question.answer} labelMode="fret" />
                  <span>This is how {question.answer.name} is played.</span>
                </div>
                {!result.correct && (
                  <div className="exercises__compare" role="group" aria-label="Compare">
                    {level.id === 'chord' && (
                      <button type="button" className="exercises__secondary" onClick={() => listen(CHORD_BY_ID[result.picked])}>
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

        {status === 'done' && <RoundSummary results={results} onListen={listen} onAgain={start} onChangeLevel={quit} />}

        {soundError && <p className="exercises__error">{soundError}</p>}
      </section>
    </div>
  )
}

/** End of a round: the score, and the chords to listen for again (tap to hear one). */
function RoundSummary({ results, onListen, onAgain, onChangeLevel }) {
  const { correct, total } = roundScore(results)
  const missed = missedChords(results)

  return (
    <div className="exercises__done">
      <p className="exercises__score">
        <strong>
          {correct} of {total}
        </strong>{' '}
        correct
      </p>
      {missed.length ? (
        <>
          <p className="exercises__lead">Listen to these again:</p>
          <ul className="exercises__chips">
            {missed.map(({ id, misses }) => (
              <li key={id}>
                <button type="button" className="exercises__chip" onClick={() => onListen(CHORD_BY_ID[id])}>
                  <strong>{CHORD_BY_ID[id].name}</strong>
                  <small>missed {misses === 1 ? 'once' : `${misses} times`} · ▶ play</small>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="exercises__lead">Every chord right.</p>
      )}
      <div className="exercises__actions">
        <button type="button" className="exercises__primary" onClick={onAgain}>
          Play again
        </button>
        <button type="button" className="exercises__secondary" onClick={onChangeLevel}>
          Change level
        </button>
      </div>
    </div>
  )
}

export default Exercises
