import { useEffect, useRef, useState } from 'react'
import { getSharedRecordingUrl } from '@backend/attempts'
import '../../../vocal/components/ShareAttempt.css'
import { RUN_MODE_LABEL, attemptNotesLine } from '../../../vocal/practice/practiceSession.js'
import { troubleSummary } from './troubleTracker.js'
import { entryAt, songTimeAt } from './recordingTiming.js'
import { seekToTick } from './playerControls.js'

const LEGEND = [
  ['hit', 'played'],
  ['close', 'close'],
  ['miss', 'missed'],
  ['skipped', 'not scored'],
]

// A Wait for me run's marks: first try, after a wrong try, Skip.
const WAIT_LEGEND = [
  ['hit', 'first try'],
  ['close', 'after a few tries'],
  ['miss', 'skipped'],
  ['skipped', 'not scored'],
]

/**
 * Someone else's guitar attempt, on this device's copy of the song (the
 * Guitar counterpart of vocal/components/SharedAttemptPanel): their
 * recording first, which is what there is to listen to (the song view
 * plays no MIDI while this is open), then their verdict on every note
 * boxed on the tab and their score. The verdicts are indexed by the song
 * timeline, so they line up as long as both copies of the song are the
 * same file.
 *
 * While the recording plays, the tab's cursor follows it note by note
 * (`attempt.timing`, recordingTiming.js; `api` is the score's alphaTab,
 * `ready` once its player is up). Runs saved before that have no timing,
 * and their cursor stays put.
 */
function GuitarSharedPanel({ attempt, entries, overlay, supabase, api = null, ready = false }) {
  const [recordingUrl, setRecordingUrl] = useState(null)
  const audioRef = useRef(null)
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

  // The cursor on the note being played at this point of the recording.
  const timing = attempt.timing
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !timing?.length || !api || !ready || !entries.length) return undefined
    let raf = null
    let shown = null
    const show = () => {
      const entry = entryAt(entries, songTimeAt(timing, audio.currentTime))
      if (!entry || entry === shown) return
      shown = entry
      seekToTick(api, entry.tick)
      api.scrollToCursor()
    }
    const follow = () => {
      show()
      raf = requestAnimationFrame(follow)
    }
    const onPlay = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(follow)
    }
    const onStop = () => {
      cancelAnimationFrame(raf)
      show()
    }
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onStop)
    audio.addEventListener('ended', onStop)
    audio.addEventListener('seeked', onStop)
    show()
    if (!audio.paused) onPlay()
    return () => {
      cancelAnimationFrame(raf)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onStop)
      audio.removeEventListener('ended', onStop)
      audio.removeEventListener('seeked', onStop)
    }
  }, [recordingUrl, timing, api, ready, entries])

  const counts = troubleSummary(verdicts)
  const who = attempt.sharer_name || 'Someone'
  const when = new Date(attempt.created_at).toLocaleDateString()
  const wait = attempt.mode === 'wait'
  const modeLabel = RUN_MODE_LABEL[attempt.mode]
  const loading = Boolean(attempt.recording_path) && !recordingUrl && !recordingError

  return (
    <section className="guitar-shared">
      <p className="shared-attempt__title">
        <strong>{who}</strong>’s attempt{modeLabel ? ` · ${modeLabel}` : ''}
        {attempt.easy ? ' (Easy)' : ''}
        {attempt.part_name ? ` · ${attempt.part_name}` : ''} · {when}
      </p>
      {recordingUrl && (
        <div className="guitar-shared__listen">
          <span className="guitar-shared__listen-label">Listen to {who} play</span>
          <audio ref={audioRef} className="shared-attempt__audio" controls preload="metadata" src={recordingUrl}>
            Your browser can’t play this recording.
          </audio>
        </div>
      )}
      {loading && <p className="share-attempt__hint">Loading the recording…</p>}
      {!attempt.recording_path && (
        <p className="share-attempt__hint">
          {who} didn’t include a recording with this run, so there’s nothing to listen to; their marks are on the tab.
        </p>
      )}
      {recordingError && <p className="share-attempt__error">{recordingError}</p>}
      <p className="guitar-shared__score">
        {wait ? (
          <strong>{attemptNotesLine(verdicts, 'wait')}</strong>
        ) : (
          <>
            <strong>
              Hit {counts.hit} of {counts.scored}
            </strong>
            {counts.close ? ` · ${counts.close} close` : ''}
            {counts.missed ? ` · ${counts.missed} missed` : ''}
          </>
        )}
      </p>
      <ul className="guitar-shared__legend" aria-label="Mark colours">
        {(wait ? WAIT_LEGEND : LEGEND).map(([verdict, label]) => (
          <li key={verdict}>
            <span className={`guitar-shared__swatch guitar-shared__swatch--${verdict}`} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default GuitarSharedPanel
