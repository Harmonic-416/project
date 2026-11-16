import { rememberSongBars } from '../practice/songBars.js'
import { barAt } from '../practice/takeSummary.js'
import { Download, Eraser } from 'lucide-react'
import { Mic, Music } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as Tone from 'tone'
import './RecordPanel.css'
import { useMicPitch } from '../audio/useMicPitch.js'
import { useSheetOverlay } from '../audio/useSheetOverlay.js'
import { centsOff, classifyCents, findActiveNote, midiToNoteName, scoreAttempt } from '../audio/pitchDetector.js'
import { downloadBlob, safeFilename } from '../notation/exportNotation.js'
import { judgeNotes } from '../share/sharedAttempt.js'
import { getScoreSeconds } from '../playback/scoreClock.js'
import ShareAttempt from './ShareAttempt.jsx'
import SessionAttempts from './SessionAttempts.jsx'
import DynamicsMeter from './DynamicsMeter.jsx'
import PitchMeter from './PitchMeter.jsx'
import { gradeNote, median } from './pitchReading.js'
import { createTroubleTracker, melodyLine, noteDistanceCents } from '../practice/practiceLogic.js'
import { describeDynamics, summarizeDynamics } from '../audio/dynamics.js'
import { sfx } from '../feedback/sfx.js'
import { recordStars } from '../feedback/progress.js'
import TakeSummary from './TakeSummary.jsx'
import { tapNote } from '../learn/usePlayback.js'
import { summarizeTake } from '../practice/takeSummary.js'

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
 * `session` (usePracticeSession, from VocalTab) collects the attempts of
 * this sitting under the panel ("This session"). While listening, the live
 * PitchMeter is portalled into `meterSlot`: beside the score, where the
 * singer is already looking. The Sing / Stop button is portalled into
 * `actionSlot` (the player dock), so starting an attempt is the screen's
 * primary action rather than a button below the transport.
 *
 * Each note is graded on the staff as soon as it has gone by — a ✓ or an
 * arrow badge, and the note head turns green or red — by the same Trouble
 * spots tracker judgeNotes runs at the end, so the live marks and the final
 * result always agree. Singers learn more from a graded staff after the
 * phrase than from watching a meter during it (docs/vocal-community-research.md).
 */
