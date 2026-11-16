import { useEffect, useState } from 'react'
import { deleteMyFileRecord, fetchMyFile, listMyFileRecords, mergeMyFiles, myFileStorageUsed } from '@backend/myFiles'
import { supabase } from '../../lib/supabaseClient.js'
import { fingerprintBytes } from '../vocal/share/sharedAttempt.js'
import { deleteMyFile, listMyFiles, rememberMyFile } from './myFiles.js'

/**
 * The files on this device (myFiles.js) and, signed in, the ones kept on the
 * account (src/lib/myFiles.ts) as one list, newest opened first, with how
 * much room the account has left. `version` (useMyFilesSync) goes up when
 * either list changed elsewhere, so they are read again. One reading of
 * "my files" for every place that lists them: Home's My Files and the
 * "My songs" on each instrument's Songs page (ui/MySongs.jsx).
 */
export function useMyFiles(userId, version) {
  const [state, setState] = useState({ files: null, error: null, usage: null })
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let live = true
    // The account's list is extra: if it can't be read, the device's files still show.
    const remote =
      userId && supabase
        ? listMyFileRecords(supabase).catch((err) => {
            console.error(err)
            return []
          })
        : Promise.resolve(null)
    const usage = userId && supabase ? myFileStorageUsed(supabase).catch(() => null) : Promise.resolve(null)
    Promise.all([listMyFiles(), remote, usage]).then(
      ([local, records, used]) => live && setState({ files: mergeMyFiles(local, records), error: null, usage: used }),
      (err) => {
        console.error(err)
        if (live) setState({ files: null, error: 'Could not read the files saved on this device.', usage: null })
      },
    )
    return () => {
      live = false
    }
  }, [userId, version, reloads])

  return {
    ...state,
    reload: () => {
      setState((s) => ({ ...s, error: null }))
      setReloads((n) => n + 1)
    },
    update: (change) => setState((s) => ({ ...s, files: s.files ? change(s.files) : s.files })),
  }
}

/**
 * A listed file that is only on the account: fetch it, check it is the file
 * its fingerprint says, and keep it on this device. Resolves to the bytes.
 */
export async function fetchAccountFile(file) {
  const bytes = await fetchMyFile(supabase, file.id)
  if ((await fingerprintBytes(bytes)) !== file.id) throw new Error('The kept file does not match its fingerprint')
  await rememberMyFile({ id: file.id, name: file.name, instrument: file.instrument, bytes })
  return bytes
}

/**
 * Remove a listed file: from this device (its removal reaches the account
 * through useMyFilesSync), or straight from the account when it isn't here.
 */
export async function removeListedFile(file) {
  if (file.local) await deleteMyFile(file.id)
  else await deleteMyFileRecord(supabase, file.id)
}

/** Where a removal takes the file from, for the question asked first. */
export function removalScope(file, signedIn) {
  return file.local ? (signedIn ? 'this device and your account' : 'this device') : 'your account'
}
