import { useCallback, useEffect, useMemo, useState } from 'react'
import './AttemptHistory.css'
import '../../home/HomeTab.css'
import { canViewAttempt, getSharedRecordingUrl, listSongAttempts } from '@backend/attempts'
import AttemptThread from '../../home/AttemptThread.jsx'
import { attemptTime } from '../practice/practiceSession.js'
import { formatChange, historySummary, withTrend } from '../share/attemptHistory.js'
import { AttemptRow } from './SessionAttempts.jsx'

/**
 * Under an opened attempt: the singer's own note and rating on it (only for
 * the singer), the comments from the friends it was sent to, and every try
 * at the same song with its score, the change from the try before, its
 * recording, notes and comment count, each one openable. A friend sees the
 * tries that were sent to them; row-level security decides.
 */
function AttemptHistory({ attempt, viewerId, supabase, onOpenAttempt }) {
  const isOwner = Boolean(viewerId) && viewerId === attempt.user_id
  const [tries, setTries] = useState(null)
  const [canComment, setCanComment] = useState(isOwner)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setTries(await listSongAttempts(supabase, attempt, { isOwner }))
      setError(null)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not load the earlier tries.')
    }
  }, [supabase, attempt, isOwner])

  useEffect(() => {
    let live = true
    listSongAttempts(supabase, attempt, { isOwner }).then(
      (list) => live && setTries(list),
      (err) => {
        console.error(err)
        if (live) setError(err.message || 'Could not load the earlier tries.')
      },
    )
    if (!isOwner && viewerId) {
      canViewAttempt(supabase, attempt.id).then(
        (ok) => live && setCanComment(ok),
        () => live && setCanComment(false),
      )
    }
    return () => {
      live = false
    }
  }, [supabase, attempt, isOwner, viewerId])

  const trend = useMemo(() => (tries ? withTrend(tries) : []), [tries])
  const summary = useMemo(() => historySummary(trend), [trend])
  const who = isOwner ? 'Your' : `${attempt.sharer_name || 'Their'}’s`

  return (
    <div className="attempt-history">
      {isOwner && (
        <section className="attempt-history__section" aria-labelledby="attempt-history-mine">
          <h3 id="attempt-history-mine" className="attempt-history__title">
            Your notes on this attempt
          </h3>
          <ol className="attempt-history__list">
            <AttemptRow attempt={attempt} supabase={supabase} showAudio={false} onChange={() => {}} />
          </ol>
        </section>
      )}

      {canComment && (
        <section className="attempt-history__section" aria-labelledby="attempt-history-comments">
          <h3 id="attempt-history-comments" className="attempt-history__title">
            {isOwner ? 'Feedback from friends' : 'Comments'}
          </h3>
          <AttemptThread attemptId={attempt.id} myId={viewerId} isOwner={isOwner} onChanged={load} />
        </section>
      )}

      <section className="attempt-history__section" aria-labelledby="attempt-history-tries">
        <h3 id="attempt-history-tries" className="attempt-history__title">
          {who} tries at this song
        </h3>
        {summary && (
          <p className="attempt-history__summary">
            {summary.tries} {summary.tries === 1 ? 'try' : 'tries'} · best <strong>{summary.best}%</strong> · latest {summary.latest}%
            {summary.tries > 1 && ` · ${formatChange(summary.latest - summary.first)} since the first`}
          </p>
        )}
        {tries === null && !error && <p className="attempt-history__hint">Loading…</p>}
        {error && <p className="attempt-history__error">{error}</p>}
        {trend.length > 0 && (
          <ol className="attempt-history__list">
            {trend.map((row) => {
              const current = row.id === attempt.id
              const actions = (
                <TryActions row={row} current={current} onOpen={() => onOpenAttempt?.(row.id)} />
              )
              // The open try's own note and rating are edited above; here it is the plain row.
              return isOwner && !current ? (
                <AttemptRow
                  key={row.id}
                  attempt={row}
                  supabase={supabase}
                  actions={actions}
                  onChange={() => {}}
                />
              ) : (
                <FriendTry key={row.id} row={row} current={current} supabase={supabase} actions={actions} isOwner={isOwner} />
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}

/** The change from the try before, the comment count, and Open (or "Showing" for the open one). */
function TryActions({ row, current, onOpen }) {
  return (
    <span className="attempt-history__actions">
      {row.change !== null && (
        <span className={`attempt-history__change attempt-history__change--${row.change > 0 ? 'up' : row.change < 0 ? 'down' : 'same'}`}>
          {formatChange(row.change)}
        </span>
      )}
      {row.best && <span className="attempt-history__best">best</span>}
      {row.comment_count > 0 && (
        <span className="attempt-history__comments">
          💬 {row.comment_count}
        </span>
      )}
      {current ? (
        <span className="attempt-history__showing">Showing</span>
      ) : (
        <button type="button" className="attempt-row__link" onClick={onOpen}>
          Open
        </button>
      )}
    </span>
  )
}

/** A try sent to a friend: score, when, part, and the recording if it was shared. */
function FriendTry({ row, current, supabase, actions, isOwner = false }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(null)
  const play = async () => {
    try {
      setUrl(await getSharedRecordingUrl(supabase, row))
    } catch (err) {
      console.error(err)
      setError('Could not load the recording.')
    }
  }
  return (
    <li className={`attempt-row ${current ? 'attempt-row--current' : ''}`}>
      <div className="attempt-row__head">
        <strong className="attempt-row__score">{Math.round(Number(row.accuracy))}%</strong>
        <span className="attempt-row__meta">
          {attemptTime(row.created_at)}
          {row.part_name ? ` · ${row.part_name}` : ''}
        </span>
        {actions}
      </div>
      {row.recording_path ? (
        <div className="attempt-row__audio">
          {url ? (
            <audio className="attempt-row__player" controls autoPlay src={url} />
          ) : (
            <button type="button" className="attempt-row__button" onClick={play}>
              ▶ Play recording
            </button>
          )}
          {error && <span className="attempt-row__error">{error}</span>}
        </div>
      ) : (
        <span className="attempt-row__hint">{isOwner ? 'No recording kept.' : 'No recording shared.'}</span>
      )}
    </li>
  )
}

export default AttemptHistory
