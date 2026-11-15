import { useCallback, useState } from 'react'
import { sfx } from '../feedback/sfx.js'

const MILESTONES = new Set([3, 5, 10, 15, 20])

/**
 * Answer feedback for a quiz: `hit()` on a right answer, `miss()` on a wrong
 * one. Plays the sound, counts the run of right answers, and returns `combo`
 * (shown as "3 in a row!" at milestones) and `flash` ({ kind, key }) for a
 * pop or shake keyed so the animation replays.
 */
export function useCombo() {
  const [combo, setCombo] = useState(0)
  const [flash, setFlash] = useState(null)

  const hit = useCallback(() => {
    setCombo((n) => {
      const next = n + 1
      if (MILESTONES.has(next)) sfx.streak()
      else sfx.correct()
      return next
    })
    setFlash({ kind: 'good', key: Date.now() })
  }, [])

  const miss = useCallback(() => {
    sfx.wrong()
    setCombo(0)
    setFlash({ kind: 'bad', key: Date.now() })
  }, [])

  const reset = useCallback(() => {
    setCombo(0)
    setFlash(null)
  }, [])

  return { combo, milestone: MILESTONES.has(combo), flash, hit, miss, reset }
}
