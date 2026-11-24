import { useEffect, useRef } from 'react'

export default function MicPrimer({ denied, onDecision }) {
  const dismiss = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    dismiss.current?.focus()
    const escape = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        event.stopPropagation()
        onDecision(false)
      }
    }
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('keydown', escape, true)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [onDecision])

  return (
    <section className="onboarding-card onboarding-mic" aria-labelledby="mic-primer-title">
      <h2 id="mic-primer-title">{denied ? 'Microphone blocked' : 'Use your microphone?'}</h2>
      <p>{denied
        ? 'Open the site controls next to the address bar, allow the microphone for Harmonic, then try again.'
        : 'Harmonic listens to give you feedback while you practise. Live audio never leaves this device.'}</p>
      <div className="onboarding-actions">
        {!denied && <button type="button" onClick={() => onDecision(true)}>Allow microphone</button>}
        <button ref={dismiss} type="button" onClick={() => onDecision(false)}>Not now</button>
      </div>
    </section>
  )
}
