import { useEffect, useMemo, useState } from 'react'
import './RecordPanel.css'
import './ShareAttempt.css'
import { getSharedRecordingUrl } from '@backend/attempts'
import { useSheetOverlay } from '../audio/useSheetOverlay.js'
import { fromTrace, judgeNotes, sampleVerdict } from '../share/sharedAttempt.js'

const SUNG_CLASS = 'practice-note--sung'
const MISSED_CLASS = 'practice-note--missed'

const LEGEND = [
  ['in-tune', 'in tune'],
  ['close', 'close'],
  ['octave', 'other octave'],
  ['wrong', 'wrong note'],
]

/**
 * Someone else's attempt, drawn on this device's copy of the score: the
 * same coloured pitch dots they saw, their part's notes marked sung (green)
 * or missed (red), their score, and their recording if they included it.
 * Everything is recomputed from the stored pitch trace, so it matches what
 * the singer saw as long as both copies of the song are the same file.
 */
function SharedAttemptPanel({ attempt, scoreModel, sheetMusicRef, supabase }) {
  const { addSample, clear } = useSheetOverlay(sheetMusicRef, scoreModel)
  const samples = useMemo(() => fromTrace(attempt.samples), [attempt])
  const [notes, setNotes] = useState(null)
  const [recordingUrl, setRecordingUrl] = useState(null)
  const [recordingError, setRecordingError] = useState(null)

  // Runs after useSheetOverlay's own effect has put its layer on this render.
  useEffect(() => {
    const viewer = sheetMusicRef.current
    if (!viewer || !scoreModel) return undefined
    const melody = scoreModel.notes.filter((n) => n.partIndex === 0).sort((a, b) => a.time - b.time)
    for (const sample of samples) addSample(sample, sampleVerdict(sample, melody))
    const judged = judgeNotes(samples, scoreModel.notes)
    judged.hit.forEach((note) => viewer.markNote(note.index, SUNG_CLASS))
    judged.missed.forEach((note) => viewer.markNote(note.index, MISSED_CLASS))
    setNotes(judged)
    return () => {
      clear()
      viewer.clearMarks(SUNG_CLASS)
      viewer.clearMarks(MISSED_CLASS)
    }
  }, [addSample, clear, samples, scoreModel, sheetMusicRef])

  useEffect(() => {
    let cancelled = false
    getSharedRecordingUrl(supabase, attempt).then(
      (url) => {
        if (!cancelled) setRecordingUrl(url)
      },
      (err) => {
        console.error(err)
        if (!cancelled) setRecordingError('The recording could not be loaded.')
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt, supabase])

  const who = attempt.sharer_name || 'Someone'
  const when = new Date(attempt.created_at).toLocaleDateString()

  return (
    <section className="record-panel shared-attempt">
      <p className="shared-attempt__title">
        <strong>{who}</strong>’s attempt{attempt.part_name ? ` · ${attempt.part_name}` : ''} · {when}
      </p>
      <div className="record-panel__result">
        <strong>{Math.round(Number(attempt.accuracy))}% in tune</strong>
        {notes && notes.total > 0 && (
          <span>
            {notes.hit.length} of {notes.total} notes sung
            {notes.missed.length ? ` · ${notes.missed.length} missed (red)` : ''}
          </span>
        )}
      </div>
      <ul className="shared-attempt__legend" aria-label="Dot colours">
        {LEGEND.map(([verdict, label]) => (
          <li key={verdict}>
            <span className={`shared-attempt__swatch shared-attempt__swatch--${verdict}`} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
      {recordingUrl && (
        <audio className="shared-attempt__audio" controls preload="metadata" src={recordingUrl}>
          Your browser can’t play this recording.
        </audio>
      )}
      {!attempt.recording_path && <p className="share-attempt__hint">No recording was shared with this attempt.</p>}
      {recordingError && <p className="share-attempt__error">{recordingError}</p>}
    </section>
  )
}

export default SharedAttemptPanel
