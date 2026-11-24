import TipAnchor from '../../../ui/onboarding/Tip.jsx'
import { useState } from 'react'
import EarTraining from './EarTraining.jsx'
import ChordWorkout from './ChordWorkout.jsx'
import RhythmStudio from './RhythmStudio.jsx'
import '../../../auth/authTheme.css'
import './Exercises.css'
import './Workouts.css'

const EXERCISES = [
  {id:'identify',title:'Name that shape',category:'READ THE FRETBOARD',icon:'◉',text:'Turn a chord diagram into a name. Train your eye, then trust it.',meta:'8 questions · visual recognition',accent:'lilac'},
  {id:'build',title:'Build a chord',category:'MAKE IT STICK',icon:'✋',text:'Rebuild the shapes you want to remember, one string at a time.',meta:'8 shapes · hands-on recall',accent:'orange'},
  {id:'rhythm',title:'Rhythm studio',category:'KEEP THE PULSE',icon:'♩',text:'From a steady down-strum to offbeat grooves. Hear the click, feel the space.',meta:'4 patterns · tap or strum',accent:'blue'},
  {id:'ear',title:'Ear training',category:'LISTEN CLOSELY',icon:'♫',text:'Hear the difference between major and minor, then recognise chords by name.',meta:'2 levels · sound recognition',accent:'teal'},
]

/** Standalone skill workouts. Returning to the hub unmounts active audio. */
function Exercises() {
  const [exerciseId, setExerciseId] = useState(null)
  const exercise = EXERCISES.find((item) => item.id === exerciseId)

  return (
    <div className={`exercises exercise-studio${exercise?' exercise-studio--active':''}`}>
      {exercise ? <><div className="exercise-studio__toolbar"><button type="button" onClick={()=>setExerciseId(null)}>← Exercises</button><span>{exercise.category}</span><small>{exerciseId==='rhythm'?'Tap or optional microphone':'No microphone needed'}</small></div><TipAnchor id={`guitar.exercises.${exerciseId}`}>
        {exerciseId === 'ear' ? <EarTraining /> : exerciseId === 'rhythm' ? <RhythmStudio /> : <ChordWorkout key={exerciseId} kind={exerciseId} />}
      </TipAnchor></> : <>
        <header className="hm-hero exercise-studio__intro">
          <span className="hm-hero__badge" aria-hidden="true">⚡</span>
          <div>
            <h1 className="hm-hero__title">Guitar exercises</h1>
            <p className="hm-hero__subtitle">Train your ear, learn chord shapes and practise keeping time.</p>
          </div>
        </header>
        <TipAnchor id="guitar.exercises">
          <ul className="exercise-studio__cards">{EXERCISES.map((item)=><li key={item.id}><button type="button" className={`exercise-card exercise-card--${item.accent}`} onClick={()=>setExerciseId(item.id)}><span className="exercise-card__icon" aria-hidden="true">{item.icon}</span><span className="exercise-card__category">{item.category}</span><strong>{item.title}</strong><span className="exercise-card__description">{item.text}</span><small>{item.meta}</small><span className="exercise-card__action">Let’s practise <span aria-hidden="true">→</span></span></button></li>)}</ul>
        </TipAnchor>
        <p className="exercise-studio__footnote">Your pace. Your choice. No lives to lose, no streak to protect. These rounds stay in this visit.</p>
      </>}
    </div>
  )
}

export default Exercises
