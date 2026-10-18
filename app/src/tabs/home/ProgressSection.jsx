import { attemptFeedback, songKey, songsInProgress } from '@backend/home'
import { noteRange, percent, songMeta, timeAgo } from './homeFormat.js'

const INSTRUMENT = { guitar: 'Guitar', voice: 'Vocal' }
const SHOWN_SONGS = 6

/** How your latest attempt went: score, change since last time, trouble spots. */
export function LatestAttempt({ latest, recent, error, onOpenAttempt }) {
  if (error) return <p className="home-tab__error">{error}</p>
  if (latest === null || recent === null) return <div className="home-card home-card--loading">Loading…</div>
  if (!latest) {
    return (
      <div className="home-card">
        <p className="home-tab__hint">
          No attempts yet. Play a song in Guitar (Trouble spots) or record one in Vocal, and your results show up here.
        </p>
      </div>
    )
  }

  // The attempt before this one at the same song (recent is newest first).
  const key = songKey(latest)
  const previous = recent.find((a) => a.id !== latest.id && songKey(a) === key && a.created_at <= latest.created_at)
  const feedback = attemptFeedback(latest, previous)
  const trend = feedback.change === null ? null : feedback.change > 0 ? 'up' : feedback.change < 0 ? 'down' : 'same'

  return (
    <div className="home-card home-latest">
      <div className="home-latest__top">
        <div className="home-attempt__song">
          <strong>{latest.song_title}</strong>
          <small>
            {songMeta(latest.instrument, latest.part_name)} · {timeAgo(latest.created_at)}
          </small>
        </div>
        <span className={`home-score ${trend ? `home-score--${trend}` : ''}`}>{percent(feedback.accuracy)}</span>
      </div>
      <p className="home-latest__headline">{feedback.headline}</p>

      {feedback.counts && (
        <ul className="home-counts" aria-label="Notes">
          <li className="home-counts__item home-counts__item--hit">{feedback.counts.hit} hit</li>
          <li className="home-counts__item home-counts__item--close">{feedback.counts.close} close</li>
          <li className="home-counts__item home-counts__item--miss">{feedback.counts.miss} missed</li>
          {feedback.counts.skipped > 0 && <li className="home-counts__item">{feedback.counts.skipped} skipped</li>}
        </ul>
      )}
      {feedback.troubleSpots.length > 0 && (
        <p className="home-tab__hint">
          Trouble spots: {feedback.troubleSpots.map(noteRange).join(', ')}. Try them slower in Trouble spots mode.
        </p>
      )}

      <div className="home-row">
        <button type="button" className="home-button" onClick={() => onOpenAttempt({ id: latest.id, instrument: latest.instrument })}>
          See it on the score
        </button>
      </div>
    </div>
  )
}

/** Songs you've practised, most recent first, with your latest and best scores. */
export function WorkingOn({ recent, error, onOpenAttempt }) {
  if (error) return <p className="home-tab__error">{error}</p>
  if (recent === null) return <p className="home-tab__hint">Loading…</p>
  const songs = songsInProgress(recent)
  if (songs.length === 0) return <p className="home-tab__hint">Songs you practise will show up here.</p>

  return (
    <ul className="home-songs">
      {songs.slice(0, SHOWN_SONGS).map((song) => (
        <li key={song.key}>
          <button
            type="button"
            className="home-song"
            onClick={() => onOpenAttempt({ id: song.latest_attempt_id, instrument: song.instrument })}
          >
            <span className="home-song__title">{song.song_title}</span>
            <span className="home-song__meta">
              {INSTRUMENT[song.instrument]} · {song.attempts} {song.attempts === 1 ? 'try' : 'tries'} ·{' '}
              {timeAgo(song.last_practiced)}
            </span>
            <span className="home-song__scores">
              <span className="home-song__latest">{percent(song.latest)}</span>
              {song.change !== null && song.change !== 0 && (
                <span className={`home-song__change home-song__change--${song.change > 0 ? 'up' : 'down'}`}>
                  {song.change > 0 ? '▲' : '▼'} {Math.abs(song.change)}
                </span>
              )}
              <span className="home-song__best">best {percent(song.best)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}