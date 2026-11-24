import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOnboarding, useTip } from './useOnboarding.js'
import { TIPS } from './tips.js'

const overlaps = (a, b) => a.left < b.right && a.right > b.left
  && a.top < b.bottom && a.bottom > b.top

function Tip({ anchor, id, onClose, replaying }) {
  const note = useRef(null)
  const [placement, setPlacement] = useState({})
  const dockHost = document.getElementById('onboarding-tip-dock')
  const { title, body } = TIPS[id]

  useLayoutEffect(() => {
    const node = note.current
    // The note keeps one host so changing placement does not remount its controls.
    const measure = () => {
      const rect = anchor.getBoundingClientRect()
      const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
      const content = anchor.closest('.content')?.getBoundingClientRect() ?? viewport
      const tokens = getComputedStyle(document.documentElement)
      const dock = tokens.getPropertyValue('--onboarding-dock').trim() === '1'
      const dockHeight = dockHost?.offsetHeight ?? 0
      const visible = { left: content.left, top: content.top, right: content.right, bottom: content.bottom + dockHeight }
      if (!overlaps(rect, visible)) {
        setPlacement(replaying ? {} : { hidden: true })
        return
      }
      if (dock) {
        setPlacement({})
        return
      }
      const nearby = Array.from(document.querySelectorAll(
        'button, a[href], input, select, textarea, summary, [role="button"], [tabindex="0"]',
      )).filter((control) => !node.contains(control))
        .map((control) => control.getBoundingClientRect())
      const { width, height } = node.getBoundingClientRect()
      const gap = parseFloat(tokens.getPropertyValue('--onboarding-gap'))
      const left = Math.max(gap, Math.min(rect.left, viewport.right - width - gap))
      const sideTop = Math.max(gap, Math.min(rect.top, viewport.bottom - height - gap))
      const candidates = [
        [rect.right + gap, sideTop],
        [rect.left - width - gap, sideTop],
        [left, rect.bottom + gap],
        [left, rect.top - height - gap],
      ]
      const fit = candidates.find(([x, y]) => {
        const box = { left: x, top: y, right: x + width, bottom: y + height }
        return x >= gap && y >= gap && box.right <= viewport.right - gap
          && box.bottom <= viewport.bottom - gap && !nearby.some((control) => overlaps(box, control))
      })
      setPlacement(fit ? { style: { position: 'fixed', left: fit[0], top: fit[1] } } : {})
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(anchor)
    observer?.observe(node)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const escape = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open]')) {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', escape)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      document.removeEventListener('keydown', escape)
    }
  }, [anchor, dockHost, onClose, replaying])

  const card = (
    <aside ref={note} style={placement.style} hidden={placement.hidden} className="onboarding-card onboarding-tip"
      role="note" aria-live="polite" aria-labelledby="onboarding-tip-title">
      <div className="onboarding-heading">
        <h2 id="onboarding-tip-title">{title}</h2>
        <button type="button" aria-label="Close tip" onClick={onClose}>×</button>
      </div>
      <p>{body}</p>
      <button type="button" onClick={onClose}>Got it</button>
    </aside>
  )
  return dockHost ? createPortal(card, dockHost) : card
}

export default function TipAnchor({ id, ready, visit, children }) {
  const anchorRef = useRef(null)
  const instance = useId()
  const { tip, closeTip, replayingTip } = useOnboarding() ?? {}
  useTip(id, { anchorRef, ready, visit, instance })
  return (
    <>
      <div ref={anchorRef}>{children}</div>
      {tip?.instance === instance
        && <Tip anchor={tip.anchor} id={id} onClose={closeTip} replaying={replayingTip} />}
    </>
  )
}
