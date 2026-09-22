import { getNotationUrl, importMusicXml, listLibrary } from '@backend/songs'

/**
 * Cloud side of the song library, on top of the shared backend layer
 * (src/lib/songs.ts at the repo root): the `song` table plus the private
 * `notation` bucket, where every song is stored as MusicXML.
 */

/** Vocal songs visible to this user: voice seed songs plus their own imports. */
export async function fetchCloudSongs(supabase) {
  const [songs, seedFiles] = await Promise.all([
    listLibrary(supabase),
    supabase.storage
      .from('notation')
      .list('seed')
      .then(({ data }) => new Set((data ?? []).map((object) => `seed/${object.name}`))),
  ])
  return songs
    .filter((song) => song.instrument === 'voice')
    .map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      isSeed: song.user_id === null,
      // Seed rows point at files that are uploaded by hand (README step 5);
      // flag the ones that aren't there yet instead of failing on click.
      available: song.user_id !== null || seedFiles.has(song.notation_path),
      song,
    }))
}

export async function fetchCloudNotation(supabase, song) {
  const url = await getNotationUrl(supabase, song)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not download the notation file (HTTP ${response.status}).`)
  return response.arrayBuffer()
}

/** Store the loaded notation as MusicXML in the caller's own library. */
export function saveNotationToCloud(supabase, notation) {
  return importMusicXml(
    supabase,
    { name: `${notation.title}.musicxml`, content: notation.content },
    { title: notation.title, instrument: 'voice' },
  )
}
