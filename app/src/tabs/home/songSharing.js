import { getSharedAttemptSong, listMyFileRecords, storeMyFile } from '@backend/myFiles'
import { loadMyFile, rememberMyFile } from './myFiles.js'

/**
 * A take sent to a friend brings its song (migration 0020): the friend may
 * read the sender's stored file for that song, so it opens for them without
 * their own copy. The two halves of that, shared by Vocal and Guitar:
 *
 *   - sending: make sure the song's file really is on the sender's account
 *     (keepSongOnAccount), since useMyFilesSync sends files in the
 *     background and may not have got to this one, or couldn't;
 *   - opening: fetch the sender's file and keep it as one of the opener's
 *     own (fetchSongOfAttempt).
 *
 * A catalog or built-in song needs neither: both people already have it.
 */

/**
 * Is this song's file on the signed-in user's account, sending it now if it
 * isn't? `fingerprint` names the file (its SHA-256). False when it can't be
 * kept (not on this device to send, the account is full, the file is over
 * the size limit, offline): the take can still go, but the friend will need
 * their own copy.
 */
export async function keepSongOnAccount(supabase, fingerprint) {
  if (!supabase || !fingerprint) return false
  try {
    const records = await listMyFileRecords(supabase)
    if (records.some((record) => record.fingerprint === fingerprint && record.stored)) return true
    const file = await loadMyFile(fingerprint)
    if (!file) return false
    const { bytes, ...summary } = file
    await storeMyFile(supabase, summary, bytes)
    return true
  } catch (err) {
    console.error('Could not keep the song on your account', err)
    return false
  }
}

/**
 * The song of an attempt someone sent you, from their account: { bytes,
 * name }, or null when they don't keep it online (or it can't be fetched,
 * or isn't the file the attempt names — src/lib/myFiles.ts checks the
 * fingerprint). The file joins your own files (this device, and your
 * account through useMyFilesSync), so it is in your library from then on.
 */
export async function fetchSongOfAttempt(supabase, attempt) {
  if (!supabase || !attempt?.id || attempt.song_id || !attempt.song_fingerprint) return null
  try {
    const song = await getSharedAttemptSong(supabase, attempt.id)
    if (!song || song.fingerprint !== attempt.song_fingerprint) return null
    try {
      await rememberMyFile({ id: song.fingerprint, name: song.name, instrument: song.instrument, bytes: song.bytes })
    } catch (err) {
      // The song still opens; it just isn't kept (a browser without storage).
      console.error(err)
    }
    return { bytes: song.bytes, name: song.name }
  } catch (err) {
    console.error('Could not fetch the song stored with this attempt', err)
    return null
  }
}
