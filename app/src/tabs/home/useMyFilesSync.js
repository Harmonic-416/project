import { useEffect, useLayoutEffect, useState } from 'react'
import { deleteMyFileRecord, listMyFileRecords, storeMyFile, upsertMyFileRecords } from '@backend/myFiles'
import { supabase } from '../../lib/supabaseClient.js'
import { adoptDeviceFiles, listMyFiles, loadMyFile, onMyFilesChanged, setMyFilesOwner } from './myFiles.js'

/**
 * Ties the song files kept on this device (myFiles.js) to whoever is signed
 * in, and keeps them on the account (migration 0019). Run once for the
 * whole app (App.jsx):
 *   - the list is per account on this device; signed out, it's the device's own;
 *   - signing in: files opened while signed out join the account's list here
 *     (adoptDeviceFiles), and every file on this device the account doesn't
 *     have yet is sent to it (the file itself, private to its owner), so it
 *     survives a cleared browser and opens on any device signed in;
 *   - every file remembered or removed while signed in goes the same way;
 *   - signing out deletes nothing.
 * Account writes run one at a time, in order; one that fails (the account
 * is full, offline) leaves the file on this device and is tried again at
 * the next sign-in. Returns a number that goes up whenever the lists
 * changed here, for Home to read them again.
 */
export function useMyFilesSync(userId) {
  const [version, setVersion] = useState(0)

  // Before the tabs' own effects run, so a file they open is filed under the right owner.
  useLayoutEffect(() => {
    setMyFilesOwner(userId)
  }, [userId])

  useEffect(() => {
    if (!userId) return undefined
    let live = true
    let queue = Promise.resolve()
    const changed = () => live && setVersion((v) => v + 1)
    const run = (task) => {
      queue = queue.then(task).catch((err) => console.error('Could not keep your song file on your account', err))
    }
    // Fingerprints the account already has the file for: opening one of
    // those again only moves it up the account's list, without sending it.
    const stored = new Set()
    const store = async (summary) => {
      if (stored.has(summary.id)) return upsertMyFileRecords(supabase, [summary])
      const file = await loadMyFile(summary.id)
      if (!file || !live) return
      await storeMyFile(supabase, summary, file.bytes)
      stored.add(summary.id)
      changed()
    }
    run(async () => {
      const moved = await adoptDeviceFiles(userId)
      if (moved) changed()
      if (!supabase || !live) return
      for (const record of await listMyFileRecords(supabase)) if (record.stored) stored.add(record.fingerprint)
      for (const file of await listMyFiles()) {
        if (!stored.has(file.id)) run(() => store(file))
      }
    })
    const stop = onMyFilesChanged((change) => {
      if (!supabase) return
      run(() => (change.type === 'deleted' ? deleteMyFileRecord(supabase, change.id).then(() => {
              stored.delete(change.id)
              changed()
            }) : store(change.file)))
    })
    return () => {
      live = false
      stop()
    }
  }, [userId])

  return version
}
