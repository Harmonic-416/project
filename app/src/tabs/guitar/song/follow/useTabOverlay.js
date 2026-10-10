import { useCallback, useEffect, useMemo, useRef } from 'react'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PAD = 3

/** The smallest box around several alphaTab Bounds ({ x, y, w, h }). */
function unionOf(boxes) {
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  }
}

/**
 * Marks timeline entries (songTimeline.js) on the rendered tab and notation
 * — the Guitar equivalent of the Vocal tab's SheetMusicViewer.markNote.
 * alphaTab doesn't expose an element per note, and restyling notes
 * (NoteStyle) means a full re-render, far too slow for live feedback; so
 * marks are boxes on an SVG layer of our own, placed from alphaTab's
 * boundsLookup (needs core.includeNoteBounds, set in GuitarScore) and
 * redrawn after every render (resize, track change).
 *
 *   mark(index, state)  state: 'target' | 'hit' | 'close' | 'miss' | 'skipped' | null
 *   clear(state?)       one state everywhere, or every mark
 */
export function useTabOverlay(api, getHost, entries) {
  const marksRef = useRef(new Map()) // entry index → state
  const shapesRef = useRef(new Map()) // entry index → [rect]
  const layerRef = useRef(null)

  const layer = useCallback(() => {
    const host = getHost()
    if (!host) return null
    let svg = layerRef.current
    if (!svg || svg.parentNode !== host) {
      svg = document.createElementNS(SVG_NS, 'svg')
      svg.setAttribute('class', 'tab-overlay')
      host.appendChild(svg)
      layerRef.current = svg
    }
    const surface = host.querySelector('.at-surface')
    if (surface) {
      svg.style.left = `${surface.offsetLeft}px`
      svg.style.top = `${surface.offsetTop}px`
      svg.setAttribute('width', String(surface.offsetWidth))
      svg.setAttribute('height', String(surface.offsetHeight))
    }
    return svg
  }, [getHost])

  const draw = useCallback(
    (index) => {
      for (const shape of shapesRef.current.get(index) ?? []) shape.remove()
      shapesRef.current.delete(index)
      const state = marksRef.current.get(index)
      const entry = entries[index]
      const lookup = api?.boundsLookup
      const svg = state && entry && lookup ? layer() : null
      if (!svg) return
      const shapes = []
      for (const beat of entry.beats) {
        for (const bounds of lookup.findBeats(beat) ?? []) {
          // One box per staff around the note heads (a chord's stacked heads share one).
          const heads = bounds.notes?.length ? bounds.notes.map((n) => n.noteHeadBounds) : [bounds.visualBounds]
          const boxes = [unionOf(heads)]
          for (const box of boxes) {
            const rect = document.createElementNS(SVG_NS, 'rect')
            rect.setAttribute('x', (box.x - PAD).toFixed(1))
            rect.setAttribute('y', (box.y - PAD).toFixed(1))
            rect.setAttribute('width', (box.w + PAD * 2).toFixed(1))
            rect.setAttribute('height', (box.h + PAD * 2).toFixed(1))
            rect.setAttribute('rx', '3')
            rect.setAttribute('class', `tab-overlay__mark tab-overlay__mark--${state}`)
            svg.appendChild(rect)
            shapes.push(rect)
          }
        }
      }
      shapesRef.current.set(index, shapes)
    },
    [api, entries, layer],
  )

  const redrawAll = useCallback(() => {
    for (const shapes of shapesRef.current.values()) shapes.forEach((shape) => shape.remove())
    shapesRef.current.clear()
    for (const index of marksRef.current.keys()) draw(index)
  }, [draw])

  useEffect(() => {
    if (!api) return undefined
    const off = api.postRenderFinished.on(redrawAll)
    redrawAll()
    return off
  }, [api, redrawAll])

  // Marks belong to one song and track's entries.
  useEffect(
    () => () => {
      marksRef.current.clear()
      for (const shapes of shapesRef.current.values()) shapes.forEach((shape) => shape.remove())
      shapesRef.current.clear()
    },
    [entries],
  )

  const mark = useCallback(
    (index, state) => {
      if (marksRef.current.get(index) === (state ?? undefined)) return
      if (state) marksRef.current.set(index, state)
      else marksRef.current.delete(index)
      draw(index)
    },
    [draw],
  )

  const clear = useCallback(
    (state) => {
      for (const [index, current] of [...marksRef.current]) {
        if (state && current !== state) continue
        marksRef.current.delete(index)
        draw(index)
      }
    },
    [draw],
  )

  return useMemo(() => ({ mark, clear }), [mark, clear])
}
