import { Mic } from 'lucide-react'
import { useState } from 'react'
import './TransposeControl.css'
import { keyOptions, notesOutside, optionName } from '../transpose/keyFit.js'
import { useVoiceRange } from '../transpose/useVoiceRange.js'
import { VOICE_OPTIONS } from '../transpose/voiceRange.js'

const DISMISS_PREFIX = 'harmonic.keySuggestion.'

function dismissed(songId) {
  try {
    return globalThis.localStorage?.getItem(DISMISS_PREFIX + songId) === 'kept'
  } catch {
    return false
  }
}

/** "an Alto's range", "a Bass's range", or "your range" for a measured one. */
function whose(voice) {
  if (voice.measured?.use) return 'your range'
  const name = VOICE_OPTIONS.find((v) => v.id === voice.voiceId)?.name ?? 'your voice'
  return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}'s range`
}

/**
 * On the song screen, only when it helps: the singer's voice is known, the
 * song in its current key runs out of their range, and another key fits
 * better (keyFit.keyOptions). One line says so, with the move and a way to
 * keep the song as it is — remembered for that song, so it never nags.
 */
export default function KeySuggestion({ songId, notes, keyInfo, shift, onChange }) {
  const voice = useVoiceRange()
  const [kept, setKept] = useState(() => dismissed(songId))
  if (kept || !voice.range || !notes?.length) return null
  const now = notesOutside(notes, voice.range, shift)
  if (now.fits) return null
  const { recommended } = keyOptions(notes, voice.range, keyInfo)
  if (!recommended || recommended.shift === shift || !recommended.fits) return null

  const keep = () => {
    try {
      globalThis.localStorage?.setItem(DISMISS_PREFIX + songId, 'kept')
    } catch {
      // Blocked storage: hidden for this visit only.
    }
    setKept(true)
  }
  const where = now.above && now.below ? 'past both ends of' : now.above ? 'above' : 'below'
  return (
    <div className="key-suggestion" role="status">
      <span className="key-suggestion__icon" aria-hidden="true">
        <Mic size="1.1em" aria-hidden="true" />
      </span>
      <p className="key-suggestion__text">
        This goes {where} {whose(voice)}. <strong>{optionName(recommended.shift - shift)}</strong> (to {recommended.key})
        fits every note.
      </p>
      <div className="key-suggestion__actions">
        <button type="button" className="v-btn v-btn--sm" onClick={() => onChange(recommended.shift)}>
          Move it
        </button>
        <button type="button" className="key-suggestion__keep" onClick={keep}>
          Keep as is
        </button>
      </div>
    </div>
  )
}
