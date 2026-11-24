import { Flame, Volume2, VolumeX } from 'lucide-react'
import { useSfxMuted } from '../vocal/feedback/useSfx.js'
import './PracticeHeaderControls.css'
import HelpControl from '../../ui/onboarding/HelpControl.jsx'

export default function PracticeHeaderControls({ streak, practisedToday, startHint }) {
  const [muted, setMuted] = useSfxMuted()
  const SoundIcon = muted ? VolumeX : Volume2
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
        <span aria-hidden="true"><Flame size="1.1em" /></span>
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
        <SoundIcon size="1.1em" aria-hidden="true" />
      </button>
      <HelpControl />
    </>
  )
}
