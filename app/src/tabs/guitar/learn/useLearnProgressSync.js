import { useEffect, useRef, useState } from 'react'
import { getGuitarProgress, mergeGuitarProgress, saveGuitarProgress } from '@backend/progress'
import { supabase } from '../../../lib/supabaseClient.js'
import { clearLocalProgress, readLocalProgress, writeLocalProgress } from './learnProgress.js'
import { onProgressSaved, setProgressSyncStatus } from './progressEvents.js'

/**
 * The Learn tab's progress on the player's account (migration 0013). The
 * lessons keep working in the browser (learnProgress.js); this hook, run
 * once for the whole app (App.jsx), ties that to whoever is signed in:
 *   - signing in: the browser's progress and the account's are merged
 *     (mergeGuitarProgress), and the result kept in both — so progress made
 *     before signing in joins the account, and another device's shows here;
 *   - every save while signed in: merged and written to the account again;
 *   - signing out: the browser's copy is cleared, so the next player starts
 *     fresh (it's safe on the account).
 * Account writes run one at a time, in order. Returns a number that goes up
 * whenever the browser's progress was replaced from the account, for the
 * Learn tab to show it.
 */
export function useLearnProgressSync(userId) {
  const [version, setVersion] = useState(0)
  const previousUser = useRef(userId)

  useEffect(() => {
    const was = previousUser.current
    previousUser.current = userId
    if (was && was !== userId) {
      clearLocalProgress()
      setVersion((v) => v + 1)
    }
  }, [userId])

  useEffect(() => {
    if (!userId || !supabase) return undefined
    let live = true
    let queue = Promise.resolve()
    const sync = () => {
      queue = queue
        .then(async () => {
          if (!live) return false
          setProgressSyncStatus(userId, 'saving')
          const remote = await getGuitarProgress(supabase)
          if (!live) return false
          const local = readLocalProgress()
          const merged = mergeGuitarProgress(local, remote)
          await saveGuitarProgress(supabase, merged, userId)
          if (!live) return false
          // A lesson may finish during the request. Its newer local result
          // must survive until the already-queued next sync writes it.
          const latest = mergeGuitarProgress(merged, readLocalProgress())
          writeLocalProgress(latest)
          setProgressSyncStatus(userId, 'saved')
          return JSON.stringify(latest) !== JSON.stringify(local)
        })
        .then((changed) => {
          if (live && changed) setVersion((v) => v + 1)
        })
        .catch((err) => {
          if (live) setProgressSyncStatus(userId, 'error')
          console.error('Could not save guitar progress to your account', err)
        })
    }
    sync()
    const stop = onProgressSaved(sync)
    return () => {
      live = false
      stop()
    }
  }, [userId])

  return version
}
