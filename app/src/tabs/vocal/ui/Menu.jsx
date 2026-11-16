import { useEffect, useRef } from 'react'
import './songScreen.css'

/** A "⋯" button that opens a small menu of `children`; clicking outside or an item closes it. */
export default function Menu({ label = 'More', children }) {
  const ref = useRef(null)
  useEffect(() => {
    const close = (event) => {
      if (ref.current?.open && !ref.current.contains(event.target)) ref.current.open = false
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return (
    <details className="v-menu" ref={ref}>
      <summary className="v-menu__button" aria-label={label} title={label}>
        ⋯
      </summary>
      <div
        className="v-menu__list"
        onClick={(event) => {
          if (event.target.closest('button') && ref.current) ref.current.open = false
        }}
      >
        {children}
      </div>
    </details>
  )
}
