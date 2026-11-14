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
      {exercise ? <><div className="exercise-studio__toolbar"><button type="button" onClick={()=>setExerciseId(null)}>← Exercises</button><span>{exercise.category}</span><small>{exerciseId==='rhythm'?'Tap or optional microphone':'No microphone needed'}</small></div>{exerciseId==='ear'?<EarTraining />:exerciseId==='rhythm'?<RhythmStudio />:<ChordWorkout key={exerciseId} kind={exerciseId} />}</> : <>
        <header className="exercise-studio__hero"><span className="workout__eyebrow">YOUR GUITAR GYM</span><h1>A little practice.<br />A lot more confidence.</h1><p>Build the connection between your eyes, ears and hands. Choose one skill and give it a few focused minutes.</p></header>
        <div className="exercise-studio__skills" aria-label="Skills to practise"><span>See the shape</span><span>Remember the feeling</span><span>Find the groove</span><span>Trust your ear</span></div>
        <ul className="exercise-studio__cards">{EXERCISES.map((item)=><li key={item.id}><button type="button" className={`exercise-card exercise-card--${item.accent}`} onClick={()=>setExerciseId(item.id)}><span className="exercise-card__icon" aria-hidden="true">{item.icon}</span><span className="exercise-card__category">{item.category}</span><strong>{item.title}</strong><span className="exercise-card__description">{item.text}</span><small>{item.meta}</small><span className="exercise-card__action">Let’s practise <span aria-hidden="true">→</span></span></button></li>)}</ul>
        <p className="exercise-studio__footnote">Your pace. Your choice. No lives to lose, no streak to protect. These rounds stay in this visit.</p>
      </>}
    </div>
  )
}

export default Exercises
