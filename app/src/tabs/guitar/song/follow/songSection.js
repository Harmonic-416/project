import { ticksToSeconds } from './songTimeline.js'

/** Prefer a complete pass through the selected bars without playing outside them. */
export function sectionTimeline(timeline, section) {
  if (!timeline || !section) return timeline
  let range = null
  let first = null
  for (const bar of timeline.bars) {
    if (bar.index < section.first || bar.index > section.last) {
      first = null
      continue
    }
    if (bar.index === section.first) first = bar
    if (!first) continue
    if (bar.index === section.last || !range || bar.index > range.last) {
      range = { startTick: first.start, endTick: bar.end, last: bar.index }
    }
    if (bar.index === section.last) break
  }
  if (!range) return null
  const { startTick, endTick } = range

  return {
    ...timeline,
    startTick,
    endTick,
    startTime: ticksToSeconds(timeline.tempoMap, startTick),
    duration: ticksToSeconds(timeline.tempoMap, endTick),
    fullEntryCount: timeline.entries.length,
    entries: timeline.entries
      .filter((entry) => entry.tick >= startTick && entry.tick < endTick)
      .map((entry, index) => ({ ...entry, index, songIndex: entry.index })),
  }
}

/** Shared attempts still use the whole song's positions for their verdicts. */
export function songVerdicts(timeline, verdicts) {
  if (timeline.fullEntryCount == null) return verdicts
  const full = Array(timeline.fullEntryCount).fill(null)
  timeline.entries.forEach((entry) => { full[entry.songIndex] = verdicts[entry.index] ?? null })
  return full
}
