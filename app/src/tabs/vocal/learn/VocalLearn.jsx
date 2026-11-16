import { BookOpen, Mic } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './VocalLearn.css'
import RhythmLearn from './RhythmLearn.jsx'
import SolfegeLearn from './SolfegeLearn.jsx'
import WarmUp from '../warmup/WarmUp.jsx'
import SongCardMeta from '../components/SongCardMeta.jsx'
import ProgressBar from '../ui/ProgressBar.jsx'
import { usePlayback } from './usePlayback.js'
import { courseLevels, levelStates } from './levels.js'
import { songLibrary } from '../songs/songLibrary.js'
import { bestStars } from '../feedback/progress.js'
import { useVocalProgress } from '../feedback/useProgress.js'
import { sfx } from '../feedback/sfx.js'

const LEVELS = courseLevels(songLibrary)

function Stars({ count }) {
  return (
    <span className="vlevel-stars" aria-label={`Best: ${count} of 3 stars`}>
      {[0, 1, 2].map((s) => (
        <span key={s} className={s < count ? 'vlevel-stars__on' : undefined} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}

/**
 * Vocal → Learn: a course of songs. Each level is one main song, opened on
 * the song screen through `onOpenSong(song, levelId)`; beside it sit the
 * activities that build up to it (warm-ups, solfège, rhythm, the ear tests),
 * which open here. Nothing is locked: the first level whose song hasn't been
 * sung is marked "Up next" (levels.js). `focusLevel` is the level a singer
 * came back from, scrolled into view so they land where they left off.
 */
export default function VocalLearn({ onOpenSong, focusLevel = null }) {
  const [open, setOpen] = useState(null) // { level, activity } while a supporting activity is open
  const playback = usePlayback()
  const progress = useVocalProgress()
  const states = levelStates(LEVELS, progress.stars)
  const doneCount = states.filter((s) => s === 'done').length
  const nextIndex = states.indexOf('next')
  const cards = useRef(new Map())

  useEffect(() => {
    if (open || !focusLevel) return
    cards.current.get(focusLevel)?.scrollIntoView?.({ block: 'center' })
  }, [open, focusLevel])

  const openActivity = (level, activity) => {
    playback.stop()
    sfx.tap()
    setOpen({ level, activity })
  }

  const back = () => {
    playback.stop()
    const levelId = open.level.id
    setOpen(null)
    // Back on the course, the level just practised for is where the eye should land.
    requestAnimationFrame(() => cards.current.get(levelId)?.scrollIntoView?.({ block: 'center' }))
  }

  const sing = (level) => {
    playback.stop()
    sfx.tap()
    onOpenSong(level.song, level.id)
  }

  if (open) {
    const { level, activity } = open
    return (
      <div className="vocal-learn">
        <div className="learn-lesson-bar">
          <button type="button" className="vocal-tab__back" onClick={back}>
            ← Learn
          </button>
          <span className="learn-lesson-bar__title">
            <span aria-hidden="true"><activity.icon size="1.1em" aria-hidden="true" /></span> {activity.title}
            <small className="learn-lesson-bar__for">Getting ready for {level.song.title}</small>
          </span>
          <button type="button" className="v-btn v-btn--sm" onClick={() => sing(level)}>
            Sing {level.song.title} →
          </button>
        </div>
        {activity.kind === 'warmup' ? (
          <WarmUp show="warmups" />
        ) : activity.kind === 'tests' ? (
          <WarmUp show="tests" only={activity.test} />
        ) : activity.lesson === 'rhythm' ? (
          <RhythmLearn playback={playback} />
        ) : (
          <SolfegeLearn key={activity.lesson} playback={playback} lesson={activity.lesson} />
        )}
      </div>
    )
  }

  const next = LEVELS[nextIndex]

  return (
    <div className="vocal-learn">
      <header className="hm-hero">
        <span className="hm-hero__badge" aria-hidden="true">
          <BookOpen size="1.1em" aria-hidden="true" />
        </span>
        <div className="vlearn-hero__text">
          <h1 className="hm-hero__title">Learn to sing, one song at a time</h1>
          <p className="hm-hero__subtitle">
            Every level is a song. The warm-ups and lessons beside it are there to help, so use the ones you need.
          </p>
          <ProgressBar value={doneCount} max={LEVELS.length} label="Songs sung" />
          <span className="vlearn-hero__count">
            {doneCount} of {LEVELS.length} songs sung
          </span>
        </div>
      </header>

      {/* On a fresh start the first level is right there; later, it saves a scroll. */}
      {next && nextIndex > 0 && (
        <button type="button" className="vlearn-continue v-card v-card--pressable" onClick={() => sing(next)}>
          <span className="vlearn-continue__eyebrow">Up next · Level {nextIndex + 1}</span>
          <strong>{next.song.title}</strong>
          <small>{next.focus}</small>
          <span className="vlearn-continue__go" aria-hidden="true">
            ▶
          </span>
        </button>
      )}

      <ol className="vlevels" aria-label="Levels">
        {LEVELS.map((level, i) => {
          const state = states[i]
          return (
            <li
              key={level.id}
              ref={(el) => (el ? cards.current.set(level.id, el) : cards.current.delete(level.id))}
              className={`vlevel vlevel--${state}`}
            >
              <span className="vlevel__number" aria-hidden="true">
                {state === 'done' ? '✓' : i + 1}
              </span>
              <div className="vlevel__body">
                <div className="vlevel__head">
                  <span className="vlevel__eyebrow">
                    Level {i + 1}
                    {state === 'next' && <span className="vlevel__badge">Up next</span>}
                    {state === 'done' && <span className="vlevel__badge vlevel__badge--done">✓ Sung</span>}
                  </span>
                  <h2 className="vlevel__title">{level.song.title}</h2>
                  <p className="vlevel__focus">{level.focus}</p>
                  <SongCardMeta song={level.song} />
                </div>
                <button
                  type="button"
                  className={`v-btn ${state === 'next' ? '' : 'v-btn--secondary'} vlevel__sing`}
                  onClick={() => sing(level)}
                  aria-label={`${state === 'done' ? 'Sing again' : 'Sing'}: ${level.song.title}`}
                >
                  <Mic size="1.1em" aria-hidden="true" /> {state === 'done' ? 'Sing again' : 'Sing the song'}
                </button>
                <div className="vlevel__supports">
                  <span className="vlevel__supports-label">Build up to it</span>
                  <ul>
                    {level.supports.map((activity) => {
                      const stars = activity.starsId ? bestStars(activity.starsId, progress) : null
                      return (
                        <li key={activity.id}>
                          <button
                            type="button"
                            className="vlevel__support"
                            onClick={() => openActivity(level, activity)}
                          >
                            <span className="vlevel__support-icon" aria-hidden="true">
                              <activity.icon size="1.1em" aria-hidden="true" />
                            </span>
                            <span className="vlevel__support-text">
                              <strong>{activity.title}</strong>
                              <small>{activity.blurb}</small>
                            </span>
                            {stars !== null && <Stars count={stars} />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
