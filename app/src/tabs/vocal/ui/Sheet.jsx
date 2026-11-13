import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './songScreen.css'

/**
 * A panel that slides up from the bottom over a dimmed page. Escape or the backdrop closes it.
 * It's rendered on <body> (so nothing on the page can clip it or cover it), inside a
 * .vocal-frame wrapper so it keeps the Vocal tab's theme; `accent` is the section.
 */
export default function Sheet({ open, title, onClose, accent = 'songs', children }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className={`vocal-frame vocal-frame--${accent} v-sheet`}>
      <div className="v-sheet__backdrop" onClick={onClose} aria-hidden="true" />
      <section
        className="v-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="v-sheet__head">
          <span className="v-sheet__grip" aria-hidden="true" />
          <h2 className="v-sheet__title">{title}</h2>
          <button type="button" className="v-btn v-btn--sm" onClick={onClose}>
            Done
          </button>
        </header>
        <div className="v-sheet__body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
