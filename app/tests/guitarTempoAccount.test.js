import { describe, expect, it, vi } from 'vitest'
import { readAccountTempo, writeAccountTempo } from '../src/tabs/guitar/song/tempoPreferences.js'

function account() {
  const user = { id: 'player', user_metadata: { guitar_tempos: { first: 65 } } }
  const client = { auth: {
    getUser: vi.fn(async () => ({ data: { user }, error: null })),
    updateUser: vi.fn(async ({ data }) => { user.user_metadata = { ...user.user_metadata, ...data }; return { error: null } }),
  } }
  return { user, client }
}
describe('account tempo preferences', () => {
  it('restores a tempo without transferring notation', async () => {
    const { client } = account()
    expect(await readAccountTempo(client, 'player', 'first')).toBe(65)
    expect(await readAccountTempo(client, 'player', 'missing')).toBe(null)
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })
  it('preserves different songs during concurrent saves and saves 100% explicitly', async () => {
    const { client, user } = account()
    await Promise.all([writeAccountTempo(client, 'player', 'first', 100), writeAccountTempo(client, 'player', 'second', 50)])
    expect(user.user_metadata.guitar_tempos).toEqual({ first: 100, second: 50 })
  })
  it('rejects invalid preferences without changing the stored value', async () => {
    const { client } = account()
    for (const value of [49, 101, 50.5, NaN]) await expect(writeAccountTempo(client, 'player', 'first', value)).rejects.toThrow('Tempo')
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })
  it('does not write a preference into a different signed-in account', async () => {
    const { client } = account()
    await expect(writeAccountTempo(client, 'other', 'first', 60)).rejects.toThrow('account changed')
    expect(client.auth.updateUser).not.toHaveBeenCalled()
    await writeAccountTempo(client, 'player', 'first', 75)
  })
})
