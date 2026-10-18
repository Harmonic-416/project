import { useCallback, useEffect, useState } from 'react'
import { getMyProfile, listFriends } from '@backend/friends'
import { listAttemptsSharedWithMe, listSentAttempts } from '@backend/attempts'
import { getLatestAttempt, listRecentAttempts } from '@backend/home'
import { supabase } from '../../lib/supabaseClient.js'

/**
 * Everything the signed-in Home page shows, loaded together and reloadable
 * by part after a change (a friend accepted, a comment posted…).
 *
 *   data: { profile, friends, inbox, sent, recent, latest } — each null while loading
 *   errors: { [part]: message }
 *   reload(part?) — one part, or all of them
 *
 * `parts` limits what's loaded (Social only needs profile + friends).
 */
const LOADERS = {
  profile: () => getMyProfile(supabase),
  friends: () => listFriends(supabase),
  inbox: () => listAttemptsSharedWithMe(supabase),
  sent: () => listSentAttempts(supabase),
  recent: () => listRecentAttempts(supabase),
  // false = no attempts yet (null means still loading).
  latest: async () => (await getLatestAttempt(supabase)) ?? false,
}

const ALL_PARTS = Object.keys(LOADERS)

const EMPTY = { profile: null, friends: null, inbox: null, sent: null, recent: null, latest: null }

export function useHomeData(userId, parts = ALL_PARTS) {
  const [data, setData] = useState(EMPTY)
  const [errors, setErrors] = useState({})

  const load = useCallback(async (part) => {
    try {
      const value = await LOADERS[part]()
      setData((previous) => ({ ...previous, [part]: value }))
      setErrors((previous) => ({ ...previous, [part]: null }))
    } catch (err) {
      console.error(err)
      setErrors((previous) => ({ ...previous, [part]: err.message || 'Could not load this.' }))
    }
  }, [])

  useEffect(() => {
    if (!userId || !supabase) return undefined
    // Home mounts this per signed-in user, so there's nothing stale to clear.
    let live = true
    for (const part of parts) {
      LOADERS[part]().then(
        (value) => live && setData((previous) => ({ ...previous, [part]: value })),
        (err) => {
          console.error(err)
          if (live) setErrors((previous) => ({ ...previous, [part]: err.message || 'Could not load this.' }))
        },
      )
    }
    return () => {
      live = false
    }
  }, [userId, parts]) // pass `parts` as a constant (defined outside the component)

  const reload = useCallback(
    (...which) => Promise.all((which.length ? which : parts).map((part) => load(part))),
    [load, parts],
  )

  return { data, errors, reload }
}