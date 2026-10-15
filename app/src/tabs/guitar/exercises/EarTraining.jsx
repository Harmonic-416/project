import { useEffect, useReducer, useRef, useState } from 'react'
import ChordDiagram from '../practice/ChordDiagram.jsx'
import { chordFor, chordsFor, loadSongChords } from '../practice/chordNames.js'
import { CHORDS } from '../practice/chords.js'
import { useChordPlayer } from '../practice/useChordPlayer.js'
import {
  LEVELS,
  MIN_POOL,
  QUALITY_POOL,
  QUESTIONS_PER_ROUND,
  accuracy,
  exerciseReducer,
  initialExercise,
  loadPicks,
  loadStats,
  makeRound,
  missWeights,
  missedChords,
  recordAnswer,
  roundScore,
  savePicks,
  saveStats,
} from './earTraining.js'
import '../../../auth/authTheme.css'
import './Exercises.css'

const QUALITY_LABEL = { major: 'Major', minor: 'Minor', 7: 'Seventh' }

const choiceLabel = (choice) => QUALITY_LABEL[choice] ?? chordFor(choice)?.name ?? choice
const percent = (share) => `${Math.round(share * 100)}%`

/**
 * Ear training (F41), one of the Exercises. Pick a level (and, for "Which
 * chord?", the chords to train), then for each of ten questions the app
 * strums a chord (again, or one string at a time, as often as you like) and
 * you pick what you heard. Each answer shows the chord's shape when there is
 * one, and a wrong one lets you hear your pick beside the right chord. How
 * you do on each chord is kept, and the chords you miss come up more often.
 * Needs no microphone. Rules in earTraining.js, sound in chordSound.js.
 */
function EarTraining() {
  const [levelId, setLevelId] = useState(LEVELS[0].id)
  const [picks, setPicks] = useState(loadPicks)
  const [stats, setStats] = useState(loadStats)
  const [song] = useState(loadSongChords) // { title, chords } of the last song opened with chord names
  const [state, dispatch] = useReducer(exerciseReducer, undefined, initialExercise)
  const [soundError, setSoundError] = useState(null)
  const player = useChordPlayer()
  const nextRef = useRef(null)

  const { status, questions, index, results } = state
  const level = LEVELS.find((l) => l.id === (state.level ?? levelId))
  const question = questions[index]
  const result = status === 'answered' ? results[index] : null
  const lastQuestion = index + 1 >= questions.length
  const songPool = chordsFor(song?.chords)
  const pools = {
    quality: QUALITY_POOL,
    chord: CHORDS.filter((chord) => picks.includes(chord.id)),
    song: songPool,
  }
  const ready = (id) => pools[id].length >= MIN_POOL

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
    const weights = levelId === 'quality' ? {} : missWeights(stats)
    const round = makeRound(levelId, { pool: pools[levelId], weights })
    dispatch({ type: 'start', level: levelId, questions: round })
    listen(round[0].answer)
  }

  // Naming a chord counts towards how you do on it; quality answers don't.
  const answer = (choice) => {
    dispatch({ type: 'answer', choice })
    if (level.id === 'quality') return
    const updated = recordAnswer(stats, question.answer.id, choice === question.correct)
    setStats(updated)
    saveStats(updated)
  }

  const togglePick = (id) => {
    const updated = picks.includes(id) ? picks.filter((p) => p !== id) : CHORDS.map((c) => c.id).filter((c) => c === id || picks.includes(c))
    setPicks(updated)
    if (updated.length >= MIN_POOL) savePicks(updated)
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
          {levelId === 'chord' && (
            <div className="exercises__picks">
              <p className="exercises__hint">
                Pick the chords to train; the ones you miss come up more often.
                {picks.length < MIN_POOL && ` Pick at least ${MIN_POOL}.`}
              </p>
              <div className="exercises__pick-chords" role="group" aria-label="Chords to train">
                {CHORDS.map((chord) => {
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
          {levelId === 'song' && (
            <p className="exercises__hint">
              {ready('song')
                ? `From “${song.title}”: ${songPool.map((c) => c.id).join(' · ')}`
                : 'Open a song with chord names in Songs, then come back to train its chords.'}
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

      {status === 'done' && <RoundSummary results={results} onListen={listen} onAgain={start} onChangeLevel={quit} />}

      {soundError && <p className="exercises__error">{soundError}</p>}
    </section>
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
                <button type="button" className="exercises__chip" onClick={() => onListen(chordFor(id))}>
                  <strong>{chordFor(id).name}</strong>
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

export default EarTraining
