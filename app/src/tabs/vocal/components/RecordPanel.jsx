import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Tone from 'tone'
import './RecordPanel.css'
import { useMicPitch } from '../audio/useMicPitch.js'
import { useSheetOverlay } from '../audio/useSheetOverlay.js'
import { centsOff, classifyCents, findActiveNote, midiToNoteName, scoreAttempt } from '../audio/pitchDetector.js'
import { downloadBlob, safeFilename } from '../notation/exportNotation.js'
import { judgeNotes } from '../share/sharedAttempt.js'
import { getScoreSeconds } from '../playback/scoreClock.js'
import ShareAttempt from './ShareAttempt.jsx'

const SUNG_CLASS = 'practice-note--sung'
const MISSED_CLASS = 'practice-note--missed'

/**
 * Playback clock in score seconds (at any tempo, so a slowed attempt still
 * lines up with the score), or null while the transport isn't running (mic
 * warm-up, permission prompt, count-in).
 */
const getTransportSeconds = () => (Tone.Transport.state === 'started' ? getScoreSeconds() : null)

/**
 * "Record attempt": starts the microphone and playback together, plots the
 * sung pitch on the sheet music while the cursor moves, and scores the
 * attempt against the first part's melody when playback ends (or Stop is
 * pressed): each note of the part turns green (sung) or red (missed). The
 * compressed recording can be downloaded, and the attempt shared as a link
 * (see ShareAttempt; `shareSong` describes the song without uploading it).
 */
function RecordPanel({ scoreModel, playback, sheetMusicRef, title, auth, supabase, shareSong }) {
  const melody = useMemo(
    () =>
      scoreModel
        ? scoreModel.notes.filter((n) => n.partIndex === 0).sort((a, b) => a.time - b.time)
        : [],
    [scoreModel],
  )
  const overlay = useSheetOverlay(sheetMusicRef, scoreModel)
  const [armed, setArmed] = useState(false)
  const [result, setResult] = useState(null)
  const [recording, setRecording] = useState(null)
  const [notes, setNotes] = useState(null) // { hit, missed, total }
  const [samples, setSamples] = useState([])

  const clearNoteMarks = useCallback(() => {
    sheetMusicRef.current?.clearMarks(SUNG_CLASS)
    sheetMusicRef.current?.clearMarks(MISSED_CLASS)
  }, [sheetMusicRef])

  // Leaving (another part, another mode, another song) takes the marks along.
  useEffect(() => clearNoteMarks, [clearNoteMarks])

  const handleSample = useCallback(
    (sample) => {
      const target = findActiveNote(melody, sample.time)
      overlay.addSample(sample, target ? classifyCents(centsOff(sample.midi, target.midi)) : 'rest')
    },
    [melody, overlay],
  )

  const mic = useMicPitch({ getTime: getTransportSeconds, onSample: handleSample })

  const startAttempt = useCallback(async () => {
    setResult(null)
    setRecording(null)
    setNotes(null)
    clearNoteMarks()
    overlay.clear()
    playback.stop()
    await mic.start()
    await playback.play()
    setArmed(true)
  }, [clearNoteMarks, mic, overlay, playback])

  const finishAttempt = useCallback(async () => {
    setArmed(false)
    const blob = await mic.stop()
    if (playback.state === 'counting' || playback.state === 'playing' || playback.state === 'paused') playback.stop()
    const sung = [...mic.getSamples()]
    const judged = judgeNotes(sung, scoreModel.notes)
    judged.hit.forEach((note) => sheetMusicRef.current?.markNote(note.index, SUNG_CLASS))
    judged.missed.forEach((note) => sheetMusicRef.current?.markNote(note.index, MISSED_CLASS))
    setRecording(blob)
    setSamples(sung)
    setNotes(judged)
    setResult(scoreAttempt(sung, melody))
  }, [melody, mic, playback, scoreModel, sheetMusicRef])

  // Playback reaching the end (or Stop) ends the attempt. Deferred a tick so
  // the state updates in finishAttempt don't cascade inside this effect.
  useEffect(() => {
    if (!(armed && mic.status === 'listening' && playback.state === 'stopped')) return undefined
    const id = setTimeout(finishAttempt, 0)
    return () => clearTimeout(id)
  }, [armed, mic.status, playback.state, finishAttempt])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__harmonic = {
      ...(window.__harmonic ?? {}),
      getTransportSeconds: getScoreSeconds,
      isTransportRunning: () => Tone.Transport.state === 'started',
      lastResult: result,
      lastRecordingSize: recording?.size ?? null,
    }
  }, [result, recording])

  const live = mic.current
  const liveTarget = live ? findActiveNote(melody, live.time) : null
  const liveCents = live && liveTarget ? centsOff(live.midi, liveTarget.midi) : null
  const liveVerdict = liveCents === null ? 'rest' : classifyCents(liveCents)
  const listening = mic.status === 'listening'

  return (
    <section className="record-panel">
      <div className="record-panel__row">
        {listening ? (
          <button type="button" className="record-panel__button record-panel__button--stop" onClick={finishAttempt}>
            ■ Stop attempt
          </button>
        ) : (
          <button
            type="button"
            className="record-panel__button"
            disabled={!scoreModel || mic.status === 'requesting'}
            onClick={startAttempt}
          >
            {mic.status === 'requesting' ? 'Starting microphone…' : '● Record attempt'}
          </button>
        )}
        {listening && (
          <span className={`record-panel__live record-panel__live--${liveVerdict}`} aria-live="polite">
            {live
              ? `${live.noteName}${liveTarget ? ` · target ${midiToNoteName(liveTarget.midi)} (${liveCents > 0 ? '+' : ''}${Math.round(liveCents)}¢)` : ' · rest'}`
              : 'listening…'}
          </span>
        )}
        {mic.status === 'error' && <span className="record-panel__error">{mic.error}</span>}
      </div>

      {result && (
        <div className="record-panel__result">
          <strong>{Math.round(result.accuracy)}% in tune</strong>
          {notes && notes.total > 0 && (
            <span>
              {notes.hit.length} of {notes.total} notes sung
              {notes.missed.length ? ` · ${notes.missed.length} missed (red)` : ''}
            </span>
          )}
          <span>
            {result.inTune} of {result.scoredFrames} frames within 50¢
            {result.octaveAgnosticAccuracy > result.accuracy + 0.5
              ? ` · ${Math.round(result.octaveAgnosticAccuracy)}% ignoring octave`
              : ''}
          </span>
          {recording && (
            <button
              type="button"
              className="record-panel__link"
              onClick={() => downloadBlob(recording, `${safeFilename(title || 'attempt')}-attempt.webm`)}
            >
              Download recording ({Math.round(recording.size / 1024)} KB)
            </button>
          )}
          <button
            type="button"
            className="record-panel__link"
            onClick={() => {
              overlay.clear()
              clearNoteMarks()
              setResult(null)
              setNotes(null)
            }}
          >
            Clear trace
          </button>
          <ShareAttempt
            auth={auth}
            supabase={supabase}
            song={shareSong}
            samples={samples}
            accuracy={result.accuracy}
            recording={recording}
          />
        </div>
      )}
    </section>
  )
}

export default RecordPanel
