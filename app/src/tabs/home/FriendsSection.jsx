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
import { personAsUser, timeAgo } from './homeFormat.js'

const REQUEST_MESSAGES = {
  requested: (name) => `Request sent to ${name}.`,
  accepted: (name) => `${name} had already asked you, so you’re now friends.`,
  already_requested: (name) => `You already asked ${name}. Waiting for them to accept.`,
  already_friends: (name) => `You and ${name} are already friends.`,
}

/** Add by name#tag, answer requests, see and remove friends. */
function FriendsSection({ me, friends, error, onChanged }) {
  const [busy, setBusy] = useState(null) // id of the row being changed
  const [rowError, setRowError] = useState(null)

  if (error) return <p className="home-tab__error">{error}</p>

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

  return (
    <div className="home-friends">
      <AddFriendForm me={me} onAdded={onChanged} />

      {rowError && <p className="home-tab__error">{rowError}</p>}

      {incoming.length > 0 && (
        <div className="home-card">
          <h3 className="home-card__title">Friend requests</h3>
          <ul className="home-list">
            {incoming.map((f) => (
              <li key={f.friendship_id} className="home-list__item">
                <Person person={f} detail={`asked ${timeAgo(f.since)}`} />
                <div className="home-row">
                  <button
                    type="button"
                    className="home-button"
                    disabled={busy === f.friendship_id}
                    onClick={() => act(f.friendship_id, () => acceptFriendRequest(supabase, f.friendship_id))}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="home-link-button"
                    disabled={busy === f.friendship_id}
                    onClick={() => act(f.friendship_id, () => declineFriendRequest(supabase, f.friendship_id))}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="home-card">
        <h3 className="home-card__title">
          Friends{accepted.length > 0 && <span className="home-card__count">{accepted.length}</span>}
        </h3>
        {friends === null ? (
          <p className="home-tab__hint">Loading…</p>
        ) : accepted.length === 0 ? (
          <p className="home-tab__hint">
            No friends yet. Add someone with their name#tag above, or send them your invite link.
          </p>
        ) : (
          <ul className="home-list">
            {accepted.map((f) => (
              <li key={f.friendship_id} className="home-list__item">
                <Person person={f} detail={`friends since ${timeAgo(f.since)}`} />
                <button
                  type="button"
                  className="home-link-button home-link-button--danger"
                  disabled={busy === f.friendship_id}
                  onClick={() => {
                    if (!window.confirm(`Remove ${formatHandle(f) ?? 'this friend'} from your friends?`)) return
                    act(f.friendship_id, () => removeFriend(supabase, f.user_id))
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {outgoing.length > 0 && (
          <>
            <h4 className="home-card__subtitle">Waiting for them</h4>
            <ul className="home-list">
              {outgoing.map((f) => (
                <li key={f.friendship_id} className="home-list__item">
                  <Person person={f} detail={`asked ${timeAgo(f.since)}`} />
                  <button
                    type="button"
                    className="home-link-button"
                    disabled={busy === f.friendship_id}
                    onClick={() => act(f.friendship_id, () => removeFriend(supabase, f.user_id))}
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
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
    <form className="home-card home-add-friend" onSubmit={submit}>
      <label className="home-card__title" htmlFor="home-add-friend">
        Add a friend
      </label>
      <div className="home-row">
        <input
          id="home-add-friend"
          className="home-input"
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
        <button type="submit" className="home-button" disabled={state === 'busy' || !handle.trim()}>
          {state === 'busy' ? 'Sending…' : 'Send request'}
        </button>
      </div>
      {message && (
        <span className={message.error ? 'home-tab__error' : 'home-tab__hint'} role="status">
          {message.text}
        </span>
      )}
    </form>
  )
}

/** Avatar + name#tag + a small detail line. */
export function Person({ person, detail, size = 36 }) {
  return (
    <div className="home-person">
      <Avatar user={personAsUser(person)} size={size} />
      <div className="home-person__text">
        <span className="home-person__name">
          {person.display_name ?? 'Unnamed'}
          <span className="home-profile__tag">#{person.tag}</span>
        </span>
        {detail && <small className="home-person__detail">{detail}</small>}
      </div>
    </div>
  )
}

export default FriendsSection