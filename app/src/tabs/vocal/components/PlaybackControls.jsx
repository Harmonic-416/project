import './PlaybackControls.css'

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function PlaybackControls({ state, position, duration, onPlay, onPause, onStop, onSeek, disabled }) {
  const isPlaying = state === 'playing'

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
        disabled={disabled || !duration}
      />
      <span className="playback-controls__time">
        {formatTime(position)} / {formatTime(duration)}
      </span>
    </div>
  )
}

export default PlaybackControls
