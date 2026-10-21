import { useState } from 'react'
import StrumDrill from '../exercises/StrumDrill.jsx'
import { STRUM_STEPS } from '../exercises/strumTiming.js'
import PracticeScreen from '../practice/PracticeScreen.jsx'
import { CHORDS } from '../practice/chords.js'
import { readLocalProgress } from './learnProgress.js'
import '../../../auth/authTheme.css'
import './Learn.css'

const ACTIVITIES = [
  {
    id: 'lessons',
    title: 'Chord lessons',
    text: '20 chords, one at a time, checked by the mic. Each one unlocks the next.',
    Component: PracticeScreen,
    progress: ({ cleared }) => `${Object.keys(cleared).length} of ${CHORDS.length} chords cleared`,
  },
  {
    id: 'strum',
    title: 'Strum on the beat',
    text: 'Down-strums with the click, then down-up. The mic tells you early or late.',
    Component: StrumDrill,
    progress: ({ strumPassed }) => `${STRUM_STEPS.filter((s) => strumPassed[s.id]).length} of ${STRUM_STEPS.length} steps passed`,
  },
]

/**
 * Guitar → Learn: the chord lessons (Guided, Practice, Play and one-minute
 * Changes; practice/PracticeScreen.jsx) and strum on the beat
 * (exercises/StrumDrill.jsx), each opened from a card that shows how far the
 * player has got. Progress is kept in the browser and, when signed in, on
 * the account (useLearnProgressSync); `progressVersion` changes when the
 * account's progress was brought in, so what's shown is redrawn from it.
 */
function LearnTab({ auth, progressVersion = 0 }) {
  const [openId, setOpenId] = useState(null)
  // Re-read on every render: closing an activity shows what it just saved.
  const progress = readLocalProgress()
  const opened = ACTIVITIES.find((a) => a.id === openId)

  const where = !auth?.configured
    ? 'Your progress is saved in this browser.'
    : auth.user
      ? 'Your progress is saved to your account.'
      : 'Your progress is saved in this browser. Sign in on Home to keep it on your account.'

  return (
    <div className="learn">
      {opened ? (
        <div className="learn__activity">
          <div className="learn__activity-top">
            <button type="button" className="learn__back" onClick={() => setOpenId(null)}>
              ← Learn
            </button>
            <h2>{opened.title}</h2>
          </div>
          <opened.Component key={progressVersion} />
        </div>
      ) : (
        <section aria-label="Learn">
          <p className="learn__where">{where}</p>
          <ul className="learn__activities">
            {ACTIVITIES.map((activity) => (
              <li key={activity.id}>
                <button type="button" className="feature-card" onClick={() => setOpenId(activity.id)}>
                  <strong>{activity.title}</strong>
                  <span className="feature-card__text">{activity.text}</span>
                  <span className="feature-card__note">{activity.progress(progress)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default LearnTab
