import { useMemo, useState } from 'react'
import './PracticeModes.css'
import './TransposeControl.css'
import RangeCapture from './RangeCapture.jsx'
import RangeStrip from './RangeStrip.jsx'
import {
  MAX_SHIFT,
  MIN_SHIFT,
  describeOption,
  keyOptions,
  noteLabel,
  optionName,
  transposeFifths,
  transposeLabel,
} from '../transpose/keyFit.js'
import { COMFORTABLE_RANGES, VOICE_OPTIONS } from '../transpose/voiceRange.js'
import { useVoiceRange } from '../transpose/useVoiceRange.js'

const span = (r) => `${noteLabel(r.low)}–${noteLabel(r.high)}`

export function TransposeSteps({ shift, onChange, label, disabled, min = MIN_SHIFT, max = MAX_SHIFT, reset = false }) {
  return (
    <div className="practice-modes__options" role="group" aria-label="Fine-tune the key">
      <button type="button" className="practice-modes__option" aria-label="Down a semitone"
        disabled={disabled || shift <= min} onClick={() => onChange(shift - 1)}>−</button>
      <output className="practice-modes__option transpose__now" aria-live="polite">{label}</output>
      <button type="button" className="practice-modes__option" aria-label="Up a semitone"
        disabled={disabled || shift >= max} onClick={() => onChange(shift + 1)}>+</button>
      {reset && shift !== 0 && <button type="button" className="practice-modes__option" disabled={disabled}
        onClick={() => onChange(0)}>As written</button>}
    </div>
  )
}

/**
 * The song's key, in the song settings. The singer picks their voice (or
 * the range they've sung for us, RangeCapture); a strip shows that range
 * against the song's notes, and the keys worth trying are listed as choices
 * (keyFit.keyOptions): as written, the smallest move that fits, the same key
 * an octave away, the middle of the range — the suggested one marked, and a
 * song that already fits never moved. −/+ fine-tunes a semitone at a time.
 * `notes`: the practised part as written ({ midi, duration }); `keyInfo`: the
 * written key; `onChange(shift)` moves the whole song.
 */
export default function TransposeControl({ shift, onChange, notes, keyInfo, disabled }) {
  const voice = useVoiceRange()
  const [capturing, setCapturing] = useState(false)
  const { options, recommended } = useMemo(
    () => (voice.range && notes?.length ? keyOptions(notes, voice.range, keyInfo) : { options: [], recommended: null }),
    [notes, voice.range, keyInfo],
  )
  const lowest = notes?.length ? Math.min(...notes.map((n) => n.midi)) : null
  const highest = notes?.length ? Math.max(...notes.map((n) => n.midi)) : null
  const usingMine = Boolean(voice.measured?.use)

  return (
    <div className="key-fit">
      <div className="key-fit__voices" role="group" aria-label="Your voice">
        {VOICE_OPTIONS.map((v) => (
          <button
            key={v.id}
            type="button"
            className="practice-modes__option"
            aria-pressed={!usingMine && voice.voiceId === v.id}
            title={span(COMFORTABLE_RANGES[v.id])}
            onClick={() => voice.chooseVoice(v.id)}
          >
            {v.name}
          </button>
        ))}
        {voice.measured && (
          <button type="button" className="practice-modes__option" aria-pressed={usingMine} onClick={voice.useMyRange}>
            My range
          </button>
        )}
      </div>

      {voice.range && lowest !== null ? (
        <>
          <RangeStrip
            range={voice.range}
            low={lowest + shift}
            high={highest + shift}
            fifths={transposeFifths(keyInfo?.fifths ?? 0, shift)}
          />
          <div className="key-fit__options" role="radiogroup" aria-label="Key">
            {options.map((option) => (
              <button
                key={option.shift}
                type="button"
                role="radio"
                aria-checked={option.shift === shift}
                className={`key-fit__option key-fit__option--${option.fits ? 'fits' : 'out'}`}
                disabled={disabled}
                onClick={() => onChange(option.shift)}
              >
                <span className="key-fit__name">
                  {optionName(option.shift)} <span className="key-fit__key">· {option.key}</span>
                </span>
                <span className="key-fit__why">{describeOption(option)}</span>
                {option === recommended && <span className="key-fit__badge">Suggested</span>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="practice-modes__hint">Pick your voice to see which key fits it.</p>
      )}

      <div className="key-fit__fine">
        <TransposeSteps shift={shift} onChange={onChange} label={transposeLabel(shift, keyInfo)} disabled={disabled} />
        {!capturing && (
          <button type="button" className="key-fit__link" onClick={() => setCapturing(true)}>
            {voice.measured ? 'Measure my range again' : 'Measure my range'}
          </button>
        )}
      </div>
      {capturing && (
        <RangeCapture
          onSave={(captured) => {
            voice.saveCapture(captured)
            setCapturing(false)
          }}
          onCancel={() => setCapturing(false)}
        />
      )}
    </div>
  )
}
