import GuitarModeFeedback from './GuitarModeFeedback.jsx'
import * as alphaTab from '@coderline/alphatab'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PlaybackControls from './GuitarPlaybackControls.jsx'
import ShareAttempt from '../../../vocal/components/ShareAttempt.jsx'
import { downloadBlob, safeFilename } from '../../../vocal/notation/exportNotation.js'
import LatencyCalibration from './LatencyCalibration.jsx'
import { matchTranscription, toSongNotes } from './matchTranscription.js'
import { isFullRun } from './runHistory.js'
import { troubleTiming } from './recordingTiming.js'
import { clearLoop, loopTicks, seekToTick } from './playerControls.js'
import { songVerdicts } from './songSection.js'
import { judgeWindow } from './noteJudge.js'
import { isScored, secondsToTicks, ticksToSeconds } from './songTimeline.js'
import { createGuitarTroubleTracker, JUDGE_LAG_SECONDS, troubleSummary } from './troubleTracker.js'
import { useGuitarListener } from './useGuitarListener.js'
import { useTuningReport } from '../../tuner/tuningReport.js'
import RunReview from './RunReview.jsx'
import HearingHelp from './HearingHelp.jsx'
import { CLIPPING_HELP } from './inputQuality.js'
import { finishedOnsetTime } from './songClock.js'
import { createSpeedTrainer } from './speedTrainer.js'
import { clampTempo, TEMPO_MAX } from '../../../../audio/tempo/tempo.js'
import SongTransportExtras from './SongTransportExtras.jsx'

// Stopping this close to the end counts as finishing, so the last notes still get a verdict.
const END_SLACK_SECONDS = 0.5
const ANCHOR_INTERVAL_MS = 40

/**
 * "Trouble spots" on a guitar song: the Vocal tab's mode (vocal/components/
 * TroubleSpotsPlayer) for picks and strums. Playback never waits; every
 * note the mic hears is placed on the song clock (songClock.js, minus the
 * calibrated latency), matched to its timeline entry and judged
 * (troubleTracker.js, noteJudge.js). Notes are boxed green / amber / red as
 * playback passes them; playing a passage again clears its old marks, and
 * a looped passage re-judges in place.
 *
 * Your own part never plays while you're judged (modes.applyMix). The run
 * is recorded: download it, have basic-pitch check it note by note
 * afterwards (refineWithBasicPitch.js, matchTranscription.js), or share it
 * as a link — the verdict on every note, never the song (`shareSong` names
 * it; see vocal/components/ShareAttempt). The run's clock anchors go with
 * it as timing (recordingTiming.troubleTiming), so the person it's shared
 * with sees the cursor follow the recording.
 *
 * While signed in, every finished run is saved privately into the song's
 * practice session (`session`, usePracticeSession), and the re-check
 * corrects the saved run (change: guitar-run-history, F22). `onSaved`
 * hears about it, so the song's last and best score can update.
 */