function RecordPanel({ scoreModel, playback, sheetMusicRef, title, auth, supabase, shareSong, session = null, meterSlot = null, actionSlot = null }) {
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
  const [take, setTake] = useState(null) // summarizeTake(...) for the last finished attempt
  // The line judged note by note while singing (entries keep `index` into scoreModel.notes).
  const judgedLine = useMemo(() => (scoreModel ? melodyLine(scoreModel.notes) : []), [scoreModel])
  // So lists of attempts can name the bars each one missed without the score open (practice/songBars.js).
  useEffect(() => {
    if (!scoreModel?.bars?.length || !judgedLine.length || !shareSong) return
    rememberSongBars(shareSong, judgedLine.map((note) => barAt(scoreModel.bars, note.time)?.number ?? 0))
  }, [scoreModel, judgedLine, shareSong])
  const liveJudgeRef = useRef(null) // { tracker, cents: Map<lineIndex, number[]> } during an attempt

  const clearNoteMarks = useCallback(() => {
    sheetMusicRef.current?.clearMarks(SUNG_CLASS)
    sheetMusicRef.current?.clearMarks(MISSED_CLASS)
  }, [sheetMusicRef])

  // Leaving (another part, another mode, another song) takes the marks along.
  useEffect(() => clearNoteMarks, [clearNoteMarks])

  const gradeOnStaff = useCallback(
    (note, hit) => {
      const lineIndex = judgedLine.indexOf(note)
      const sung = liveJudgeRef.current?.cents.get(lineIndex) ?? []
      sheetMusicRef.current?.markNote(note.index, hit ? SUNG_CLASS : MISSED_CLASS)
      overlay.addBadge(note, gradeNote({ hit, cents: median(sung) }))
    },
    [judgedLine, overlay, sheetMusicRef],
  )

  const handleSample = useCallback(
    (sample) => {
      const target = findActiveNote(melody, sample.time)
      overlay.addSample(sample, target ? classifyCents(centsOff(sample.midi, target.midi)) : 'rest')
      const judge = liveJudgeRef.current
      if (!judge) return
      // Which way a note was off: what was sung during its body, after the attack.
      const lineIndex = judgedLine.findIndex(
        (note) => sample.time >= note.time + Math.min(0.1, note.duration / 2) && sample.time < note.time + note.duration,
      )
      if (lineIndex >= 0) {
        const list = judge.cents.get(lineIndex) ?? []
        list.push(noteDistanceCents(sample.midi, judgedLine[lineIndex].midi))
        judge.cents.set(lineIndex, list)
      }
      judge.tracker.addSample(sample)
      const { hit, missed } = judge.tracker.collect(sample.time)
      hit.forEach((note) => gradeOnStaff(note, true))
      missed.forEach((note) => gradeOnStaff(note, false))
    },
    [melody, overlay, judgedLine, gradeOnStaff],
  )

  const mic = useMicPitch({ getTime: getTransportSeconds, onSample: handleSample })

  const startAttempt = useCallback(async () => {
    setResult(null)
    setRecording(null)
    setNotes(null)
    setTake(null)
    clearNoteMarks()
    overlay.clear()
    liveJudgeRef.current = { tracker: createTroubleTracker(judgedLine), cents: new Map() }
    playback.setLoop(null) // a take is judged front to back, once
    playback.stop()
    await mic.start()
    await playback.play()
    setArmed(true)
  }, [clearNoteMarks, mic, overlay, playback, judgedLine])

  const finishAttempt = useCallback(async () => {
    setArmed(false)
    const blob = await mic.stop()
    if (playback.state === 'counting' || playback.state === 'playing' || playback.state === 'paused') playback.stop()
    const sung = [...mic.getSamples()]
    const judged = judgeNotes(sung, scoreModel.notes)
    // The final word: re-grade every note (the live pass hasn't closed the last ones yet).
    overlay.clearBadges()
    const hits = new Set(judged.hit.map((note) => note.index))
    const misses = new Set(judged.missed.map((note) => note.index))
    judgedLine.forEach((note) => {
      if (hits.has(note.index) || misses.has(note.index)) gradeOnStaff(note, hits.has(note.index))
    })
    const centsByNote = new Map()
    for (const [lineIndex, list] of liveJudgeRef.current?.cents ?? []) centsByNote.set(lineIndex, median(list))
    setTake(
      summarizeTake({
        line: judgedLine,
        hits: new Set(judgedLine.flatMap((note, i) => (hits.has(note.index) ? [i] : []))),
        centsByNote,
        bars: scoreModel.bars ?? [],
      }),
    )
    liveJudgeRef.current = null
    setRecording(blob)
    setSamples(sung)
    setNotes(judged)
    setResult(scoreAttempt(sung, melody))
  }, [melody, mic, playback, scoreModel, overlay, judgedLine, gradeOnStaff])

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

  const dynamicsLine = useMemo(() => (result ? describeDynamics(summarizeDynamics(samples)) : null), [result, samples])

  // A scored take: the finish sound ("perfect" only for every note) and its stars, best kept per
  // song title — the key the song cards read (SongCardMeta) before a file is opened.
  const songKey = title
  useEffect(() => {
    if (!take) return
    if (take.ratio >= 1) sfx.perfect()
    else sfx.complete()
    recordStars(`song:${songKey}`, take.stars)
  }, [take, songKey])

  const live = mic.current
  const liveTarget = live ? findActiveNote(melody, live.time) : null
  const liveCents = live && liveTarget ? centsOff(live.midi, liveTarget.midi) : null
  const liveVerdict = liveCents === null ? 'rest' : classifyCents(liveCents)
  const listening = mic.status === 'listening'

  const actionButton = listening ? (
    <button type="button" className="record-panel__button record-panel__button--stop" onClick={finishAttempt}>
      ■ Stop
    </button>
  ) : (
    <button
      type="button"
      className="record-panel__button"
      disabled={!scoreModel || mic.status === 'requesting'}
      onClick={startAttempt}
      title="Plays the song and listens: you get a score at the end"
    >
      {mic.status === 'requesting' ? 'Starting mic…' : <><Mic size="1.1em" aria-hidden="true" /> Sing</>}
    </button>
  )
  // The pitch to start on, before singing: the first note of the part, held long enough to find.
  const firstNote = judgedLine[0] ?? null
  const startingNote = !listening && firstNote && (
    <button
      type="button"
      className="record-panel__first-note"
      onClick={() => tapNote(firstNote.midi, 1.2)}
      title={`Play your first note (${midiToNoteName(firstNote.midi)})`}
    >
      <Music size="1.1em" aria-hidden="true" /> <span className="record-panel__first-note-name">{midiToNoteName(firstNote.midi)}</span>
    </button>
  )
  const showRow = !actionSlot || listening || mic.status === 'error'
  const empty = !showRow && !result && !(session && supabase)

  return (
    <section className={`record-panel${empty ? ' record-panel--empty' : ''}`}>
      {actionSlot &&
        createPortal(
          <>
            {actionButton}
            {startingNote}
          </>,
          actionSlot,
        )}
      {showRow && (
        <div className="record-panel__row">
          {!actionSlot && actionButton}
          {!actionSlot && startingNote}
          {listening &&
            meterSlot &&
            createPortal(
              <PitchMeter
                hasTarget={Boolean(liveTarget)}
                targetName={liveTarget ? midiToNoteName(liveTarget.midi) : null}
                sungName={live?.noteName ?? null}
                cents={liveCents}
                verdict={liveVerdict}
              />,
              meterSlot,
            )}
          {listening && !meterSlot && (
            <span className={`record-panel__live record-panel__live--${liveVerdict}`} aria-live="polite">
              {live
                ? `${live.noteName}${liveTarget ? ` · target ${midiToNoteName(liveTarget.midi)} (${liveCents > 0 ? '+' : ''}${Math.round(liveCents)}¢)` : ' · rest'}`
                : 'listening…'}
            </span>
          )}
          {listening && <span className="record-panel__listening">Listening — sing along</span>}
          {listening && <DynamicsMeter dynamics={mic.dynamics} />}
          {mic.status === 'error' && <span className="record-panel__error">{mic.error}</span>}
        </div>
      )}

      {result && take && (
        <TakeSummary
          summary={take}
          accuracy={result.accuracy}
          octaveAccuracy={result.octaveAgnosticAccuracy ?? null}
          dynamicsLine={dynamicsLine}
          onLoop={(spot) => {
            playback.stop()
            playback.setLoop({ start: spot.time, end: spot.endTime ?? playback.duration, label: spot.label })
            playback.play()
          }}
        >
          {recording && (
            <button
              type="button"
              className="record-panel__link"
              onClick={() => downloadBlob(recording, `${safeFilename(title || 'attempt')}-attempt.webm`)}
            >
              <Download size="1.1em" aria-hidden="true" /> Recording
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
              setTake(null)
            }}
          >
            <Eraser size="1.1em" aria-hidden="true" /> Clear marks
          </button>
          <ShareAttempt
            auth={auth}
            supabase={supabase}
            song={shareSong}
            samples={samples}
            accuracy={result.accuracy}
            recording={recording}
            verdicts={notes?.verdicts ?? null}
            session={session}
          />
        </TakeSummary>
      )}
      {session && supabase && <SessionAttempts supabase={supabase} session={session} />}
    </section>
  )
}

export default RecordPanel
