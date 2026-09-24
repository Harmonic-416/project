import './Tuner.css'
import { STANDARD_TUNING } from './tuner.js'
import { useTuner } from './useTuner.js'

const NEEDLE_RANGE_CENTS = 50

function describeCents(cents, inTune) {
  if (inTune) return 'In tune'
  const rounded = Math.round(cents)
  if (rounded === 0) return 'Almost there'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}¢ ${rounded > 0 ? 'sharp — tune down' : 'flat — tune up'}`
}

/** Sound-check tuner (F39): standard tuning, auto string detection, tap a string to lock it. */
function Tuner() {
  const tuner = useTuner()
  const { reading, status } = tuner
  const listening = status === 'listening'
  const clamped = reading ? Math.max(-NEEDLE_RANGE_CENTS, Math.min(NEEDLE_RANGE_CENTS, reading.cents)) : 0
  const needleLeft = `${50 + (clamped / NEEDLE_RANGE_CENTS) * 50}%`
  const tone = !reading ? 'idle' : reading.inTune ? 'in-tune' : Math.abs(reading.cents) <= 15 ? 'close' : 'off'

  return (
    <section className="tuner">
      <header className="tuner__header">
        <h2>Tuner</h2>
        <p>Standard tuning · tune each string before you play</p>
      </header>

      <div className="tuner__strings" role="group" aria-label="Strings (tap to lock one)">
        {STANDARD_TUNING.map((string) => {
          const active = reading?.string.id === string.id
          const locked = tuner.lockedId === string.id
          const done = tuner.tuned.has(string.id)
          return (
            <button
              key={string.id}
              type="button"
              className={[
                'tuner__string',
                active && 'tuner__string--active',
                locked && 'tuner__string--locked',
                done && 'tuner__string--done',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={locked}
              title={`String ${string.stringNumber} (${string.id}) — ${locked ? 'tap to unlock' : 'tap to lock'}`}
              onClick={() => tuner.setLockedId(locked ? null : string.id)}
            >
              <span className="tuner__string-label">{string.label}</span>
              <span className="tuner__string-sub">{done ? '✓' : string.stringNumber}</span>
            </button>
          )
        })}
      </div>
      <p className="tuner__mode">{tuner.lockedId ? `Locked to ${tuner.lockedId}` : 'Auto — play any string'}</p>

      <div className={`tuner__meter tuner__meter--${tone}`} aria-hidden="true">
        <div className="tuner__scale">
          <span>−50</span>
          <span>0</span>
          <span>+50</span>
        </div>
        <div className="tuner__track">
          <div className="tuner__center" />
          {reading && <div className="tuner__needle" style={{ left: needleLeft }} />}
        </div>
      </div>

      <div className={`tuner__readout tuner__readout--${tone}`} aria-live="polite">
        {listening && reading && (
          <>
            <span className="tuner__note">{reading.string.id}</span>
            <span className="tuner__cents">{describeCents(reading.cents, reading.inTune)}</span>
          </>
        )}
        {listening && !reading && <span className="tuner__hint">Play a string</span>}
        {status === 'idle' && <span className="tuner__hint">Tap Start and allow the microphone</span>}
        {status === 'requesting' && <span className="tuner__hint">Starting microphone…</span>}
        {status === 'error' && <span className="tuner__error">{tuner.error}</span>}
      </div>

      {listening ? (
        <button type="button" className="tuner__button tuner__button--stop" onClick={tuner.stop}>
          Stop
        </button>
      ) : (
        <button type="button" className="tuner__button" disabled={status === 'requesting'} onClick={tuner.start}>
          Start
        </button>
      )}
    </section>
  )
}

export default Tuner
