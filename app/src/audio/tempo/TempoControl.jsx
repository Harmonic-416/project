import './TempoControl.css'
import { TEMPO_MAX, TEMPO_MIN, TEMPO_STEP, effectiveBpm } from './tempo.js'

/**
 * Tempo row (F37): 50–100% of the written tempo in 5% steps, with the BPM
 * that is actually heard when the written one (`bpm`) is known.
 */
function TempoControl({ pct, onChange, bpm, disabled }) {
  const heard = bpm > 0 ? ` · ♩ = ${effectiveBpm(bpm, pct)}` : ''

  return (
    <div className="tempo-control">
      <label className="tempo-control__label" htmlFor="tempo-control-range">
        Tempo
      </label>
      <input
        id="tempo-control-range"
        type="range"
        className="tempo-control__range"
        min={TEMPO_MIN}
        max={TEMPO_MAX}
        step={TEMPO_STEP}
        value={pct}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        aria-valuetext={`${pct}% of written tempo`}
      />
      <span className="tempo-control__readout" aria-live="polite">
        {pct}%{heard}
      </span>
    </div>
  )
}

export default TempoControl
