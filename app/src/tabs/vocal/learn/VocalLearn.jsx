import { useState } from 'react'
import './VocalLearn.css'
import RhythmLearn from './RhythmLearn.jsx'
import SolfegeLearn from './SolfegeLearn.jsx'
import { usePlayback } from './usePlayback.js'

const SECTIONS = [
  { id: 'solfege', label: 'Solfège' },
  { id: 'rhythm', label: 'Rhythm' },
]

/** Vocal → Learn: solfège (the scale, reading and ear quizzes) and rhythm (clapping along to a metronome). */
export default function VocalLearn() {
  const [section, setSection] = useState('solfege')
  const playback = usePlayback()

  const choose = (id) => {
    playback.stop()
    setSection(id)
  }

  return (
    <div className="vocal-learn">
      <div className="learn-segmented learn-segmented--wide" role="tablist" aria-label="Learn">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={`learn-segmented__option${section === s.id ? ' learn-segmented__option--on' : ''}`}
            onClick={() => choose(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === 'solfege' ? <SolfegeLearn playback={playback} /> : <RhythmLearn playback={playback} />}
    </div>
  )
}
