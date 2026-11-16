import { useState } from 'react'
import {
  acceptFriendRequest,
  declineFriendRequest,
  findUserByHandle,
  formatHandle,
  parseHandle,
  removeFriend,
  sendFriendRequest,
} from '@backend/friends'
import Avatar from '../../auth/Avatar.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { personAsUser, timeAgo } from '../home/homeFormat.js'
import { InboxIcon, PeopleIcon, SendIcon, UserPlusIcon } from './socialIcons.jsx'

const REQUEST_MESSAGES = {
  requested: (name) => `Request sent to ${name}.`,
  accepted: (name) => `${name} had already asked you, so you’re now friends.`,
  already_requested: (name) => `You already asked ${name}. Waiting for them to accept.`,
  already_friends: (name) => `You and ${name} are already friends.`,
}

// Each person keeps the same avatar ring colour, picked from their name#tag.
const RINGS = ['cyan', 'purple', 'orange', 'pink', 'green']
function ringFor(person) {
  const key = `${person.display_name ?? ''}#${person.tag ?? ''}`
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return RINGS[hash % RINGS.length]
}

/**
 * Social's friends area: add someone by name#tag, then your friends,
 * requests asking you and requests you sent, as three tabs with counts.
 */
function SocialFriends({ me, friends, error, onChanged }) {
  const [busy, setBusy] = useState(null) // id of the row being changed
  const [rowError, setRowError] = useState(null)
  const [list, setList] = useState('friends') // friends | requests | sent

  if (error) return <p className="home-tab__error">{error}</p>

  const loading = friends === null
  const incoming = friends?.filter((f) => f.kind === 'incoming') ?? []
  const outgoing = friends?.filter((f) => f.kind === 'outgoing') ?? []
  const accepted = friends?.filter((f) => f.kind === 'friend') ?? []

  const act = async (id, work) => {
    setBusy(id)
    setRowError(null)
    try {
      await work()
      await onChanged()
    } catch (err) {
      setRowError(err.message || 'That didn’t work. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const tabs = [
    { id: 'friends', label: 'Friends', count: accepted.length },
    { id: 'requests', label: 'Requests', count: incoming.length, alert: incoming.length > 0 },
    { id: 'sent', label: 'Sent', count: outgoing.length },
  ]

  let rows
  if (list === 'friends') {
    rows = accepted.map((f) => (
      <PersonRow key={f.friendship_id} person={f} detail={`Friends since ${timeAgo(f.since)}`}>
        <button
          type="button"
          className="social-ghost social-ghost--danger"
          disabled={busy === f.friendship_id}
          onClick={() => {
            if (!window.confirm(`Remove ${formatHandle(f) ?? 'this friend'} from your friends?`)) return
            act(f.friendship_id, () => removeFriend(supabase, f.user_id))
          }}
        >
          Remove
        </button>
      </PersonRow>
    ))
  } else if (list === 'requests') {
    rows = incoming.map((f) => (
      <PersonRow key={f.friendship_id} person={f} detail={`Asked ${timeAgo(f.since)}`} highlight>
        <button
          type="button"
          className="social-button social-button--small"
          disabled={busy === f.friendship_id}
          onClick={() => act(f.friendship_id, () => acceptFriendRequest(supabase, f.friendship_id))}
        >
          Accept
        </button>
        <button
          type="button"
          className="social-ghost"
          disabled={busy === f.friendship_id}
          onClick={() => act(f.friendship_id, () => declineFriendRequest(supabase, f.friendship_id))}
        >
          Decline
        </button>
      </PersonRow>
    ))
  } else {
    rows = outgoing.map((f) => (
      <PersonRow key={f.friendship_id} person={f} detail={`Waiting since ${timeAgo(f.since)}`}>
        <button
          type="button"
          className="social-ghost"
          disabled={busy === f.friendship_id}
          onClick={() => act(f.friendship_id, () => removeFriend(supabase, f.user_id))}
        >
          Cancel
        </button>
      </PersonRow>
    ))
  }

  const empty = {
    friends: { Icon: PeopleIcon, text: 'No friends yet. Add someone with their name#tag, or share your invite link.' },
    requests: { Icon: InboxIcon, text: 'No one is asking right now.' },
    sent: { Icon: SendIcon, text: 'No requests waiting on an answer.' },
  }[list]

  return (
    <div className="social-friends">
      <AddFriendForm me={me} onAdded={onChanged} />

      <section className="social-card" aria-label="Your friends">
        <div className="social-tabs" role="tablist" aria-label="Friends lists">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={list === tab.id}
              className={`social-tabs__tab ${list === tab.id ? 'is-active' : ''}`}
              onClick={() => setList(tab.id)}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`social-tabs__count ${tab.alert ? 'social-tabs__count--alert' : ''}`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {rowError && <p className="home-tab__error social-card__error">{rowError}</p>}

        {loading ? (
          <p className="social-hint social-card__pad">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="social-empty">
            <span className="social-empty__icon" aria-hidden="true">
              <empty.Icon />
            </span>
            <p>{empty.text}</p>
          </div>
        ) : (
          <ul className="social-list" role="tabpanel">
            {rows}
          </ul>
        )}
      </section>
    </div>
  )
}

function PersonRow({ person, detail, highlight = false, children }) {
  return (
    <li className={`social-person ${highlight ? 'social-person--highlight' : ''}`}>
      <span className={`social-person__avatar social-ring--${ringFor(person)}`}>
        <Avatar user={personAsUser(person)} size={42} />
      </span>
      <span className="social-person__text">
        <span className="social-person__name">
          {person.display_name ?? 'Unnamed'}
          <span className="social-person__tag">#{person.tag}</span>
        </span>
        <small>{detail}</small>
      </span>
      <span className="social-person__actions">{children}</span>
    </li>
  )
}

function AddFriendForm({ me, onAdded }) {
  const [handle, setHandle] = useState('')
  const [state, setState] = useState('idle') // idle | busy
  const [message, setMessage] = useState(null) // { text, error }

  const submit = async (event) => {
    event.preventDefault()
    if (!parseHandle(handle)) {
      setMessage({ text: 'Type their name, #, then their 4-digit tag, like Pan#2041.', error: true })
      return
    }
    setState('busy')
    setMessage(null)
    try {
      const person = await findUserByHandle(supabase, handle)
      if (!person) {
        setMessage({ text: `No one is called ${handle.trim()}. Check the name and tag.`, error: true })
      } else if (person.id === me?.id) {
        setMessage({ text: 'That’s you!', error: true })
      } else {
        const result = await sendFriendRequest(supabase, person.id)
        setMessage({ text: REQUEST_MESSAGES[result](formatHandle(person)) })
        setHandle('')
        await onAdded()
      }
    } catch (err) {
      setMessage({ text: err.message || 'Could not send the request.', error: true })
    } finally {
      setState('idle')
    }
  }

  return (
    <form className="social-card social-add" onSubmit={submit}>
      <label className="social-add__label" htmlFor="social-add-friend">
        <span className="social-add__icon" aria-hidden="true">
          <UserPlusIcon />
        </span>
        Add a friend
      </label>
      <div className="social-field">
        <input
          id="social-add-friend"
          className="social-field__input"
          value={handle}
          placeholder="name#1234"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(event) => {
            setHandle(event.target.value)
            setMessage(null)
          }}
        />
        <button type="submit" className="social-button" disabled={state === 'busy' || !handle.trim()}>
          {state === 'busy' ? 'Sending…' : 'Send request'}
        </button>
      </div>
      {message && (
        <span className={message.error ? 'home-tab__error' : 'social-hint social-hint--ok'} role="status">
          {message.text}
        </span>
      )}
    </form>
  )
}

export default SocialFriends