function GuitarTroubleMode({
  api,
  transportHost,
  feedbackHost,
  onTransportStart,
  score,
  timeline,
  overlay,
  player,
  clock,
  latencyMs,
  onLatencyChange,
  restoreMix,
  title,
  auth,
  supabase,
  shareSong,
  session = null,
  easy = false,
  onSaved = null,
  onRunActiveChange,
  speed = 1,
  setTrainingTempo,
  stopTrainingRef,
  onPassageLoopChange,
  onClearPassage,
}) {
  const { entries, tempoMap, duration } = timeline
  const [verdicts, setVerdicts] = useState([]) // per entry index
  const verdictsRef = useRef([])
  const evidenceRef = useRef([])
  const trackerRef = useRef(null)
  const generationRef = useRef(0)
  const runRef = useRef(null) // { from, lastTime, anchors, lastAnchorWall, speed, recordingStartWall }
  const latencyRef = useRef(latencyMs)
  const reportTuning = useTuningReport()
  const [runFrom, setRunFrom] = useState(null)
  const [summary, setSummary] = useState(null) // { from, to, finished, recording, anchors, recordingStartWall, speed, timing }
  const [finishing, setFinishing] = useState(false)
  const finishTimer = useRef(null)
  const [refine, setRefine] = useState({ status: 'idle', progress: 0, error: null })
  const [loop, setLoop] = useState(null) // { bar }
  const [calibrating, setCalibrating] = useState(false)
  const trainerRef = useRef(null)
  const [training, setTraining] = useState(null)
  const [loopRange, setLoopRange] = useState(null)

  useEffect(() => {
    latencyRef.current = latencyMs
  }, [latencyMs])

  const setVerdict = useCallback(
    (index, verdict, result = null) => {
      verdictsRef.current[index] = verdict
      evidenceRef.current[index] = result
      overlay.mark(index, verdict ?? null)
    },
    [overlay],
  )
  const publish = useCallback(() => setVerdicts([...verdictsRef.current]), [])

  const settle = useCallback(
    (settled) => {
      if (!settled.length) return
      for (const { entry, verdict, result } of settled) setVerdict(entry.index, verdict, result)
      publish()
    },
    [publish, setVerdict],
  )

  const handleWindow = useCallback(
    (w) => {
      const tracker = trackerRef.current
      const run = runRef.current
      if (!run || (!run.finish && !clock.playing)) return
      const wall = w.wall - latencyRef.current
      const time = run.finish
        ? finishedOnsetTime(run.finish, w.wall, latencyRef.current, run.speed)
        : clock.secondsAt(wall)
      if (time === null) return
      const judge = (entry) => judgeWindow(w, entry)
      const active = trainerRef.current
      const judged = active ? active.trainer.onset(wall, time, judge) : tracker?.addOnset(time, judge)
      if (judged?.result.verdict === 'hit') reportTuning(judged.result.cents) // single notes carry cents
      if (import.meta.env.DEV) {
        // For tuning against real playing: every judgement, in the console's window.__harmonic.
        const harmonic = (window.__harmonic ??= {})
        ;(harmonic.guitarJudgements ??= []).push({ mode: 'trouble', time, source: w.source, entry: judged?.entry.index ?? null, ...judged?.result })
      }
    },
    [clock, reportTuning],
  )

  const listener = useGuitarListener({ onWindow: handleWindow, record: true })
  const listening = listener.status === 'listening'
  const playing = player.state === 'playing'
  const runActive = listener.status === 'requesting' || (runFrom !== null && !summary)
  useEffect(() => { onRunActiveChange?.(runActive) }, [onRunActiveChange, runActive])
  useEffect(() => () => { onRunActiveChange?.(false) }, [onRunActiveChange])

  /** A fresh judging pass from `from` (song seconds). */
  const newPass = useCallback(
    (from) => {
      const tracker = createGuitarTroubleTracker(entries)
      tracker.skipTo(from)
      trackerRef.current = tracker
      if (runRef.current) runRef.current.lastTime = from
    },
    [entries],
  )

  const stopTraining = useCallback((resumeScoring = true) => {
    if (!trainerRef.current) return
    trainerRef.current = null
    setTraining(null)
    if (resumeScoring && runRef.current && api) newPass(ticksToSeconds(tempoMap, api.tickPosition))
    setTrainingTempo?.(null)
  }, [api, newPass, setTrainingTempo, tempoMap])

  useEffect(() => {
    if (!stopTrainingRef) return undefined
    stopTrainingRef.current = stopTraining
    return () => {
      stopTrainingRef.current = null
      if (trainerRef.current) {
        trainerRef.current = null
        setTrainingTempo?.(null)
      }
    }
  }, [stopTraining, stopTrainingRef, setTrainingTempo])

  const readLoop = useCallback(() => {
    const range = api?.isLooping ? api.playbackRange : null
    setLoopRange(range ? { startTick: range.startTick, endTick: range.endTick } : null)
    const active = trainerRef.current
    if (active && (!range || range.startTick !== active.startTick || range.endTick !== active.endTick)) stopTraining()
  }, [api, stopTraining])

  useEffect(() => {
    if (!api) return undefined
    readLoop()
    return api.playbackRangeChanged?.on(readLoop)
  }, [api, readLoop])

  const loopEntries = useMemo(() => loopRange
    ? entries.filter(({ tick }) => tick >= loopRange.startTick && tick < loopRange.endTick)
    : [], [entries, loopRange])
  const canTrain = loopEntries.some(isScored)
  const toggleTraining = () => {
    if (trainerRef.current) {
      stopTraining()
      return
    }
    if (!canTrain || !loopRange) return
    const { startTick, endTick } = loopRange
    const tempo = clampTempo(api.playbackSpeed * 100)
    const trainer = createSpeedTrainer(loopEntries, {
      start: ticksToSeconds(tempoMap, startTick),
      end: ticksToSeconds(tempoMap, endTick),
      tempo,
      onTempo: setTrainingTempo,
      onProgress: setTraining,
      onSettled: settle,
    })
    trainerRef.current = { trainer, startTick, endTick, wrapping: false }
    trackerRef.current = null
    if (runRef.current) runRef.current.historyEligible = false
    setTrainingTempo(tempo)
    if (playing) trainer.begin(false)
  }

  /** A new run from `from`: playing a passage again clears its old marks. */
  const startRun = useCallback(
    (from) => {
      generationRef.current += 1
      for (const entry of entries) {
        if (entry.time >= from - 0.2 && verdictsRef.current[entry.index]) setVerdict(entry.index, undefined)
      }
      publish()
      runRef.current = {
        from,
        historyEligible: timeline.startTick == null && !api.isLooping && !api.playbackRange,
        lastTime: from,
        anchors: [],
        lastAnchorWall: 0,
        speed: api.playbackSpeed,
        recordingStartWall: listener.getRecordingStartWall(),
      }
      newPass(from)
      setRunFrom(from)
      setSummary(null)
      setRefine({ status: 'idle', progress: 0, error: null })
    },
    [api, entries, listener, newPass, publish, setVerdict, timeline.startTick],
  )

  // Clock anchors for the run, to place the recording's notes afterwards.
  useEffect(() => {
    if (!api) return undefined
    const stopPosition = api.playerPositionChanged.on((e) => {
      const active = trainerRef.current
      if (active && api.playerState === alphaTab.synth.PlayerState.Playing) {
        if (e.isSeek && !(active.wrapping && Math.abs(e.currentTick - active.startTick) <= 1)) {
          active.trainer.interrupt()
          active.trainer.begin(false)
        }
        if (!e.isSeek) active.wrapping = false
      }
      const run = runRef.current
      if (!run || run.finish || api.playerState !== alphaTab.synth.PlayerState.Playing) return
      if ((e.isSeek && run.anchors.length > 0) || api.isLooping || api.playbackRange) run.historyEligible = false
      const now = performance.now()
      if (!e.isSeek && now - run.lastAnchorWall < ANCHOR_INTERVAL_MS) return
      run.lastAnchorWall = now
      run.anchors.push({ wall: now, seconds: ticksToSeconds(tempoMap, e.currentTick) })
    })
    const stopFinished = api.playerFinished?.on(() => {
      const run = runRef.current
      const active = trainerRef.current
      if (run && active && api.isLooping) {
        active.wrapping = true
        active.trainer.boundary(performance.now(), latencyRef.current)
        return
      }
      if (!run || run.finish || api.isLooping) return
      const range = api.playbackRange
      const seconds = range ? ticksToSeconds(tempoMap, range.endTick) : duration
      run.finish = { wall: performance.now(), seconds }
      run.anchors.push(run.finish)
    })
    return () => {
      stopPosition()
      stopFinished?.()
    }
  }, [api, tempoMap, duration])

  // Judge notes as playback passes them; a loop's jump back starts a new pass.
  useEffect(() => {
    if (!playing) return undefined
    let raf
    const tick = () => {
      const run = runRef.current
      const tracker = trackerRef.current
      const active = trainerRef.current
      const time = run && !run.finish && (tracker || active) ? clock.secondsAt(performance.now() - latencyRef.current) : null
      if (time !== null) {
        if (active) {
          run.lastTime = time
          active.trainer.update(performance.now(), time, latencyRef.current)
        } else if (timeline.startTick == null && time < run.lastTime - 0.5) {
          run.historyEligible = false
          settle(tracker.collect(run.lastTime + 0.25))
          newPass(time)
        } else {
          run.lastTime = Math.max(run.lastTime, time)
          settle(tracker.collect(time - JUDGE_LAG_SECONDS))
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, clock, newPass, settle, timeline.startTick])

  // End of the song (or Stop): judge what's left if we got to the end, then release the mic.
  const { stop: stopListening } = listener
  const prevStateRef = useRef(player.state)
  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = player.state
    if (player.state === 'paused' && prev === 'playing') trainerRef.current?.trainer.interrupt()
    if (player.state !== 'stopped' || prev === 'stopped' || !runRef.current) return
    stopTraining(false)
    const run = runRef.current
    const range = api?.playbackRange
    const end = range ? ticksToSeconds(tempoMap, range.endTick) : duration
    const finished = Boolean(run.finish) || run.lastTime >= end - END_SLACK_SECONDS
    const generation = generationRef.current
    const finish = async () => {
      finishTimer.current = null
      if (generation !== generationRef.current) return
      const tracker = trackerRef.current
      runRef.current = null
      trackerRef.current = null
      if (finished && tracker) settle(tracker.collect(end + 1))
      const recording = await stopListening()
      if (generation !== generationRef.current) return
      setFinishing(false)
      setSummary({
        historyEligible: run.historyEligible,
        from: run.from,
        to: finished ? end : run.lastTime,
        finished,
        recording,
        anchors: run.anchors,
        recordingStartWall: run.recordingStartWall,
        speed: run.speed,
        timing: recording
          ? troubleTiming(run.anchors, { recordingStartWall: run.recordingStartWall, latencyMs: latencyRef.current })
          : null,
      })
    }
    if (run.finish) {
      setFinishing(true)
      finishTimer.current = setTimeout(finish, JUDGE_LAG_SECONDS * 1000 + Math.max(0, latencyRef.current))
    } else {
      void finish()
    }
  }, [api, duration, player.state, settle, stopListening, stopTraining, tempoMap])

  // Leaving the mode takes the marks off the score and the loop off the player.
  useEffect(
    () => () => {
      generationRef.current += 1
      clearTimeout(finishTimer.current)
      finishTimer.current = null
      overlay.clear()
      api?.stop()
    },
    [api, overlay],
  )

  const play = async () => {
    if (finishTimer.current !== null) return
    if (!(await listener.start())) return
    let tick = api.tickPosition
    if (timeline.startTick != null) {
      if (tick < timeline.startTick || tick >= timeline.endTick) seekToTick(api, timeline.startTick)
      // The synth can report one tick past the range start after resetting.
      tick = tick <= timeline.startTick + 1 || tick >= timeline.endTick ? timeline.startTick : tick
    }
    if (!runRef.current) startRun(ticksToSeconds(tempoMap, tick))
    const active = trainerRef.current
    if (active) {
      trackerRef.current = null
      if (tick < active.startTick || tick >= active.endTick) {
        tick = active.startTick
        seekToTick(api, tick)
      }
      const fromStart = Math.abs(tick - active.startTick) <= 1
      // The count-in can report a seek to the start before the first played tick.
      active.wrapping = fromStart
      active.trainer.begin(fromStart)
    }
    api.play()
  }

  const seek = (time) => {
    trainerRef.current?.trainer.interrupt()
    if (runRef.current) runRef.current.historyEligible = false
    seekToTick(api, secondsToTicks(tempoMap, time))
    if (runRef.current && !trainerRef.current) newPass(time)
  }

  const counts = useMemo(() => {
    if (runFrom === null) return null
    const to = summary?.to ?? Infinity
    return troubleSummary(entries.filter((e) => e.time >= runFrom - 1e-6 && e.time <= to + 1e-6).map((e) => verdicts[e.index]))
  }, [entries, runFrom, summary, verdicts])

  // What a share carries: the run's verdicts, one per timeline entry (null outside the run).
  const sharedVerdicts = useMemo(() => {
    if (!summary) return null
    return entries.map((e) => (e.time >= summary.from - 1e-6 && e.time <= summary.to + 1e-6 ? verdicts[e.index] ?? null : null))
  }, [entries, summary, verdicts])

  const firstMiss = useMemo(() => {
    if (!summary) return null
    return entries.find((e) => e.time >= summary.from - 1e-6 && e.time <= summary.to + 1e-6 && verdicts[e.index] === 'miss') ?? null
  }, [entries, summary, verdicts])

  const highlightWeak = useCallback(() => {
    if (!summary) return
    overlay.clear()
    for (const entry of entries) {
      const verdict = verdicts[entry.index]
      if (entry.time >= summary.from && entry.time <= summary.to && (verdict === 'miss' || verdict === 'close')) overlay.mark(entry.index, verdict)
    }
  }, [summary, entries, verdicts, overlay])
  useEffect(() => {
    if (!summary || playing || !api?.beatMouseDown) return undefined
    return api.beatMouseDown.on(highlightWeak)
  }, [api, summary, playing, highlightWeak])

  const loopSpot = () => {
    const length = firstMiss.barEndTick - firstMiss.barStartTick
    loopTicks(api, Math.max(0, firstMiss.barStartTick - length), firstMiss.barEndTick) // a bar of run-up
    readLoop()
    setLoop({ bar: firstMiss.bar + 1 })
  }

  const stopLooping = () => {
    clearLoop(api)
    readLoop()
    setLoop(null)
  }

  const clearMarks = () => {
    generationRef.current += 1
    overlay.clear()
    verdictsRef.current = []
    evidenceRef.current = []
    publish()
    setRunFrom(null)
    setSummary(null)
  }

  const checkRun = async () => {
    if (!summary?.recording) return
    const generation = generationRef.current
    setRefine({ status: 'running', progress: 0, error: null })
    try {
      const { transcribeRecording } = await import('./refineWithBasicPitch.js')
      const notes = await transcribeRecording(summary.recording, {
        onProgress: (progress) => { if (generation === generationRef.current) setRefine((r) => ({ ...r, progress })) },
      })
      if (generation !== generationRef.current) return
      const songNotes = toSongNotes(notes, {
        anchors: summary.anchors,
        recordingStartWall: summary.recordingStartWall,
        latencyMs: latencyRef.current,
        speed: summary.speed,
      })
      matchTranscription(entries, songNotes, { from: summary.from, to: summary.to }).forEach((verdict, index) => {
        if (verdict) setVerdict(index, verdict)
      })
      publish()
      setRefine({ status: 'done', progress: 1, error: null })
    } catch (err) {
      if (generation !== generationRef.current) return
      console.error(err)
      setRefine({ status: 'error', progress: 0, error: 'The detailed check couldn’t run on this device.' })
    }
  }

  const ready = player.ready

  return (
    <>
      <PlaybackControls
        transportHost={transportHost}
        onTransportStart={onTransportStart}
        state={player.state}
        position={ticksToSeconds(tempoMap, player.tick)}
        duration={duration}
        startTime={timeline.startTime}
        rate={speed}
        onPlay={play}
        onPause={() => api.pause()}
        onStop={() => {
          stopTraining(false)
          api.stop()
        }}
        onSeek={seek}
        disabled={!ready || listener.status === 'requesting' || calibrating || finishing}
      />
      {(timeline.startTick == null || onClearPassage) && <SongTransportExtras api={api} disabled={!ready || playing}
        onLoopChange={() => { readLoop(); onPassageLoopChange?.() }} onClear={onClearPassage} />}
      {(canTrain || training) && setTrainingTempo && (
        <div className="song-extras">
          <label className="song-extras__item">
            <input type="checkbox" checked={Boolean(training)} onChange={toggleTraining} disabled={!ready} />
            Speed trainer
          </label>
          {training && <span role="status">
            {training.tempo}% · {training.tempo === TEMPO_MAX ? 'Maximum tempo' : `${training.streak} of ${training.target} clean repeats`}
          </span>}
        </div>
      )}
      <GuitarModeFeedback host={feedbackHost}><div className="practice-status" aria-live="polite">
        {finishing && <span>Checking the last notes…</span>}
        {listening && playing ? (
          <span className="practice-status__live">
            {listener.clipping ? CLIPPING_HELP : listener.quiet ? 'Couldn’t hear you — play a little louder' : listener.live ? `you: ${listener.live.noteName}` : 'listening…'}
          </span>
        ) : (
          !counts && <span>Play along in time. Headphones help — otherwise the mic also hears the music.</span>
        )}
        {counts && counts.scored > 0 && (
          <strong>
            {summary && !summary.finished ? 'So far: ' : ''}Hit {counts.hit} of {counts.scored}
            {counts.close ? ` · ${counts.close} close` : ''}
            {counts.missed ? ` · ${counts.missed} missed` : ''}
          </strong>
        )}
        {!playing && summary && <button type="button" className="practice-status__link" onClick={highlightWeak}>Highlight weak spots</button>}
        {!playing && timeline.startTick == null && firstMiss && !loop && (
          <button type="button" className="practice-status__link" onClick={loopSpot}>
            Loop bar {firstMiss.bar + 1}
          </button>
        )}
        {loop && (
          <button type="button" className="practice-status__link" onClick={stopLooping}>
            Stop looping bar {loop.bar}
          </button>
        )}
        {!playing && summary?.recording && (
          <button
            type="button"
            className="practice-status__link"
            onClick={() => downloadBlob(summary.recording, `${safeFilename(title || 'attempt')}-attempt.webm`)}
          >
            Download recording ({Math.round(summary.recording.size / 1024)} KB)
          </button>
        )}
        {!playing && summary?.recording && refine.status !== 'running' && refine.status !== 'done' && (
          <button type="button" className="practice-status__link" onClick={checkRun}>
            Check my run more accurately
          </button>
        )}
        {refine.status === 'running' && <span>Checking note by note… {Math.round(refine.progress * 100)}%</span>}
        {refine.status === 'done' && <span>Checked note by note.</span>}
        {refine.error && <span className="practice-status__error">{refine.error}</span>}
        {!playing && !finishing && verdicts.some(Boolean) && (
          <button type="button" className="practice-status__link" onClick={clearMarks}>
            Clear marks
          </button>
        )}
        {!playing && !calibrating && !finishing && (
          <button type="button" className="practice-status__link" onClick={() => setCalibrating(true)}>
            {latencyMs ? `Latency ${latencyMs} ms · recalibrate` : 'Calibrate latency'}
          </button>
        )}
        {listener.status === 'error' && <span className="practice-status__error">{listener.error}</span>}
      </div></GuitarModeFeedback>
      {listener.quiet && listening && playing && <HearingHelp />}
      {!playing && summary && <RunReview entries={entries} verdicts={sharedVerdicts ?? []} evidence={evidenceRef.current} mode="trouble" onSelect={(entry) => seek(entry.time)} />}
      {!playing && summary && counts?.scored > 0 && auth && (
        <ShareAttempt
          auth={auth}
          supabase={supabase}
          song={shareSong}
          accuracy={(counts.hit / counts.scored) * 100}
          recording={summary.recording}
          timing={summary.timing}
          instrument="guitar"
          recordingChoice
          verdicts={songVerdicts(timeline, sharedVerdicts)}
          session={session}
          mode="trouble"
          easy={easy}
          fullRun={summary.finished && summary.historyEligible && isFullRun(entries, sharedVerdicts)}
          onSaved={onSaved}
        />
      )}
      {calibrating && (
        <LatencyCalibration
          api={api}
          score={score}
          restoreMix={restoreMix}
          onDone={(ms) => {
            onLatencyChange(ms)
            setCalibrating(false)
          }}
          onCancel={() => setCalibrating(false)}
        />
      )}
    </>
  )
}

export default GuitarTroubleMode
