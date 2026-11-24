import { useRef, useState } from 'react'
import { useOnboarding } from './useOnboarding.js'

export default function HelpControl() {
  const guide = useOnboarding()
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  if (!guide) return null
  const close = () => { setOpen(false); trigger.current?.focus() }
  return (
    <div className="onboarding-help" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }} onKeyDown={(event) => {
      if (open && event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }}>
      <button ref={trigger} type="button" className="practice-header__sound" aria-label="Practice help"
        aria-expanded={open} onClick={() => {
          guide.markActive()
          if (!open) guide.showCurrentTip()
          setOpen(!open)
        }}>
        ?
        {guide.stuck && <span className="onboarding-dot" aria-hidden="true" />}
      </button>
      <span className="onboarding-announcement" role="status">{guide.stuck ? 'Practice help is available.' : ''}</span>
      {open && (
        <div className="onboarding-card onboarding-help-panel" aria-label="Practice help">
          <button type="button" disabled={!guide.current || guide.guidancePaused}
            onClick={() => { guide.showCurrentTip(); close() }}>This screen’s tip</button>
          <button type="button" disabled={guide.guidancePaused}
            onClick={() => { close(); guide.replayWelcome() }}>Replay welcome</button>
          <button type="button" onClick={() => { guide.reset(); close() }}>Reset tips</button>
        </div>
      )}
    </div>
  )
}
