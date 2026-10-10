import * as alphaTab from '@coderline/alphatab'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PlaybackControls from '../../../vocal/components/PlaybackControls.jsx'
import ShareAttempt from '../../../vocal/components/ShareAttempt.jsx'
import { downloadBlob, safeFilename } from '../../../vocal/notation/exportNotation.js'
import LatencyCalibration from './LatencyCalibration.jsx'
import { matchTranscription, toSongNotes } from './matchTranscription.js'
import { clearLoop, loopTicks, seekToTick } from './playerControls.js'
import { judgeWindow } from './noteJudge.js'
import { secondsToTicks, ticksToSeconds } from './songTimeline.js'
import { createGuitarTroubleTracker, troubleSummary } from './troubleTracker.js'
import { useGuitarListener } from './useGuitarListener.js'

// A listening window closes ~0.3 s after its onset; settle a note only once its verdict can have arrived.
const JUDGE_LAG_SECONDS = 0.45
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
 * it; see vocal/components/ShareAttempt).
 */
function GuitarTroubleMode({
  api,
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
  speed = 1,
}) {
  const { entries, tempoMap, duration } = timeline
  const [verdicts, setVerdicts] = useState([]) // per entry index
  const verdictsRef = useRef([])
  const trackerRef = useRef(null)
  const runRef = useRef(null) // { from, lastTime, anchors, lastAnchorWall, speed, recordingStartWall }
  const latencyRef = useRef(latencyMs)
  const [runFrom, setRunFrom] = useState(null)
  const [summary, setSummary] = useState(null) // { from, to, finished, recording, anchors, recordingStartWall, speed }
  const [refine, setRefine] = useState({ status: 'idle', progress: 0, error: null })
  const [loop, setLoop] = useState(null) // { bar }
  const [calibrating, setCalibrating] = useState(false)

  useEffect(() => {
    latencyRef.current = latencyMs
  }, [latencyMs])

  const setVerdict = useCallback(
    (index, verdict) => {
      verdictsRef.current[index] = verdict
      overlay.mark(index, verdict ?? null)
    },
    [overlay],
  )
  const publish = useCallback(() => setVerdicts([...verdictsRef.current]), [])

  const settle = useCallback(
    (settled) => {
      if (!settled.length) return
      for (const { entry, verdict } of settled) setVerdict(entry.index, verdict)
      publish()
    },
    [publish, setVerdict],
  )

  const handleWindow = useCallback(
    (w) => {
      const tracker = trackerRef.current
      if (!tracker || !clock.playing) return // paused: nothing to play along with
      const time = clock.secondsAt(w.wall - latencyRef.current)
      if (time === null) return
      const judged = tracker.addOnset(time, (entry) => judgeWindow(w, entry))
      if (import.meta.env.DEV) {
        // For tuning against real playing: every judgement, in the console's window.__harmonic.
        const harmonic = (window.__harmonic ??= {})
        ;(harmonic.guitarJudgements ??= []).push({ mode: 'trouble', time, source: w.source, entry: judged?.entry.index ?? null, ...judged?.result })
      }
    },
    [clock],
  )

  const listener = useGuitarListener({ onWindow: handleWindow, record: true })
  const listening = listener.status === 'listening'
  const playing = player.state === 'playing'

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

  /** A new run from `from`: playing a passage again clears its old marks. */
  const startRun = useCallback(
    (from) => {
      for (const entry of entries) {
        if (entry.time >= from - 0.2 && verdictsRef.current[entry.index]) setVerdict(entry.index, undefined)
      }
      publish()
      runRef.current = {
        from,
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
    [api, entries, listener, newPass, publish, setVerdict],
  )

  // Clock anchors for the run, to place the recording's notes afterwards.
  useEffect(() => {
    if (!api) return undefined
    return api.playerPositionChanged.on((e) => {
      const run = runRef.current
      if (!run || api.playerState !== alphaTab.synth.PlayerState.Playing) return
      const now = performance.now()
      if (!e.isSeek && now - run.lastAnchorWall < ANCHOR_INTERVAL_MS) return
      run.lastAnchorWall = now
      run.anchors.push({ wall: now, seconds: ticksToSeconds(tempoMap, e.currentTick) })
    })
  }, [api, tempoMap])

  // Judge notes as playback passes them; a loop's jump back starts a new pass.
  useEffect(() => {
    if (!playing) return undefined
    let raf
    const tick = () => {
      const run = runRef.current
      const tracker = trackerRef.current
      const time = run && tracker ? clock.secondsAt(performance.now() - latencyRef.current) : null
      if (time !== null) {
        if (time < run.lastTime - 0.5) {
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
  }, [playing, clock, newPass, settle])

  // End of the song (or Stop): judge what's left if we got to the end, then release the mic.
  const { stop: stopListening } = listener
  const prevStateRef = useRef(player.state)
  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = player.state
    if (player.state !== 'stopped' || prev === 'stopped' || !runRef.current) return
    const run = runRef.current
    const tracker = trackerRef.current
    runRef.current = null
    trackerRef.current = null
    const range = api?.playbackRange
    const end = range ? ticksToSeconds(tempoMap, range.endTick) : duration
    const finished = run.lastTime >= end - END_SLACK_SECONDS
    if (finished && tracker) settle(tracker.collect(end + 1))
    stopListening().then((recording) => {
      setSummary({
        from: run.from,
        to: finished ? end : run.lastTime,
        finished,
        recording,
        anchors: run.anchors,
        recordingStartWall: run.recordingStartWall,
        speed: run.speed,
      })
    })
  }, [api, duration, player.state, settle, stopListening, tempoMap])

  // Leaving the mode takes the marks off the score and the loop off the player.
  useEffect(
    () => () => {
      overlay.clear()
      api?.stop()
    },
    [api, overlay],
  )

  const play = async () => {
    if (!(await listener.start())) return
    if (!runRef.current) startRun(ticksToSeconds(tempoMap, api.tickPosition))
    api.play()
  }

  const seek = (time) => {
    seekToTick(api, secondsToTicks(tempoMap, time))
    if (runRef.current) newPass(time)
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

  const loopSpot = () => {
    const length = firstMiss.barEndTick - firstMiss.barStartTick
    loopTicks(api, Math.max(0, firstMiss.barStartTick - length), firstMiss.barEndTick) // a bar of run-up
    setLoop({ bar: firstMiss.bar + 1 })
  }

  const stopLooping = () => {
    clearLoop(api)
    setLoop(null)
  }

  const clearMarks = () => {
    overlay.clear()
    verdictsRef.current = []
    publish()
    setRunFrom(null)
    setSummary(null)
  }

  const checkRun = async () => {
    if (!summary?.recording) return
    setRefine({ status: 'running', progress: 0, error: null })
    try {
      const { transcribeRecording } = await import('./refineWithBasicPitch.js')
      const notes = await transcribeRecording(summary.recording, {
        onProgress: (progress) => setRefine((r) => ({ ...r, progress })),
      })
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
      console.error(err)
      setRefine({ status: 'error', progress: 0, error: 'The detailed check couldn’t run on this device.' })
    }
  }

  const ready = player.ready

  return (
    <>
      <PlaybackControls
        state={player.state}
        position={ticksToSeconds(tempoMap, player.tick)}
        duration={duration}
        rate={speed}
        onPlay={play}
        onPause={() => api.pause()}
        onStop={() => api.stop()}
        onSeek={seek}
        disabled={!ready || listener.status === 'requesting' || calibrating}
      />
      <div className="practice-status" aria-live="polite">
        {listening && playing ? (
          <span className="practice-status__live">
            {listener.quiet ? 'Couldn’t hear you — play a little louder' : listener.live ? `you: ${listener.live.noteName}` : 'listening…'}
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
        {!playing && firstMiss && !loop && (
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
        {!playing && verdicts.some(Boolean) && (
          <button type="button" className="practice-status__link" onClick={clearMarks}>
            Clear marks
          </button>
        )}
        {!playing && !calibrating && (
          <button type="button" className="practice-status__link" onClick={() => setCalibrating(true)}>
            {latencyMs ? `Latency ${latencyMs} ms · recalibrate` : 'Calibrate latency'}
          </button>
        )}
        {listener.status === 'error' && <span className="practice-status__error">{listener.error}</span>}
      </div>
      {!playing && summary && counts?.scored > 0 && auth && (
        <ShareAttempt
          auth={auth}
          supabase={supabase}
          song={shareSong}
          accuracy={(counts.hit / counts.scored) * 100}
          recording={summary.recording}
          instrument="guitar"
          verdicts={sharedVerdicts}
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
