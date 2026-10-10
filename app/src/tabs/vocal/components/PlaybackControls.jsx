import './PlaybackControls.css'

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * `position`/`duration` are whatever the player's seek uses. `rate` (the
 * tempo, F37) turns them into the time the listener actually waits, so the
 * readout shows real time at a slowed tempo; leave it out when the player
 * already reports real time (alphaTab).
 */
function PlaybackControls({ state, position, duration, rate = 1, onPlay, onPause, onStop, onSeek, disabled }) {
  // 'counting' is the metronome's count-in before playback starts.
  const counting = state === 'counting'
  const isPlaying = state === 'playing' || counting

  return (
    <div className="playback-controls">
      <button
        type="button"
        className="playback-controls__button"
        onClick={isPlaying ? onPause : onPlay}
        disabled={disabled}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button
        type="button"
        className="playback-controls__button playback-controls__button--secondary"
        onClick={onStop}
        disabled={disabled || state === 'idle' || state === 'stopped'}
      >
        Stop
      </button>
      <input
        type="range"
        className="playback-controls__seek"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(position, duration || 0)}
        onChange={(event) => onSeek(Number(event.target.value))}
        disabled={disabled || !duration || counting}
      />
      <span className="playback-controls__time">
        {counting ? 'Count-in…' : `${formatTime(position / rate)} / ${formatTime(duration / rate)}`}
      </span>
    </div>
  )
}

export default PlaybackControls
