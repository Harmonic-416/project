import { useState } from 'react'
import './VocalLearn.css'
import RhythmLearn from './RhythmLearn.jsx'
import SolfegeLearn from './SolfegeLearn.jsx'
import { usePlayback } from './usePlayback.js'
import { bestStars } from '../feedback/progress.js'
import { useVocalProgress } from '../feedback/useProgress.js'
import { sfx } from '../feedback/sfx.js'

// The lessons in order, a unit at a time. Each unlocks once the one before it
// has been done (feedback/progress.js keeps that on this device).
const UNITS = [
  {
    title: 'Solfège',
    blurb: 'Give every note a name you can sing',
    lessons: [
      { id: 'solfege-scale', lesson: 'scale', title: 'The scale', blurb: 'Meet do re mi on the staff', icon: '🎼' },
      { id: 'solfege-read', lesson: 'read', title: 'Read it', blurb: 'Name the notes you see', icon: '👀' },
      { id: 'solfege-ear', lesson: 'ear', title: 'Hear it', blurb: 'Name the notes you hear', icon: '👂' },
    ],
  },
  {
    title: 'Rhythm',
    blurb: 'Feel how long each note lasts',
    lessons: [{ id: 'rhythm', lesson: 'rhythm', title: 'Clap along', blurb: 'Quarter, half, whole and eighth notes', icon: '👏' }],
  },
]
const LESSONS = UNITS.flatMap((u) => u.lessons)

// Nodes sway left and right down the path.
const SWAY = [0, 1, 0, -1]

/** Vocal → Learn: a path of lessons (solfège, then rhythm); tap one to open it. */
export default function VocalLearn() {
  const [open, setOpen] = useState(null) // a LESSONS entry, or null for the path
  const playback = usePlayback()
  const progress = useVocalProgress()

  const firstUndone = LESSONS.findIndex((l) => bestStars(l.id, progress) === null)
  const stateOf = (i) => (firstUndone === -1 || i < firstUndone ? 'done' : i === firstUndone ? 'current' : 'locked')

  const openLesson = (lesson) => {
    playback.stop()
    sfx.tap()
    setOpen(lesson)
  }

  const back = () => {
    playback.stop()
    setOpen(null)
  }

  if (open) {
    const index = LESSONS.indexOf(open)
    const next = LESSONS[index + 1]
    const nextReady = next && stateOf(index + 1) !== 'locked'
    return (
      <div className="vocal-learn">
        <div className="learn-lesson-bar">
          <button type="button" className="vocal-tab__back" onClick={back}>
            ← Lessons
          </button>
          <span className="learn-lesson-bar__title">
            <span aria-hidden="true">{open.icon}</span> {open.title}
          </span>
          {nextReady && (
            <button type="button" className="v-btn v-btn--sm" onClick={() => openLesson(next)}>
              Next: {next.title} →
            </button>
          )}
        </div>
        {open.lesson === 'rhythm' ? (
          <RhythmLearn playback={playback} />
        ) : (
          <SolfegeLearn key={open.lesson} playback={playback} lesson={open.lesson} />
        )}
      </div>
    )
  }

  return (
    <div className="vocal-learn">
      <header className="vocal-hero">
        <span className="vocal-hero__badge" aria-hidden="true">
          📖
        </span>
        <div>
          <h1 className="vocal-hero__title">Learn to read music</h1>
          <p className="vocal-hero__subtitle">
            {firstUndone === -1
              ? 'Every lesson done. Replay any of them to keep sharp.'
              : `${firstUndone} of ${LESSONS.length} lessons done`}
          </p>
        </div>
      </header>

      {UNITS.map((unit, u) => (
        <section key={unit.title} className={`learn-unit learn-unit--${u}`}>
          <div className="learn-unit__banner">
            <span className="learn-unit__number">Unit {u + 1}</span>
            <h2 className="learn-unit__title">{unit.title}</h2>
            <p className="learn-unit__blurb">{unit.blurb}</p>
          </div>
          <ol className="learn-path">
            {unit.lessons.map((lesson) => {
              const i = LESSONS.indexOf(lesson)
              const state = stateOf(i)
              const stars = bestStars(lesson.id, progress)
              return (
                <li key={lesson.id} className="learn-path__step" style={{ '--sway': SWAY[i % SWAY.length] }}>
                  <button
                    type="button"
                    className={`learn-node learn-node--${state}`}
                    disabled={state === 'locked'}
                    onClick={() => openLesson(lesson)}
                    aria-label={`${lesson.title}: ${state === 'locked' ? 'locked' : state === 'done' ? 'done' : 'start'}`}
                  >
                    <span aria-hidden="true">{state === 'locked' ? '🔒' : lesson.icon}</span>
                  </button>
                  {state === 'current' && <span className="learn-node__start">Start</span>}
                  <span className="learn-node__label">
                    <strong>{lesson.title}</strong>
                    <small>{lesson.blurb}</small>
                    {stars !== null && (
                      <span className="learn-node__stars" aria-label={`Best: ${stars} of 3 stars`}>
                        {[0, 1, 2].map((s) => (
                          <span key={s} className={s < stars ? 'on' : undefined} aria-hidden="true">
                            ★
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
