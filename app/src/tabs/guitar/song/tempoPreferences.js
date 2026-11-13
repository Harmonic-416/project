/** Account preferences for local files use fingerprints, never notation or audio. */
export async function readAccountTempo(client, userId, fingerprint) {
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (data.user?.id !== userId) throw new Error('Your account changed. Reopen the song to sync its tempo.')
  const value = data.user.user_metadata?.guitar_tempos?.[fingerprint]
  return Number.isInteger(value) && value >= 50 && value <= 100 ? value : null
}

// Serialize read/merge/write operations so a fast slider or a song switch
// cannot overwrite another preference in the same browser session.
let pending = Promise.resolve()
export function writeAccountTempo(client, userId, fingerprint, value) {
  if (!Number.isInteger(value) || value < 50 || value > 100) return Promise.reject(new Error('Tempo must be between 50% and 100%.'))
  const work = pending.catch(() => {}).then(async () => {
    const { data, error } = await client.auth.getUser()
    if (error) throw error
    if (data.user?.id !== userId) throw new Error('Your account changed. Reopen the song to sync its tempo.')
    const guitar_tempos = { ...data.user.user_metadata?.guitar_tempos, [fingerprint]: value }
    const result = await client.auth.updateUser({ data: { guitar_tempos } })
    if (result.error) throw result.error
  })
  pending = work
  return work
}
