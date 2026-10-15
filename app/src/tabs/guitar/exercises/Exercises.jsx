import { useState } from 'react'
import EarTraining from './EarTraining.jsx'
import StrumDrill from './StrumDrill.jsx'
import '../../../auth/authTheme.css'
import './Exercises.css'

const EXERCISES = [
  { id: 'ear', title: 'Ear training', Component: EarTraining },
  { id: 'strum', title: 'Strum on the beat', Component: StrumDrill },
]

/**
 * Exercises to practise on your own, away from a song: ear training (F41),
 * which needs no microphone, and strumming in time with a click (F18).
 */
function Exercises() {
  const [exerciseId, setExerciseId] = useState(EXERCISES[0].id)
  const { Component } = EXERCISES.find((e) => e.id === exerciseId)

  return (
    <div className="exercises">
      <div className="exercises__pick" role="group" aria-label="Exercise">
        {EXERCISES.map((e) => (
          <button key={e.id} type="button" aria-pressed={e.id === exerciseId} onClick={() => setExerciseId(e.id)}>
            {e.title}
          </button>
        ))}
      </div>
      <Component />
    </div>
  )
}

export default Exercises
