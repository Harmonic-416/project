import { useState } from 'react'
import EarTraining from './EarTraining.jsx'
import '../../../auth/authTheme.css'
import './Exercises.css'

const EXERCISES = [{ id: 'ear', title: 'Ear training', Component: EarTraining }]

/**
 * Exercises to practise on your own, away from a song: ear training (F41),
 * which needs no microphone. (Strum on the beat, F18, is in Learn.)
 */
function Exercises() {
  const [exerciseId, setExerciseId] = useState(EXERCISES[0].id)
  const { Component } = EXERCISES.find((e) => e.id === exerciseId)

  return (
    <div className="exercises">
      {EXERCISES.length > 1 && (
        <div className="exercises__pick" role="group" aria-label="Exercise">
          {EXERCISES.map((e) => (
            <button key={e.id} type="button" aria-pressed={e.id === exerciseId} onClick={() => setExerciseId(e.id)}>
              {e.title}
            </button>
          ))}
        </div>
      )}
      <Component />
    </div>
  )
}

export default Exercises
