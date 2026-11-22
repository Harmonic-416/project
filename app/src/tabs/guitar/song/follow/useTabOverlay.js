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
export function useTabOverlay(api, getHost, entries, highlightedBar = null, lastHighlightedBar = highlightedBar) {
  const marksRef = useRef(new Map()) // mark key → { index, state }
  const shapesRef = useRef(new Map()) // mark key → SVG shapes
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

  useEffect(() => {
    if (!api || highlightedBar === null) return undefined
    let highlights = []
    const clearHighlights = () => highlights.forEach((highlight) => highlight.remove())
    const drawBars = () => {
      clearHighlights()
      highlights = []
      const svg = layer()
      if (!svg) return
      for (let bar = highlightedBar; bar <= lastHighlightedBar; bar++) {
        const bounds = api.boundsLookup?.findMasterBarByIndex(bar)?.realBounds
        if (!bounds) continue
        const highlight = document.createElementNS(SVG_NS, 'rect')
        highlight.setAttribute('class', 'tab-overlay__measure')
        highlight.setAttribute('x', String(bounds.x))
        highlight.setAttribute('y', String(bounds.y))
        highlight.setAttribute('width', String(bounds.w))
        highlight.setAttribute('height', String(bounds.h))
        svg.prepend(highlight)
        highlights.push(highlight)
      }
    }
    const off = api.postRenderFinished.on(drawBars)
    drawBars()
    return () => {
      off()
      clearHighlights()
    }
  }, [api, highlightedBar, lastHighlightedBar, layer])

  const draw = useCallback(
    (key) => {
      for (const shape of shapesRef.current.get(key) ?? []) shape.remove()
      shapesRef.current.delete(key)
      const mark = marksRef.current.get(key)
      const entry = mark && entries[mark.index]
      const lookup = api?.boundsLookup
      const svg = entry && lookup ? layer() : null
      if (!svg) return
      const shapes = []
      for (const beat of entry.beats) {
        for (const bounds of lookup.findBeats(beat) ?? []) {
          // One box per staff around the note heads (a chord's stacked heads share one).
          const heads = bounds.notes?.length ? bounds.notes.map((n) => n.noteHeadBounds) : [bounds.visualBounds]
          const boxes = [unionOf(heads)]
          for (const box of boxes) {
            if (mark.state === 'comment') {
              const pin = document.createElementNS(SVG_NS, 'circle')
              pin.setAttribute('cx', String(box.x + box.w + PAD))
              pin.setAttribute('cy', String(box.y - PAD))
              pin.setAttribute('r', '4')
              pin.setAttribute('class', 'tab-overlay__comment')
              svg.appendChild(pin)
              shapes.push(pin)
              continue
            }
            const rect = document.createElementNS(SVG_NS, 'rect')
            rect.setAttribute('x', (box.x - PAD).toFixed(1))
            rect.setAttribute('y', (box.y - PAD).toFixed(1))
            rect.setAttribute('width', (box.w + PAD * 2).toFixed(1))
            rect.setAttribute('height', (box.h + PAD * 2).toFixed(1))
            rect.setAttribute('rx', '3')
            rect.setAttribute('class', `tab-overlay__mark tab-overlay__mark--${mark.state}`)
            svg.appendChild(rect)
            shapes.push(rect)
          }
        }
      }
      shapesRef.current.set(key, shapes)
    },
    [api, entries, layer],
  )

  const redrawAll = useCallback(() => {
    for (const shapes of shapesRef.current.values()) shapes.forEach((shape) => shape.remove())
    shapesRef.current.clear()
    for (const key of marksRef.current.keys()) draw(key)
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
    (index, state, key = index) => {
      if (marksRef.current.get(key)?.state === (state ?? undefined)) return
      if (state) marksRef.current.set(key, { index, state })
      else marksRef.current.delete(key)
      draw(key)
    },
    [draw],
  )

  const clear = useCallback(
    (state) => {
      for (const [key, current] of [...marksRef.current]) {
        if (state && current.state !== state) continue
        marksRef.current.delete(key)
        draw(key)
      }
    },
    [draw],
  )

  const markComment = useCallback((index) => mark(index, 'comment', `comment:${index}`), [mark])

  return useMemo(() => ({ mark, clear, markComment }), [mark, clear, markComment])
}
