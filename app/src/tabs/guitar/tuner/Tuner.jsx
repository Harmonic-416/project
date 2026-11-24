import TipAnchor from '../../../ui/onboarding/Tip.jsx'
import { useOnboardingBusy, usePracticeOnboarding } from '../../../ui/onboarding/useOnboarding.js'
import { useState } from 'react'
import './Tuner.css'
import Fretboard from '../fretboard/Fretboard.jsx'
import { STANDARD_TUNING } from './tuner.js'
import { useTuner } from './useTuner.js'

// The dial shows ±50 cents across ±60° of arc.
const RANGE_CENTS = 50
const SWEEP_DEG = 60
const TICKS = Array.from({ length: 21 }, (_, i) => -50 + i * 5)

// Pegs on a 3+3 headstock, top to bottom: the low strings on the left with
// low E nearest the nut, the high strings on the right with high e nearest it.
const LEFT_PEGS = [2, 1, 0] // D3 A2 E2 (indexes into STANDARD_TUNING)
const RIGHT_PEGS = [3, 4, 5] // G3 B3 E4

const tone = (reading) =>
  !reading ? 'idle' : reading.inTune ? 'in-tune' : Math.abs(reading.cents) <= 15 ? 'close' : 'off'

function advice(reading) {
  if (reading.inTune) return 'In tune'
  return reading.cents > 0 ? 'Tune down' : 'Tune up'
}

/**
 * Sound-check tuner (F39): a dial with a needle (±50 cents), the note and
 * its pitch in Hz, and a headstock whose string buttons light up for the
 * string being heard; tap one to lock onto it. The listening itself is
 * useTuner / tuner.js. The fretboard map (every note on the neck) opens
 * underneath, so it doesn't need its own tab.
 */
