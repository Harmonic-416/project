import { getNotationUrl, listLibrary } from '@backend/songs'

/**
 * Cloud side of the song library, on top of the shared backend layer
 * (src/lib/songs.ts at the repo root): the public catalog in the `song`
 * table, stored as MusicXML in the `notation` bucket's seed/ folder. The app
 * never uploads songs (copyright); the catalog is curated by the team, and it
 * is readable without signing in.
 */

/** Vocal catalog songs. */
export async function fetchCloudSongs(supabase) {
  const [songs, seedFiles] = await Promise.all([
    listLibrary(supabase),
    supabase.storage
      .from('notation')
      .list('seed')
      .then(({ data }) => new Set((data ?? []).map((object) => `seed/${object.name}`))),
  ])
  return songs
    .filter((song) => song.user_id === null && song.instrument === 'voice')
    .map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      // Seed rows point at files that are uploaded by hand (README step 5);
      // flag the ones that aren't there yet instead of failing on click.
      available: seedFiles.has(song.notation_path),
      song,
    }))
}

/** One catalog song by id (for a shared attempt), or null. */
export async function fetchCatalogSong(supabase, songId) {
  const songs = await listLibrary(supabase)
  return songs.find((song) => song.id === songId && song.user_id === null) ?? null
}

export async function fetchCloudNotation(supabase, song) {
  const url = await getNotationUrl(supabase, song)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not download the notation file (HTTP ${response.status}).`)
  return response.arrayBuffer()
}
