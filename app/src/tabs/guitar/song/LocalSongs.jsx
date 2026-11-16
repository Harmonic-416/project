import GuitarFeedback from '../practice/GuitarFeedback.jsx'
import MySongs from '../../../ui/MySongs.jsx'

const feedback = ({ children, ...props }) => <GuitarFeedback {...props}>{children}</GuitarFeedback>

/**
 * "My songs" on Guitar's Songs page: the guitar files this person has
 * opened, on this device and (signed in) on their account, the same list
 * and the same component as Vocal's (ui/MySongs.jsx). Metadata is listed
 * first; a score's bytes are read only when the player opens it, and a slow
 * one never opens over a later choice (`onBeginOpen`).
 */
export default function LocalSongs({ onOpen, onBeginOpen, userId = null, version = 0 }) {
  const open = (file, request) => (request ? onOpen(file.bytes, file.name, { request }) : onOpen(file.bytes, file.name))
  return (
    <section className="guitar-song__local" aria-labelledby="local-songs-title">
      <h3 id="local-songs-title">My songs <span>{userId ? 'On this device and your account' : 'On this device'}</span></h3>
      <MySongs
        instrument="guitar"
        userId={userId}
        version={version}
        onOpen={open}
        onBeginOpen={onBeginOpen}
        renderNote={feedback}
        icon="♪"
        emptyText="Scores you open are kept here. Use Open a score to add your first."
      />
    </section>
  )
}
