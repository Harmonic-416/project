import { useCallback, useEffect, useRef } from 'react'

/**
 * Draws pitch samples on top of the rendered sheet music.
 *
 * Geometry comes from OSMD itself: after render, the cursor is walked once
 * (visible, follow-scroll off) and each stop's on-screen box is recorded,
 * so x(t) interpolates between the same cursor stops playback uses, and the
 * cursor's top edge is the top staff line of that system. Pitch → y assumes
 * a treble clef (bottom line E4); one diatonic step is half a staff space.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'
const OSMD_UNIT_PX = 10
const STAFF_UNITS = 4
const DIATONIC_INDEX = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6]
const LINE_BREAK_NUDGE_PX = 28

function diatonicIndexInt(midi) {
  return Math.floor(midi / 12) * 7 + DIATONIC_INDEX[((midi % 12) + 12) % 12]
}

/** Fractional diatonic position (E4 = 37, F4 = 38 …), interpolating between semitones. */
export function diatonicIndex(midi) {
  const lo = Math.floor(midi)
  const frac = midi - lo
  return diatonicIndexInt(lo) + (diatonicIndexInt(lo + 1) - diatonicIndexInt(lo)) * frac
}

const E4_INDEX = diatonicIndex(64)

/** y in px of a pitch on a treble staff whose top line is at `top` and is `staffPx` tall. */
export function pitchToY(midi, top, staffPx) {
  return top + staffPx - (diatonicIndex(midi) - E4_INDEX) * (staffPx / 8)
}

/** x in px for a playback time, interpolated between recorded cursor stops. */
export function positionFor(steps, time) {
  if (!steps.length) return null
  let k = steps.length - 1
  for (let i = 0; i < steps.length; i += 1) {
    if (steps[i].time > time) {
      k = i - 1
      break
    }
  }
  if (k < 0) k = 0
  const a = steps[k]
  const b = steps[k + 1]
  let x = a.x
  if (b && b.time > a.time) {
    const t = Math.min(1, Math.max(0, (time - a.time) / (b.time - a.time)))
    x = b.top === a.top ? a.x + (b.x - a.x) * t : a.x + LINE_BREAK_NUDGE_PX * t
  }
  return { x, top: a.top }
}

function measureCursorSteps(osmd, container, cursorTimestamps) {
  const cursor = osmd.cursor
  const element = cursor.cursorElement
  const follow = osmd.FollowCursor
  const wasHidden = cursor.hidden
  osmd.FollowCursor = false
  cursor.show()
  cursor.reset()
  const containerRect = container.getBoundingClientRect()
  const originX = containerRect.left + container.clientLeft - container.scrollLeft
  const originY = containerRect.top + container.clientTop - container.scrollTop
  const steps = []
  for (let i = 0; i < cursorTimestamps.length && !cursor.iterator.EndReached; i += 1) {
    const rect = element.getBoundingClientRect()
    steps.push({ time: cursorTimestamps[i], x: rect.left - originX + rect.width / 2, top: rect.top - originY })
    cursor.next()
  }
  cursor.reset()
  if (wasHidden) cursor.hide()
  osmd.FollowCursor = follow
  return steps
}

export function useSheetOverlay(sheetMusicRef, scoreModel) {
  const geometryRef = useRef(null)

  useEffect(() => {
    const osmd = sheetMusicRef.current?.getOsmd?.()
    const container = sheetMusicRef.current?.getContainer?.()
    if (!osmd || !container || !scoreModel) return undefined

    const steps = measureCursorSteps(osmd, container, scoreModel.cursorTimestamps)
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('class', 'pitch-overlay')
    svg.setAttribute('width', String(container.scrollWidth))
    svg.setAttribute('height', String(container.scrollHeight))
    container.appendChild(svg)
    geometryRef.current = { svg, steps, staffPx: STAFF_UNITS * OSMD_UNIT_PX * (osmd.Zoom || 1) }

    return () => {
      svg.remove()
      geometryRef.current = null
    }
  }, [sheetMusicRef, scoreModel])

  /** Plot one sample; `verdict` picks the colour class (see pitchDetector.classifyCents). */
  const addSample = useCallback((sample, verdict = 'rest') => {
    const geometry = geometryRef.current
    if (!geometry) return
    const position = positionFor(geometry.steps, sample.time)
    if (!position) return
    const circle = document.createElementNS(SVG_NS, 'circle')
    circle.setAttribute('cx', position.x.toFixed(1))
    circle.setAttribute('cy', pitchToY(sample.midi, position.top, geometry.staffPx).toFixed(1))
    circle.setAttribute('r', '3')
    circle.setAttribute('class', `pitch-overlay__dot pitch-overlay__dot--${verdict}`)
    geometry.svg.appendChild(circle)
  }, [])

  const clear = useCallback(() => {
    geometryRef.current?.svg.replaceChildren()
  }, [])

  return { addSample, clear }
}
