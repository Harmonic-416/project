import { useEffect, useRef } from 'react'

export default function Welcome({ onChoice, onDismiss }) {
  const dialog = useRef(null)
  useEffect(() => {
    const node = dialog.current
    node.showModal()
    return () => node.close()
  }, [])

  return (
    <dialog ref={dialog} className="onboarding-card onboarding-welcome" aria-labelledby="welcome-title"
      onCancel={(event) => { event.preventDefault(); onDismiss() }}>
      <div className="onboarding-heading">
        <h2 id="welcome-title">Welcome to Harmonic</h2>
        <button type="button" aria-label="Close welcome" onClick={onDismiss}>×</button>
      </div>
      <ul>
        <li><strong>Home</strong> — Pick up where you left off.</li>
        <li><strong>Guitar</strong> — Tune, learn chords, and play songs.</li>
        <li><strong>Vocal</strong> — Warm up, train your voice, and sing songs.</li>
        <li><strong>Social</strong> — Connect with friends and share runs.</li>
      </ul>
      <p>What do you want to practise?</p>
      <div className="onboarding-actions">
        <button type="button" onClick={() => onChoice('guitar')}>Guitar</button>
        <button type="button" onClick={() => onChoice('vocal')}>Voice</button>
        <button type="button" onClick={() => onChoice('home')}>Just look around</button>
      </div>
    </dialog>
  )
}
