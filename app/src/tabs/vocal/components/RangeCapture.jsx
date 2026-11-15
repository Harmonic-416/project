import { useCallback, useRef, useState } from 'react'
import { useMicPitch } from '../audio/useMicPitch.js'
import { createNoteCatcher } from '../warmup/pitchTestLogic.js'
import { noteLabel } from '../transpose/keyFit.js'
import { MIN_MEASURED_SPAN, rangeFromCaught } from '../transpose/voiceRange.js'

// Held this long, a note counts as one you can sing (a slide through it doesn't).
const HOLD_SECONDS = 0.5

/**
 * "Sing your lowest, then your highest": listens while the singer holds
 * their lowest comfortable note and slides up to their highest, and keeps
 * the lowest and highest notes held for HOLD_SECONDS (voiceRange.js's
 * rangeFromCaught). Nothing is recorded or sent anywhere: only the two
 * notes are kept, on this device. `onSave({ low, high })`, `onCancel()`.
 */
export default function RangeCapture({ onSave, onCancel }) {
  const [caught, setCaught] = useState([])
  const catcherRef = useRef(createNoteCatcher({ minHold: HOLD_SECONDS }))
  const getTime = useCallback(() => performance.now() / 1000, [])
  const onSample = useCallback((sample) => {
    const note = catcherRef.current.push(sample)
    if (note) setCaught((list) => [...list, note.midi])
  }, [])
  const mic = useMicPitch({ getTime, onSample })
  const range = rangeFromCaught(caught)
  const enough = range && range.high - range.low >= MIN_MEASURED_SPAN
  const listening = mic.status === 'listening'

  const start = async () => {
    setCaught([])
    catcherRef.current.reset()
    await mic.start()
  }
  const finish = async (save) => {
    await mic.stop()
    if (save && enough) onSave(range)
    else onCancel()
  }

  return (
    <div className="transpose__capture" role="group" aria-label="Measure your range">
      <p className="practice-modes__hint">
        Sing your lowest comfortable note and hold it, then slide up to your highest and hold that. Only the two notes
        are kept, on this device.
      </p>
      <p className="transpose__capture-notes" aria-live="polite">
        {range ? `${noteLabel(range.low)} – ${noteLabel(range.high)}` : listening ? 'Listening…' : 'Not started'}
      </p>
      {mic.error && <p className="practice-modes__hint">{mic.error}</p>}
      <div className="practice-modes__options">
        {!listening ? (
          <button type="button" className="practice-modes__option" onClick={start} disabled={mic.status === 'requesting'}>
            {caught.length ? 'Again' : 'Start'}
          </button>
        ) : (
          <button type="button" className="practice-modes__option" onClick={() => finish(true)} disabled={!enough}>
            Save my range
          </button>
        )}
        <button type="button" className="practice-modes__option" onClick={() => finish(false)}>
          Cancel
        </button>
      </div>
      {listening && range && !enough && <p className="practice-modes__hint">Keep going: sing further up or down.</p>}
    </div>
  )
}
