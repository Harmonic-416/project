import { useEffect, useMemo, useRef, useState } from 'react'
import { sfx } from '../feedback/sfx.js'
import { recordStars } from '../feedback/progress.js'
import { BARS_PER_PHASE, METERS, eighthSeconds, phaseHint, rhythmPlan, rhythmPosition } from './learnLogic.js'

const C4 = 60
// Each note sounds for this share of its length, so repeated Cs stay separate.
const NOTE_SHARE = 0.85

/** A small note symbol: whole, half, quarter or eighth. */
function NoteGlyph({ kind }) {
  const hollow = kind === 'whole' || kind === 'half'
  return (
    <svg className="learn-glyph" viewBox="0 0 20 30" aria-hidden="true">
      <ellipse
        cx="8"
        cy="23"
        rx="6"
        ry="4.2"
        transform="rotate(-20 8 23)"
        fill={hollow ? 'none' : 'currentColor'}
        stroke="currentColor"
        strokeWidth={hollow ? 2 : 0}
      />
      {kind !== 'whole' && <line x1="13.4" x2="13.4" y1="22" y2="3" stroke="currentColor" strokeWidth="1.6" />}
      {kind === 'eighth' && <path d="M13.4 3c1 4 6 5 5 11-1-3-3-4-5-4z" fill="currentColor" />}
    </svg>
  )
}

/** Rhythm: a metronome plus C played as quarter, half, whole and eighth notes, two bars each, to clap along to. */
export default function RhythmLearn({ playback }) {
  const { owner, elapsed, play, stop } = playback
  const [meterId, setMeterId] = useState('4/4')
  const meter = METERS[meterId]
  const [bpm, setBpm] = useState(meter.bpm.default)
  const plan = useMemo(() => rhythmPlan(meter), [meter])
  const eighth = eighthSeconds(meter, bpm)
  const playing = owner === 'rhythm'

  const chooseMeter = (id) => {
    if (playing) stop()
    setMeterId(id)
    setBpm(METERS[id].bpm.default)
  }

  const start = () =>
    play('rhythm', plan.total * eighth + 0.3, (session, t0) => {
      // Clicks and notes go to different instruments, so each list is booked in time order.
      plan.clicks.forEach((c) => session.click(t0 + c.at * eighth, c.level))
      plan.notes.forEach((n) => session.note(C4, t0 + n.at * eighth, n.length * eighth * NOTE_SHARE))
    })

  const position = playing && elapsed >= 0 ? elapsed / eighth : null

  // Clapping all the way through finishes the lesson (a Stop part-way doesn't).
  const furthestRef = useRef(0)
  useEffect(() => {
    if (position !== null) {
      furthestRef.current = Math.max(furthestRef.current, position)
      return
    }
    if (furthestRef.current >= plan.total - 1) {
      sfx.complete()
      recordStars('rhythm', 3)
    }
    furthestRef.current = 0
  }, [position, plan.total])
  const where = position === null ? null : rhythmPosition(plan, position)
  const phase = where && where.phaseIndex >= 0 ? plan.phases[where.phaseIndex] : null
  const phaseLength = plan.bar * BARS_PER_PHASE
  // Which count (across the two bars of a row) is sounding; the count-in uses the first bar.
  const countAt =
    position === null ? null : where.phaseIndex < 0 ? Math.floor(position) : (Math.floor(position) - plan.bar) % phaseLength

  return (
    <div className="learn-section">
      <p className="learn-intro">
        Listen to the click, then clap each note value along with the C. Every kind of note gets {BARS_PER_PHASE}{' '}
        bars, after a one-bar count-in.
      </p>

      <section className="learn-card">
        <div className="learn-card__top">
          <div className="learn-segmented" role="radiogroup" aria-label="Time signature">
            {Object.values(METERS).map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={meterId === m.id}
                className={`learn-segmented__option${meterId === m.id ? ' learn-segmented__option--on' : ''}`}
                onClick={() => chooseMeter(m.id)}
              >
                {m.id}
              </button>
            ))}
          </div>
          <button type="button" className="learn-button learn-button--primary" onClick={playing ? stop : start}>
            {playing ? 'Stop' : '▶ Start'}
          </button>
        </div>

        <label className="learn-tempo">
          <span>
            {meter.tempoLabel} {bpm}
          </span>
          <input
            type="range"
            min={meter.bpm.min}
            max={meter.bpm.max}
            value={bpm}
            disabled={playing}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
        </label>

        <div className="learn-now" aria-live="polite">
          <strong>{!playing ? 'Ready' : phase ? phase.label : 'Count-in…'}</strong>
          <span>
            {!playing
              ? meterId === '4/4'
                ? 'Four quarter-note beats per bar.'
                : 'Twelve eighths per bar, felt as four beats of three.'
              : phase
                ? phaseHint(meterId, phase.id)
                : 'Get ready to clap.'}
          </span>
        </div>

        <div className="learn-lane learn-lane--counts" aria-hidden="true">
          <span />
          <div
            className="learn-counts"
            style={{ gridTemplateColumns: `repeat(${phaseLength}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: phaseLength }, (_, i) => (
              <span
                key={i}
                className={[
                  'learn-count',
                  i % meter.pulse === 0 ? 'learn-count--beat' : '',
                  i % plan.bar === 0 ? 'learn-count--bar' : '',
                  countAt === i ? 'learn-count--on' : '',
                ].join(' ')}
              >
                {meter.counts[i % plan.bar]}
              </span>
            ))}
          </div>
        </div>

        <div className="learn-lanes">
          {plan.phases.map((p, pi) => {
            const isActive = where?.phaseIndex === pi
            const head = isActive ? ((position - p.start) / phaseLength) * 100 : null
            return (
              <div key={p.id} className={`learn-lane${isActive ? ' learn-lane--active' : ''}`}>
                <span className="learn-lane__label">
                  <NoteGlyph kind={p.id} />
                  {p.label}
                </span>
                <div className="learn-lane__track">
                  {Array.from({ length: phaseLength }, (_, i) => (
                    <span
                      key={i}
                      className={`learn-lane__grid${i % plan.bar === 0 ? ' learn-lane__grid--bar' : i % meter.pulse === 0 ? ' learn-lane__grid--beat' : ''}`}
                      style={{ left: `${(i / phaseLength) * 100}%` }}
                    />
                  ))}
                  {plan.notes
                    .filter((n) => n.phase === p.id)
                    .map((n) => {
                      const sounding = isActive && position >= n.at && position < n.at + n.length
                      return (
                        <span
                          key={n.index}
                          className={`learn-lane__note${sounding ? ' learn-lane__note--on' : ''}`}
                          style={{
                            left: `${((n.at - p.start) / phaseLength) * 100}%`,
                            width: `${(n.length / phaseLength) * 100}%`,
                          }}
                        >
                          <NoteGlyph kind={p.id} />
                        </span>
                      )
                    })}
                  {head !== null && <span className="learn-lane__head" style={{ left: `${head}%` }} />}
                </div>
              </div>
            )
          })}
        </div>
        <p className="learn-hint">Each row is two bars. The thick line is the bar line.</p>
      </section>
    </div>
  )
}
