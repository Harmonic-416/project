import { useCallback, useEffect, useRef, useState } from 'react'
import { useGuitarListener } from '../song/follow/useGuitarListener.js'
import { createWaitAttempts } from '../song/follow/waitListening.js'
import { lessonEntry, toLessonVerdict } from './lessonVerdicts.js'

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
export function useLessonListening({ chord, onVerdict }) {
  const [attempts] = useState(() => createWaitAttempts())
  const entryRef = useRef(lessonEntry(chord))
  const onVerdictRef = useRef(onVerdict)
  const heardRef = useRef(false) // a verdict for this chord already: later quiet isn't "couldn't hear you"

  useEffect(() => {
    onVerdictRef.current = onVerdict
  }, [onVerdict])

  useEffect(() => {
    entryRef.current = lessonEntry(chord)
    attempts.reset()
    heardRef.current = false
  }, [attempts, chord])

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
        onVerdictRef.current?.(toLessonVerdict(action.result))
      }
    },
    [attempts],
  )

  const listener = useGuitarListener({ onWindow: handleWindow })
  const { status, quiet, muteFor: muteListener } = listener

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

  return { status, error: listener.error, start: listener.start, stop: listener.stop, muteFor, restart }
}
