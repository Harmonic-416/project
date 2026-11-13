/** Follow bar transitions on alphaTab's existing cursor clock, never a timer. */
export function createBarScrollHandler(follow) {
  let previous = null
  return {
    onBeatCursorUpdating(beat) {
      const bar = beat?.barBounds?.masterBarBounds
      if (!bar || bar.index === previous) return
      previous = bar.index
      follow(bar)
    },
    forceScrollTo(beat) {
      const bar = beat?.barBounds?.masterBarBounds
      if (!bar) return
      previous = bar.index
      follow(bar)
    },
    dispose() { previous = null },
  }
}
