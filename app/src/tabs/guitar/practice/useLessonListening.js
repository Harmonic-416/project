import { useCallback, useEffect, useRef, useState } from 'react'
import { useGuitarListener } from '../song/follow/useGuitarListener.js'
import { ABOVE_FLOOR_DB, createWaitAttempts, MAX_DECAY_DB } from '../song/follow/waitListening.js'
import { lessonEntry, toLessonVerdict } from './lessonVerdicts.js'
import { guitarCoaching } from '../song/follow/guitarCoaching.js'

/**
 * Microphone → lesson results for `chord`, entirely on the device: the
 * song listener (useGuitarListener) with Wait for me's rules
 * (waitListening.js). `onVerdict` gets { verdict, strings, extra } for every
 * strum judged — 'verified' or 'wrong' — and { verdict: 'silent' } when it
 * has been too quiet for a while before anything was heard for this chord
 * (F21). `chord` can change while listening (Play moves on by itself).
 * muteFor(ms) stops the app hearing its own Hint; restart() forgets the
 * strum in progress (Retry).
 */
export function useLessonListening({ chord, stringIndex = null, onVerdict, onDiagnostic }) {
  const [attempts] = useState(() => createWaitAttempts())
  const entryRef = useRef(lessonEntry(chord, stringIndex))
  const onVerdictRef = useRef(onVerdict)
  const onDiagnosticRef = useRef(onDiagnostic)
  const heardRef = useRef(false) // a verdict for this chord already: later quiet isn't "couldn't hear you"

  useEffect(() => {
    onVerdictRef.current = onVerdict
    onDiagnosticRef.current = onDiagnostic
  }, [onVerdict, onDiagnostic])

  const handleWindow = useCallback(
    (w) => {
      const { actions, log } = attempts.consider(w, entryRef.current)
      if (import.meta.env.DEV) {
        // For tuning against real playing: every window and what was decided, in the console's window.__harmonic.
        const harmonic = (window.__harmonic ??= {})
        ;(harmonic.guitarJudgements ??= []).push({ mode: 'lesson', source: w.source, ...log })
      }
      for (const action of actions) {
        heardRef.current = true
        onVerdictRef.current?.({ ...toLessonVerdict(action.result), advice: guitarCoaching(action.result, entryRef.current) })
      }
      if (!actions.length) {
        if (log.decision === 'ignored: still ringing') {
          onDiagnosticRef.current?.('The expected pitches were heard, but the attack was too similar to the sound already ringing. Let the strings settle briefly, then strum again.')
        } else if (log.decision === 'ignored: not a note') {
          const advice = log.decayDb < -MAX_DECAY_DB
            ? 'The sound died away quickly. Keep holding the shape after you strum, then pick the strings one at a time to check whether any are muted.'
            : log.aboveFloorDb < ABOVE_FLOOR_DB
              ? 'The strum was close to the background noise level. Move a little closer to the mic and try one even strum.'
              : 'The mic picked up a sound, but the pitches were unclear. Try one even strum in a quiet room and let it ring.'
          onDiagnosticRef.current?.(advice)
        }
      }
    },
    [attempts],
  )

  const listener = useGuitarListener({ onWindow: handleWindow })
  const { status, quiet, muteFor: muteListener } = listener

  useEffect(() => {
    entryRef.current = lessonEntry(chord, stringIndex)
    attempts.reset()
    heardRef.current = false
    muteListener(80)
  }, [attempts, chord, stringIndex, muteListener])

  useEffect(() => {
    if (status === 'listening' && quiet && !heardRef.current) onVerdictRef.current?.({ verdict: 'silent', strings: null, extra: [] })
  }, [quiet, status])

  const muteFor = useCallback(
    (ms) => {
      attempts.reset()
      muteListener(ms)
    },
    [attempts, muteListener],
  )

  const restart = useCallback(() => {
    attempts.reset()
    heardRef.current = false
  }, [attempts])

  useEffect(() => {
    if (status === 'idle') restart()
  }, [status, restart])

  return { status, error: listener.error, clipping: listener.clipping, start: listener.start, stop: listener.stop, muteFor, restart }
}
