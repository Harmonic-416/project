import { useCallback, useEffect, useState } from 'react'
import {
  MAX_COMMENT_LENGTH,
  addAttemptComment,
  deleteAttemptComment,
  listAttemptComments,
} from '@backend/attempts'
import { supabase } from '../../lib/supabaseClient.js'
import { Person } from './FriendsSection.jsx'
import { timeAgo } from './homeFormat.js'

/**
 * Comments on one attempt, for its owner and the friends it was sent to.
 * You can delete your own comments, and any comment on your own attempt.
 */
function AttemptThread({ attemptId, myId, isOwner, onChanged }) {
  const [comments, setComments] = useState(null)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    try {
      setComments(await listAttemptComments(supabase, attemptId))
      setError(null)
    } catch (err) {
      setError(err.message || 'Could not load comments.')
    }
  }, [attemptId])

  useEffect(() => {
    let live = true
    listAttemptComments(supabase, attemptId).then(
      (list) => live && setComments(list),
      (err) => live && setError(err.message || 'Could not load comments.'),
    )
    return () => {
      live = false
    }
  }, [attemptId])

  const post = async (event) => {
    event.preventDefault()
    if (!draft.trim()) return
    setPosting(true)
    setError(null)
    try {
      await addAttemptComment(supabase, attemptId, draft)
      setDraft('')
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message || 'Could not post your comment.')
    } finally {
      setPosting(false)
    }
  }

  const remove = async (comment) => {
    if (!window.confirm('Delete this comment?')) return
    try {
      await deleteAttemptComment(supabase, comment.id)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message || 'Could not delete it.')
    }
  }

  return (
    <div className="home-thread">
      {comments === null && !error && <p className="home-tab__hint">Loading comments…</p>}
      {comments?.length === 0 && (
        <p className="home-tab__hint">{isOwner ? 'No feedback yet.' : 'No comments yet. Say how it went!'}</p>
      )}
      {comments?.length > 0 && (
        <ul className="home-thread__list">
          {comments.map((comment) => (
            <li key={comment.id} className="home-thread__comment">
              <Person person={comment} detail={timeAgo(comment.created_at)} size={28} />
              <p className="home-thread__body">{comment.body}</p>
              {(comment.author_id === myId || isOwner) && (
                <button type="button" className="home-link-button home-link-button--small" onClick={() => remove(comment)}>
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="home-thread__form" onSubmit={post}>
        <textarea
          className="home-input home-thread__input"
          rows={2}
          maxLength={MAX_COMMENT_LENGTH}
          value={draft}
          placeholder={isOwner ? 'Reply…' : 'Leave feedback…'}
          aria-label="Comment"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="home-button" disabled={posting || !draft.trim()}>
          {posting ? 'Posting…' : 'Post'}
        </button>
      </form>
      {error && <span className="home-tab__error">{error}</span>}
    </div>
  )
}

export default AttemptThread