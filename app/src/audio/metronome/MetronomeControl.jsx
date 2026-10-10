import './MetronomeControl.css'

/**
 * Metronome row (F40): click on/off, a one-bar count-in before Play, the
 * click volume, and a light that flashes on every beat — larger on the
 * downbeat. `beat` is { n, downbeat } from the player (n changes every beat),
 * or null while nothing is clicking.
 */
function MetronomeControl({ settings, onChange, beat, disabled }) {
  const audible = settings.on || settings.countIn
  const lightClass = beat ? (beat.downbeat ? ' metronome__light--downbeat' : ' metronome__light--beat') : ''

  return (
    <div className="metronome">
      {/* Keyed by beat so each beat restarts the flash animation. */}
      <span key={beat?.n ?? 'idle'} className={`metronome__light${lightClass}`} aria-hidden="true" />
      <div className="metronome__options" role="group" aria-label="Metronome">
        <button
          type="button"
          className="metronome__option"
          aria-pressed={settings.on}
          disabled={disabled}
          onClick={() => onChange({ on: !settings.on })}
        >
          Metronome
        </button>
        <button
          type="button"
          className="metronome__option"
          aria-pressed={settings.countIn}
          disabled={disabled}
          onClick={() => onChange({ countIn: !settings.countIn })}
        >
          Count-in
        </button>
      </div>
      <input
        type="range"
        className="metronome__volume"
        min={0}
        max={1}
        step={0.05}
        value={settings.volume}
        aria-label="Click volume"
        onChange={(event) => onChange({ volume: Number(event.target.value) })}
        disabled={disabled || !audible}
      />
    </div>
  )
}

export default MetronomeControl
