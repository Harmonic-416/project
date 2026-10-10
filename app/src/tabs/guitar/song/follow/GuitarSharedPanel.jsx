import { useEffect, useState } from 'react'
import { getSharedRecordingUrl } from '@backend/attempts'
import '../../../vocal/components/ShareAttempt.css'
import { troubleSummary } from './troubleTracker.js'

const LEGEND = [
  ['hit', 'played'],
  ['close', 'close'],
  ['miss', 'missed'],
  ['skipped', 'not scored'],
]

/**
 * Someone else's guitar attempt, on this device's copy of the song (the
 * Guitar counterpart of vocal/components/SharedAttemptPanel): their verdict
 * on every note boxed on the tab, their score, and their recording if they
 * included it. The verdicts are indexed by the song timeline, so they line
 * up as long as both copies of the song are the same file.
 */
function GuitarSharedPanel({ attempt, entries, overlay, supabase }) {
  const [recordingUrl, setRecordingUrl] = useState(null)
  const [recordingError, setRecordingError] = useState(null)
  const verdicts = attempt.verdicts ?? []

  useEffect(() => {
    ;(attempt.verdicts ?? []).forEach((verdict, index) => {
      if (verdict && index < entries.length) overlay.mark(index, verdict)
    })
    return () => overlay.clear()
  }, [attempt, entries, overlay])

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

  const counts = troubleSummary(verdicts)
  const who = attempt.sharer_name || 'Someone'
  const when = new Date(attempt.created_at).toLocaleDateString()

  return (
    <section className="guitar-shared">
      <p className="shared-attempt__title">
        <strong>{who}</strong>’s attempt{attempt.part_name ? ` · ${attempt.part_name}` : ''} · {when}
      </p>
      <p className="guitar-shared__score">
        <strong>
          Hit {counts.hit} of {counts.scored}
        </strong>
        {counts.close ? ` · ${counts.close} close` : ''}
        {counts.missed ? ` · ${counts.missed} missed` : ''}
      </p>
      <ul className="guitar-shared__legend" aria-label="Mark colours">
        {LEGEND.map(([verdict, label]) => (
          <li key={verdict}>
            <span className={`guitar-shared__swatch guitar-shared__swatch--${verdict}`} aria-hidden="true" />
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

export default GuitarSharedPanel
