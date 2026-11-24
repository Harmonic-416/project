import { useOnboardingBusy, usePracticeOnboarding } from '../../../ui/onboarding/useOnboarding.js'
import { useEffect, useRef, useState } from 'react'
import { guitarNoteTarget } from '../song/follow/guitarCoaching.js'
import { CLIPPING_HELP } from '../song/follow/inputQuality.js'
import { STRING_NAMES } from './chords.js'
import { lessonEntry } from './lessonVerdicts.js'
import { useLessonListening } from './useLessonListening.js'

export default function ChordStringCheck({ chord, onClose }) {
  const dialog = useRef(null)
  const [stringIndex, setStringIndex] = useState(() => chord.frets.findIndex((fret) => fret >= 0))
  const [result, setResult] = useState(null)
  const listener = useLessonListening({ chord, stringIndex, onVerdict: setResult })
  const { status, error, start, stop } = listener
  const { startWithMicrophone } = usePracticeOnboarding()
  useOnboardingBusy(true)
  const target = lessonEntry(chord, stringIndex).notes[0]
  const message = result?.verdict === 'silent'
    ? 'No clear sound yet. Move closer to the microphone and pick again.'
    : result?.advice

  useEffect(() => {
    dialog.current.showModal()
  }, [])

  return (
    <dialog ref={dialog} className="chord-library chord-string-check" aria-labelledby="chord-string-check-title" onClose={onClose}>
      <header className="chord-library__header">
        <div><h2 id="chord-string-check-title">Check one string</h2><p>Hold the {chord.name} shape. Pick one string and let it ring.</p></div>
        <button type="button" onClick={() => dialog.current.close()} aria-label="Close string check">✕</button>
      </header>
      <div className="lesson-coach__strings" role="group" aria-label="String to check">
        {chord.frets.map((fret, index) => (
          <button key={index} type="button" disabled={fret < 0} aria-pressed={index === stringIndex} aria-label={`Check string ${6 - index} (${STRING_NAMES[index]})`} onClick={() => {
            if (index === stringIndex) return
            setResult(null)
            setStringIndex(index)
          }}>{STRING_NAMES[index]} <small>{fret < 0 ? 'Mute' : fret === 0 ? 'Open' : `Fret ${fret}`}</small></button>
        ))}
      </div>
      <p>Target: {guitarNoteTarget(target)}</p>
      <p role="status">{listener.clipping ? CLIPPING_HELP : message || 'The microphone checks the pitch. Use the diagram for finger placement.'}</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="practice__listen" disabled={status === 'requesting'} onClick={async () => {
        if (status !== 'listening' && startWithMicrophone && !(await startWithMicrophone())) return
        setResult(null)
        if (status === 'listening') stop()
        else start()
      }}>{status === 'listening' ? 'Stop listening' : status === 'requesting' ? 'Starting microphone…' : 'Listen to this string'}</button>
    </dialog>
  )
}