function Tuner() {
  const tuner = useTuner()
  const { reading, status } = tuner
  const listening = status === 'listening'
  const { startWithMicrophone } = usePracticeOnboarding()
  useOnboardingBusy(listening || status === 'requesting')
  const start = async () => {
    if (!startWithMicrophone || await startWithMicrophone()) tuner.start()
  }
  const state = tone(reading)
  const clamped = reading ? Math.max(-RANGE_CENTS, Math.min(RANGE_CENTS, reading.cents)) : 0
  const angle = (clamped / RANGE_CENTS) * SWEEP_DEG
  const [noteName, octave] = reading ? [reading.string.label, reading.string.id.replace(/\D/g, '')] : ['–', '']

  const stringButton = (index) => {
    const string = STANDARD_TUNING[index]
    const active = reading?.string.id === string.id
    const locked = tuner.lockedId === string.id
    const done = tuner.tuned.has(string.id)
    return (
      <button
        key={string.id}
        type="button"
        className={[
          'tuner__peg-button',
          active && 'tuner__peg-button--active',
          locked && 'tuner__peg-button--locked',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-pressed={locked}
        aria-label={`String ${string.stringNumber}, ${string.id}${done ? ', tuned' : ''}. ${locked ? 'Tap to unlock' : 'Tap to lock'}`}
        onClick={() => tuner.setLockedId(locked ? null : string.id)}
      >
        <span className="tuner__peg-note">{string.label}</span>
        <span className="tuner__peg-number">{string.stringNumber}</span>
        {done && (
          <span className="tuner__peg-done" aria-hidden="true">
            ✓
          </span>
        )}
      </button>
    )
  }

  return (
    <>
      <section className={`tuner tuner--${state}`}>
        <header className="tuner__header hm-hero">
          <span className="hm-hero__badge" aria-hidden="true">♮</span>
          <div>
            <h2 className="hm-hero__title">Tuner</h2>
            <p className="hm-hero__subtitle">Standard tuning · E A D G B E</p>
          </div>
        </header>

        <div className="tuner__dial-card">
          <div className="tuner__note" aria-live="polite">
            <span className="tuner__note-name">{noteName}</span>
            <sub className="tuner__note-octave">{octave}</sub>
          </div>

          <svg className="tuner__dial" viewBox="0 0 300 168" aria-hidden="true">
            {/* in-tune zone */}
            <path className="tuner__zone" d={arc(150, 150, 122, -7, 7)} />
            {TICKS.map((cents) => {
              const major = cents % 25 === 0
              const a = (cents / RANGE_CENTS) * SWEEP_DEG
              const [x1, y1] = polar(150, 150, major ? 110 : 116, a)
              const [x2, y2] = polar(150, 150, 130, a)
              return (
                <line
                  key={cents}
                  className={`tuner__tick ${major ? 'tuner__tick--major' : ''} ${cents === 0 ? 'tuner__tick--center' : ''}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                />
              )
            })}
            <text className="tuner__scale" x={polar(150, 150, 146, -SWEEP_DEG)[0]} y="84">
              −50
            </text>
            <text className="tuner__scale" x={polar(150, 150, 146, SWEEP_DEG)[0]} y="84">
              +50
            </text>
            <g className="tuner__needle" style={{ transform: `rotate(${angle}deg)` }}>
              <line x1="150" y1="150" x2="150" y2="36" />
            </g>
            <circle className="tuner__hub" cx="150" cy="150" r="7" />
          </svg>

          <TipAnchor id="guitar.tuner">
            <div className="tuner__readout">
              {listening && reading && (
                <>
                  <span className="tuner__hz">{Math.round(reading.frequency)} Hz</span>
                  <span className="tuner__advice">
                    {advice(reading)}
                    {!reading.inTune && (
                      <span className="tuner__cents">
                        {' '}
                        · {reading.cents > 0 ? '+' : '−'}
                        {Math.abs(Math.round(reading.cents))}¢
                      </span>
                    )}
                  </span>
                </>
              )}
              {listening && !reading && <span className="tuner__hint">Play a string</span>}
              {status === 'idle' && <span className="tuner__hint">Tap Start and allow the microphone</span>}
              {status === 'requesting' && <span className="tuner__hint">Starting microphone…</span>}
              {status === 'error' && <span className="tuner__error">{tuner.error}</span>}
            </div>
          </TipAnchor>
          {listening ? (
            <button type="button" className="tuner__button tuner__button--stop" onClick={tuner.stop}>
              Stop
            </button>
          ) : (
            <button type="button" className="tuner__button" disabled={status === 'requesting'} onClick={start}>
              Start
            </button>
          )}
        </div>

        <div className="tuner__controls">
          <div className="tuner__headstock" role="group" aria-label="Strings (tap one to lock it)">
            <div className="tuner__pegs tuner__pegs--left">{LEFT_PEGS.map(stringButton)}</div>
            <Headstock activeId={reading?.string.id} />
            <div className="tuner__pegs tuner__pegs--right">{RIGHT_PEGS.map(stringButton)}</div>
          </div>
          <p className="tuner__mode">
            {tuner.lockedId ? `Locked to ${tuner.lockedId} · tap it again for auto` : 'Auto · play any string'}
          </p>
        </div>
      </section>

      <FretboardDrawer />
    </>
  )
}

/** "Fretboard map": the whole neck, opened under the tuner when wanted. */
function FretboardDrawer() {
  const [open, setOpen] = useState(false)
  return (
    <details className="tuner-fretboard" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span className="tuner-fretboard__title">Fretboard map</span>
        <span className="tuner-fretboard__text">Every note on the neck, in any tuning</span>
        <span className="tuner-fretboard__chevron" aria-hidden="true">
          ▾
        </span>
      </summary>
      {open && <TipAnchor id="guitar.fretboard"><Fretboard /></TipAnchor>}
    </details>
  )
}

/**
 * A 3+3 headstock: six posts, strings running down over the nut onto the
 * neck (thicker for the low strings). The string being heard is drawn in the
 * dial's colour.
 */
function Headstock({ activeId }) {
  const postY = [44, 88, 132] // top to bottom
  const nutX = [41, 48.5, 56, 63.5, 71, 78.5] // low E … high e
  const posts = [
    ...LEFT_PEGS.map((index, row) => ({ index, x: 32, y: postY[row], side: 'left' })),
    ...RIGHT_PEGS.map((index, row) => ({ index, x: 88, y: postY[row], side: 'right' })),
  ]
  return (
    <svg className="tuner__headstock-art" viewBox="0 0 120 250" aria-hidden="true">
      {posts.map(({ index, y, side }) => (
        <rect
          key={`knob-${index}`}
          className="tuner__knob"
          x={side === 'left' ? 2 : 104}
          y={y - 6}
          width="14"
          height="12"
          rx="4"
        />
      ))}
      <path
        className="tuner__wood"
        d="M30 14 Q60 -2 90 14 L100 22 Q104 26 103 34 L98 150 Q96 162 84 168 L36 168 Q24 162 22 150 L17 34 Q16 26 20 22 Z"
      />
      <rect className="tuner__neck" x="36" y="168" width="48" height="82" />
      <rect className="tuner__nut" x="34" y="166" width="52" height="6" rx="2" />
      {[200, 232].map((y) => (
        <line key={y} className="tuner__fret" x1="36" x2="84" y1={y} y2={y} />
      ))}
      {posts.map(({ index, x, y }) => {
        const id = STANDARD_TUNING[index].id
        const nx = nutX[index]
        return (
          <g
            key={id}
            className={id === activeId ? 'tuner__string tuner__string--on' : 'tuner__string'}
            style={{ '--string-width': `${1 + (5 - index) * 0.3}px` }}
          >
            <polyline points={`${x},${y} ${nx},169 ${nx},250`} />
            <circle className="tuner__post" cx={x} cy={y} r="5.5" />
          </g>
        )
      })}
    </svg>
  )
}

// ── dial geometry: angles in degrees, 0 = straight up, positive = right ──
function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function arc(cx, cy, r, fromDeg, toDeg) {
  const [x1, y1] = polar(cx, cy, r, fromDeg)
  const [x2, y2] = polar(cx, cy, r, toDeg)
  return `M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`
}

export default Tuner
