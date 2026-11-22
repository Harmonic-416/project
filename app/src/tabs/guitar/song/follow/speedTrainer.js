import { TEMPO_MAX, TEMPO_STEP } from '../../../../audio/tempo/tempo.js'
import { createGuitarTroubleTracker, JUDGE_LAG_SECONDS } from './troubleTracker.js'

const CLEAN_REPEATS = 3
// The onsets carry their capture time, even when their analysis arrives later.
const SETTLEMENT_MS = JUDGE_LAG_SECONDS * 1000

/** One tracker per pass, so late mic windows cannot score the next repeat. */
export function createSpeedTrainer(entries, { start, end, tempo, onTempo, onProgress, onSettled }) {
  let streak = 0
  let current = null
  let pending = []
  let advance = false
  let passNumber = 0
  const shown = new Map()

  const progress = () => onProgress({ tempo, streak, target: CLEAN_REPEATS })
  const begin = (complete, startedAt = -Infinity) => {
    current = { tracker: createGuitarTroubleTracker(entries), tempo, complete, hits: 0, clean: true, number: ++passNumber, startedAt }
  }

  const settle = (pass, time) => {
    const results = pass.tracker.collect(time)
    for (const { verdict } of results) {
      if (verdict === 'hit') pass.hits++
      else if (verdict !== 'skipped') pass.clean = false
    }
    // Late results still belong on the tab unless a newer pass marked that note.
    const visible = results.filter(({ entry }) => (shown.get(entry.index) ?? 0) <= pass.number)
    for (const { entry } of visible) shown.set(entry.index, pass.number)
    if (visible.length) onSettled(visible)
  }

  const flush = (wall, latency) => {
    while (pending.length && wall >= pending[0].endedAt + SETTLEMENT_MS + Math.max(0, latency)) {
      const pass = pending.shift()
      settle(pass, Infinity)
      if (pass.tempo !== tempo || advance || tempo >= TEMPO_MAX) continue
      streak = pass.complete && pass.clean && pass.hits > 0 ? streak + 1 : 0
      advance = streak >= CLEAN_REPEATS
      progress()
    }
  }

  progress()
  return {
    begin,
    interrupt() {
      current = null
      pending = []
      streak = 0
      advance = false
      progress()
    },
    onset(wall, time, judge) {
      const ended = pending.find((pass) => wall < pass.endedAt)
      if (ended) {
        const previousTime = end + ((wall - ended.endedAt) / 1000) * ended.tempo / 100
        if (wall >= ended.startedAt && previousTime >= start) return ended.tracker.addOnset(previousTime, judge)
        return null
      }
      if (current && wall >= current.startedAt && time >= start && time < end) return current.tracker.addOnset(time, judge)
      return null
    },
    update(wall, time, latency) {
      flush(wall, latency)
      if (current && time !== null) settle(current, time - JUDGE_LAG_SECONDS)
    },
    boundary(wall, latency) {
      flush(wall, latency)
      if (current) pending.push({ ...current, endedAt: wall })
      if (advance) {
        tempo = Math.min(TEMPO_MAX, tempo + TEMPO_STEP)
        streak = 0
        advance = false
        onTempo(tempo)
        progress()
      }
      begin(true, wall)
    },
  }
}
