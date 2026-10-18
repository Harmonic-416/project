import { useState } from 'react'
import { markAttemptSeen } from '@backend/attempts'
import { supabase } from '../../lib/supabaseClient.js'
import AttemptThread from './AttemptThread.jsx'
import { Person } from './FriendsSection.jsx'
import { namesList, percent, songMeta, timeAgo } from './homeFormat.js'

const INSTRUMENT = { guitar: 'Guitar', voice: 'Vocal' }

/** Attempts friends sent you: open them, and leave feedback. */
export function InboxSection({ inbox, error, myId, onOpenAttempt, onChanged }) {
  if (error) return <p className="home-tab__error">{error}</p>
  if (inbox === null) return <p className="home-tab__hint">Loading…</p>
  if (inbox.length === 0) {
    return <p className="home-tab__hint">Nothing yet. When a friend sends you an attempt, it shows up here.</p>
  }

  return (
    <ul className="home-attempts">
      {inbox.map((item) => (
        <AttemptItem
          key={item.attempt_id}
          title={item.song_title}
          meta={`${songMeta(item.instrument, item.part_name)} · ${percent(item.accuracy)}`}
          header={<Person person={{ display_name: item.sender_name, tag: item.sender_tag, avatar_url: item.sender_avatar_url }} detail={`sent ${timeAgo(item.sent_at)}`} size={32} />}
          isNew={!item.seen_at}
          commentCount={item.comment_count}
          attemptId={item.attempt_id}
          myId={myId}
          isOwner={false}
          openLabel={item.has_recording ? 'Open + listen' : 'Open'}
          onOpen={async () => {
            if (!item.seen_at) await markAttemptSeen(supabase, item.attempt_id).catch(() => {})
            onOpenAttempt({ id: item.attempt_id, instrument: item.instrument })
          }}
          onThreadOpened={async () => {
            if (item.seen_at) return
            await markAttemptSeen(supabase, item.attempt_id).catch(() => {})
            onChanged()
          }}
          onChanged={onChanged}
        />
      ))}
    </ul>
  )
}

/** Attempts you sent: who has seen them, and what they said. */
export function SentSection({ sent, error, friends, myId, onOpenAttempt }) {
  if (error) return <p className="home-tab__error">{error}</p>
  if (sent === null) return <p className="home-tab__hint">Loading…</p>
  if (sent.length === 0) {
    return (
      <p className="home-tab__hint">
        After an attempt in Guitar (Trouble spots) or Vocal (record), press <strong>Send to friends</strong> to get feedback.
      </p>
    )
  }

  const nameOf = (id) => friends?.find((f) => f.user_id === id)?.display_name ?? null

  return (
    <ul className="home-attempts">
      {sent.map((item) => {
        const seen = item.recipients.filter((r) => r.seen_at).length
        return (
          <AttemptItem
            key={item.attempt_id}
            title={item.song_title}
            meta={`${INSTRUMENT[item.instrument]} · ${percent(item.accuracy)} · ${timeAgo(item.created_at)}`}
            header={
              <p className="home-attempt__to">
                To {namesList(item.recipients.map((r) => nameOf(r.recipient_id)))}
                <small>
                  {' '}
                  · {seen === item.recipients.length ? 'seen' : `${seen} of ${item.recipients.length} seen`}
                </small>
              </p>
            }
            attemptId={item.attempt_id}
            myId={myId}
            isOwner
            openLabel="Open"
            onOpen={() => onOpenAttempt({ id: item.attempt_id, instrument: item.instrument })}
          />
        )
      })}
    </ul>
  )
}

function AttemptItem({ title, meta, header, isNew, commentCount, attemptId, myId, isOwner, openLabel, onOpen, onThreadOpened, onChanged }) {
  const [threadOpen, setThreadOpen] = useState(false)

  return (
    <li className={`home-card home-attempt ${isNew ? 'home-attempt--new' : ''}`}>
      <div className="home-attempt__top">
        {header}
        {isNew && <span className="home-badge">New</span>}
      </div>
      <div className="home-attempt__song">
        <strong>{title}</strong>
        <small>{meta}</small>
      </div>
      <div className="home-row">
        <button type="button" className="home-button" onClick={onOpen}>
          {openLabel}
        </button>
        <button
          type="button"
          className="home-link-button"
          aria-expanded={threadOpen}
          onClick={() => {
            setThreadOpen((open) => !open)
            if (!threadOpen) onThreadOpened?.()
          }}
        >
          {threadOpen ? 'Hide comments' : commentCount ? `Comments (${commentCount})` : 'Comments'}
        </button>
      </div>
      {threadOpen && <AttemptThread attemptId={attemptId} myId={myId} isOwner={isOwner} onChanged={onChanged} />}
    </li>
  )
}