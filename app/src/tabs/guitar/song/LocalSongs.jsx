import SongCardMeta from '../../vocal/components/SongCardMeta.jsx'
import { titleFromFilename } from '../../vocal/notation/loadNotation.js'
import MySongs from '../../../ui/MySongs.jsx'

export const guitarSongMeta = (song) => <SongCardMeta song={song} instrument="guitar" />

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
      <h2 id="local-songs-title" className="song-library-heading">My songs</h2>
      <MySongs
        instrument="guitar"
        userId={userId}
        version={version}
        onOpen={open}
        onBeginOpen={onBeginOpen}
        renderMeta={guitarSongMeta}
        titleOf={titleFromFilename}
        emptyText="Scores you open are kept here. Use Open a score to add your first."
      />
    </section>
  )
}
