/* global __GUITAR_SONG_FILES__ */
import { titleFromFilename } from '../../vocal/notation/loadNotation.js'
import { loadMyFile } from '../../home/myFiles.js'
import { fingerprintBytes } from '../../vocal/share/sharedAttempt.js'
import { fetchCatalogSong, fetchCloudNotation } from '../../vocal/songs/cloudLibrary.js'
import { supabase } from '../../../lib/supabaseClient.js'

// Built-in guitar songs: every file in public/guitar-songs/ (string/fret data,
// so they show tab), listed by vite.config.js at dev start / build.
export const BUILT_IN_SONGS = __GUITAR_SONG_FILES__.map((filename) => ({
  id: filename,
  filename,
  title: titleFromFilename(filename),
})).sort((a, b) => a.title.localeCompare(b.title))

/**
 * A song's file from how a saved attempt or practice session names it: a
 * catalog song by id, else a built-in song or one of Home's "My files" by
 * fingerprint. { bytes, filename, options } for open(), or null when it
 * isn't on this device.
 */
export async function findSongFile({ songId, fingerprint }) {
  if (songId) {
    const song = await fetchCatalogSong(supabase, songId)
    if (!song) throw new Error('This catalog song is no longer available.')
    const bytes = await fetchCloudNotation(supabase, song)
    return { bytes, filename: `${song.title}.musicxml`, options: { title: song.title, catalogSongId: songId } }
  }
  for (const song of BUILT_IN_SONGS) {
    const response = await fetch(`${import.meta.env.BASE_URL}guitar-songs/${song.filename}`)
    if (!response.ok) continue
    const bytes = await response.arrayBuffer()
    if ((await fingerprintBytes(bytes)) === fingerprint) return { bytes, filename: song.filename, options: { builtin: true } }
  }
  const mine = await loadMyFile(fingerprint)
  return mine ? { bytes: mine.bytes, filename: mine.name, options: {} } : null
}
