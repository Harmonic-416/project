import Avatar from '../../auth/Avatar.jsx'
import { personAsUser } from './homeFormat.js'

// The friends list itself lives in Social (tabs/social/SocialFriends.jsx).

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
