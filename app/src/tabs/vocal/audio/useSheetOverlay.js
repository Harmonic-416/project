import { useCallback, useEffect, useRef } from 'react'

/**
 * Draws pitch samples on top of the rendered sheet music.
 *
 * Geometry comes from OSMD itself: after render, the cursor is walked once
 * (visible, follow-scroll off) and each stop's on-screen box is recorded,
 * so x(t) interpolates between the same cursor stops playback uses, and the
 * cursor's top edge is the top staff line of that system. Pitch → y reads
 * the clef of the top staff (the singer's part) at each stop, so bass and
 * treble-8 parts — every TTBB arrangement — plot at the right height; one
 * diatonic step is half a staff space.
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

// Each clef sign names the pitch on its line: G4 for G, F3 for F, C4 for C (OSMD's ClefEnum 0, 1, 2).
const CLEF_REFERENCE = { 0: diatonicIndex(67), 1: diatonicIndex(53), 2: diatonicIndex(60) }

/**
 * Diatonic index of a staff's bottom line for an OSMD ClefInstruction
 * ({ ClefType, Line, OctaveOffset }; Line counts from the bottom, 1–5).
 * Treble → E4, bass → G2, treble-8 → E3, alto → F3. Anything else
 * (percussion, tab, missing) falls back to treble.
 */
export function bottomLineIndex(clef) {
  const reference = clef ? CLEF_REFERENCE[clef.ClefType] : undefined
  if (reference === undefined) return E4_INDEX
  return reference - 2 * ((clef.Line ?? 2) - 1) + 7 * (clef.OctaveOffset ?? 0)
}

/** y in px of a pitch on a staff whose top line is at `top`, `staffPx` tall, bottom line at `bottom` (diatonic index). */
export function pitchToY(midi, top, staffPx, bottom = E4_INDEX) {
  return top + staffPx - (diatonicIndex(midi) - bottom) * (staffPx / 8)
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
  return { x, top: a.top, bottom: a.bottom }
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
  const measures = osmd.GraphicSheet?.MeasureList ?? []
  for (let i = 0; i < cursorTimestamps.length && !cursor.iterator.EndReached; i += 1) {
    const rect = element.getBoundingClientRect()
    const clef = measures[cursor.iterator.CurrentMeasureIndex]?.[0]?.InitiallyActiveClef
    steps.push({
      time: cursorTimestamps[i],
      x: rect.left - originX + rect.width / 2,
      top: rect.top - originY,
      bottom: bottomLineIndex(clef),
    })
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
    circle.setAttribute('cy', pitchToY(sample.midi, position.top, geometry.staffPx, position.bottom).toFixed(1))
    circle.setAttribute('r', '3')
    circle.setAttribute('class', `pitch-overlay__dot pitch-overlay__dot--${verdict}`)
    geometry.svg.appendChild(circle)
  }, [])

  /**
   * A grade badge above a note that has gone by (pitchReading.gradeNote):
   * a coloured disc with ✓ / ↑ / ↓, so the verdict reads by shape as well as colour.
   */
  const addBadge = useCallback((note, grade) => {
    const geometry = geometryRef.current
    if (!geometry) return
    const position = positionFor(geometry.steps, note.time)
    if (!position) return
    const y = pitchToY(note.midi, position.top, geometry.staffPx, position.bottom) - geometry.staffPx * 0.45
    const group = document.createElementNS(SVG_NS, 'g')
    group.setAttribute('class', `pitch-badge pitch-badge--${grade.tier}`)
    group.setAttribute('transform', `translate(${position.x.toFixed(1)} ${y.toFixed(1)})`)
    const title = document.createElementNS(SVG_NS, 'title')
    title.textContent = grade.label
    const disc = document.createElementNS(SVG_NS, 'circle')
    disc.setAttribute('r', '7')
    const text = document.createElementNS(SVG_NS, 'text')
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'central')
    text.textContent = grade.glyph
    // Position on the outer group, animation on the inner one: a CSS transform would replace the translate.
    const pop = document.createElementNS(SVG_NS, 'g')
    pop.setAttribute('class', 'pitch-badge__pop')
    pop.append(title, disc, text)
    group.append(pop)
    geometry.svg.appendChild(group)
  }, [])

  const clearBadges = useCallback(() => {
    geometryRef.current?.svg.querySelectorAll('.pitch-badge').forEach((badge) => badge.remove())
  }, [])

  const clear = useCallback(() => {
    geometryRef.current?.svg.replaceChildren()
  }, [])

  return { addSample, addBadge, clearBadges, clear }
}
