import { useState } from 'react'
import { avatarUrlFor, displayNameFor, initialsFor } from './authHelpers.js'
import './Avatar.css'

/** Round profile picture from Google / GitHub, or the user's initials. */
function Avatar({ user, size = 48 }) {
  const [broken, setBroken] = useState(false)
  const url = avatarUrlFor(user)

  return (
    <span className="hm-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {url && !broken ? (
        <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        initialsFor(displayNameFor(user))
      )}
    </span>
  )
}

export default Avatar