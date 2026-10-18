import { attemptFeedback, songKey, songsInProgress } from '@backend/home'
import { GuitarIcon, MicIcon } from '../../nav/TabIcons.jsx'
import { noteRange, percent, songMeta, timeAgo } from './homeFormat.js'
import { ChevronIcon, PlusIcon, WaveIcon } from './homeIcons.jsx'

const INSTRUMENT = { guitar: 'Guitar', voice: 'Vocal' }

/** The instrument's picture in a tinted tile (teal for guitar, purple for vocal). */
export function InstrumentArt({ instrument, size = 'small' }) {
  const Icon = instrument === 'voice' ? MicIcon : GuitarIcon
  return (
    <span className={`hp-art hp-art--${instrument === 'voice' ? 'vocal' : 'guitar'} hp-art--${size}`} aria-hidden="true">
      <Icon />
    </span>
  )
}

/** A ring filled to `value` percent. */
function AccuracyRing({ value }) {
  const r = 46
  const circumference = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(100, value)) / 100
  return (
    <div className="hp-ring" role="img" aria-label={`Accuracy ${percent(value)}`}>
      <svg viewBox="0 0 110 110" aria-hidden="true">
        <circle className="hp-ring__track" cx="55" cy="55" r={r} />
        <circle
          className="hp-ring__fill"
          cx="55"
          cy="55"
          r={r}
          strokeDasharray={`${circumference * filled} ${circumference}`}
          transform="rotate(-90 55 55)"
        />
      </svg>
      <span className="hp-ring__value">{percent(value)}</span>
      <span className="hp-ring__label">Accuracy</span>
    </div>
  )
}

function changeText(change) {
  if (change === null) return 'first try'
  if (change > 0) return `up ${change} from last time`
  if (change < 0) return `down ${-change} from last time`
  return 'same as last time'
}

/**
 * Continue practice: your latest attempt, how it went (hit / close / missed
 * for guitar), its trouble spots, and a way back to it on the score.
 */
export function ContinuePractice({ latest, recent, error, onOpenAttempt, onNavigate }) {
  if (error) return <p className="home-tab__error">{error}</p>
  if (latest === null || recent === null) return <div className="hp-card hp-continue hp-card--loading">Loading your latest attempt…</div>

  if (!latest) {
    return (
      <div className="hp-card hp-continue hp-continue--empty">
        <p className="hp-muted">
          No attempts yet. Play a song in Guitar (Trouble spots) or record one in Vocal, and it shows up here.
        </p>
        <div className="home-row">
          <button type="button" className="hp-button" onClick={() => onNavigate('guitar')}>
            Start on Guitar
          </button>
          <button type="button" className="hp-button hp-button--ghost" onClick={() => onNavigate('vocal')}>
            Start on Vocal
          </button>
        </div>
      </div>
    )
  }

  // The attempt before this one at the same song (recent is newest first).
  const key = songKey(latest)
  const previous = recent.find((a) => a.id !== latest.id && songKey(a) === key && a.created_at <= latest.created_at)
  const feedback = attemptFeedback(latest, previous)
  const open = () => onOpenAttempt({ id: latest.id, instrument: latest.instrument })

  return (
    <div className="hp-card hp-continue">
      <InstrumentArt instrument={latest.instrument} size="large" />

      <div className="hp-continue__main">
        <h3 className="hp-continue__title">{latest.song_title}</h3>
        <p className="hp-meta">
          {songMeta(latest.instrument, latest.part_name)} <span className="hp-dot">•</span> {percent(feedback.accuracy)}{' '}
          <span className="hp-dot">•</span> {changeText(feedback.change)}
        </p>

        {feedback.counts && (
          <ul className="hp-stats" aria-label="Notes">
            <li className="hp-stat hp-stat--hit">
              <strong>{feedback.counts.hit}</strong> hit
            </li>
            <li className="hp-stat hp-stat--close">
              <strong>{feedback.counts.close}</strong> close
            </li>
            <li className="hp-stat hp-stat--miss">
              <strong>{feedback.counts.miss}</strong> missed
            </li>
          </ul>
        )}

        {feedback.troubleSpots.length > 0 && (
          <button type="button" className="hp-trouble" onClick={open}>
            <span className="hp-trouble__icon">
              <WaveIcon />
            </span>
            <span className="hp-trouble__text">
              <span>
                <strong>Trouble spots:</strong> {feedback.troubleSpots.map(noteRange).join(', ')}
              </span>
              <small>Try them slower in Trouble spots mode.</small>
            </span>
            <ChevronIcon />
          </button>
        )}
      </div>

      <div className="hp-continue__side">
        <AccuracyRing value={feedback.accuracy} />
        <button type="button" className="hp-button hp-button--big" onClick={open}>
          Open score <ChevronIcon />
        </button>
      </div>
    </div>
  )
}

/**
 * Songs you've practised, most recent first: tries, when, a bar for your
 * best score, your latest and best. `limit` cards (all when null), plus an
 * "Add a song" card with `showAdd`.
 */
export function WorkingOnCards({ recent, error, limit = null, onOpenAttempt, onNavigate, showAdd = false }) {
  if (error) return <p className="home-tab__error">{error}</p>
  if (recent === null) return <p className="hp-muted">Loading…</p>
  const songs = songsInProgress(recent)
  const shown = limit === null ? songs : songs.slice(0, limit)

  return (
    <ul className="hp-songs">
      {shown.map((song) => (
        <li key={song.key}>
          <button
            type="button"
            className="hp-card hp-song"
            onClick={() => onOpenAttempt({ id: song.latest_attempt_id, instrument: song.instrument })}
          >
            <InstrumentArt instrument={song.instrument} />
            <span className="hp-song__body">
              <span className="hp-song__title">{song.song_title}</span>
              <span className="hp-meta">
                {INSTRUMENT[song.instrument]} <span className="hp-dot">•</span> {song.attempts} {song.attempts === 1 ? 'try' : 'tries'}
              </span>
              <span className="hp-meta">Last practiced {timeAgo(song.last_practiced)}</span>
              <span className={`hp-bar hp-bar--${song.instrument === 'voice' ? 'vocal' : 'guitar'}`} aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(100, song.best))}%` }} />
              </span>
              <span className="hp-song__scores">
                <strong>{percent(song.latest)}</strong>
                {song.change !== null && song.change !== 0 && (
                  <span className={`hp-change hp-change--${song.change > 0 ? 'up' : 'down'}`}>
                    {song.change > 0 ? '▲' : '▼'} {Math.abs(song.change)}
                  </span>
                )}
                <span className="hp-song__best">
                  Best <strong>{percent(song.best)}</strong>
                </span>
              </span>
            </span>
          </button>
        </li>
      ))}
      {showAdd && (
        <li>
          <div className="hp-card hp-add">
            <span className="hp-add__plus" aria-hidden="true">
              <PlusIcon />
            </span>
            <strong>Add a song</strong>
            <span className="hp-muted">Upload a file or choose from the library</span>
            <div className="home-row hp-add__actions">
              <button type="button" className="hp-chip" onClick={() => onNavigate('guitar')}>
                Guitar
              </button>
              <button type="button" className="hp-chip hp-chip--vocal" onClick={() => onNavigate('vocal')}>
                Vocal
              </button>
            </div>
          </div>
        </li>
      )}
      {songs.length === 0 && !showAdd && <li className="hp-muted">Songs you practise will show up here.</li>}
    </ul>
  )
}