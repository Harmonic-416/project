import { useSfxMuted } from '../vocal/feedback/useSfx.js'
import './PracticeHeaderControls.css'

export default function PracticeHeaderControls({ streak, practisedToday, startHint }) {
  const [muted, setMuted] = useSfxMuted()
  const streakTitle = streak === 0
    ? startHint
    : `${streak}-day streak${practisedToday ? '' : ': practise today to keep it'}`

  return (
    <>
      <span
        className={`practice-header__streak${practisedToday ? ' practice-header__streak--lit' : ''}`}
        title={streakTitle}
        role="status"
        aria-label={`${streak}-day practice streak`}
      >
        <span aria-hidden="true">🔥</span>
        {streak}
      </span>
      <button
        type="button"
        className="practice-header__sound"
        aria-pressed={!muted}
        aria-label={muted ? 'Turn sound effects on' : 'Turn sound effects off'}
        title={muted ? 'Sound effects off' : 'Sound effects on'}
        onClick={() => setMuted(!muted)}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </>
  )
}
