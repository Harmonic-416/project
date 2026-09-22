import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getNotationUrl, importMidi, importMusicXml, listLibrary, type Song } from '../../src/lib/songs'
import { hasSupabaseEnv, newClient, newTestUser } from '../helpers'

// Tasks 3.1–3.4 (F4, F9, F10, N5) as an end-to-end round trip against the
// live Supabase project: MIDI bytes in → MusicXML in the private `notation`
// bucket plus a `song` row → readable back through an owner signed URL.
const fixtureDir = fileURLToPath(new URL('../fixtures/midi/', import.meta.url))
const musicXmlDir = fileURLToPath(new URL('../fixtures/musicxml/', import.meta.url))
const fixtures = readdirSync(fixtureDir)
  .filter((name) => /\.(mid|midi)$/i.test(name))
  .sort()

describe.skipIf(!hasSupabaseEnv)('song storage round trip (F4, F9, F10, N5)', () => {
  let owner: Awaited<ReturnType<typeof newTestUser>>
  let ownerId: string
  const imported: Song[] = []

  beforeAll(async () => {
    owner = await newTestUser('storage')
    const { data, error } = await owner.supabase.auth.getUser()
    if (error || !data.user) throw error ?? new Error('test user has no session')
    ownerId = data.user.id
  }, 30_000)

  it.each(fixtures)(
    'imports %s and reads the stored MusicXML back through a signed URL',
    async (file) => {
      const bytes = readFileSync(join(fixtureDir, file))
      const song = await importMidi(owner.supabase, bytes, { title: file, instrument: 'voice' })
      imported.push(song)

      expect(song.user_id).toBe(ownerId)
      expect(song.notation_path).toMatch(new RegExp(`^${ownerId}/[0-9a-f-]{36}\\.musicxml$`))

      const res = await fetch(await getNotationUrl(owner.supabase, song))
      expect(res.status).toBe(200)
      const xml = await res.text()
      expect(xml).toMatch(/<score-partwise[\s>]/)
      expect(xml).toContain(`<work-title>${file}</work-title>`)
      expect(xml).toContain('<pitch>')
    },
    30_000,
  )

  it('lists every import in the owner library next to the seed songs (F4)', async () => {
    const library = await listLibrary(owner.supabase)
    const ids = new Set(library.map((s) => s.id))
    for (const song of imported) expect(ids.has(song.id)).toBe(true)
    expect(library.some((s) => s.user_id === null)).toBe(true)
  })

  it('keeps imports private: another user sees none of them (N5)', async () => {
    const other = await newTestUser('storage-other')
    const library = await listLibrary(other.supabase)
    expect(library.filter((s) => s.user_id === ownerId)).toHaveLength(0)
  }, 30_000)

  it('refuses uploads from a signed-out client', async () => {
    const bytes = readFileSync(join(fixtureDir, fixtures[0]!))
    await expect(
      importMidi(newClient(), bytes, { title: 'anon', instrument: 'voice' }),
    ).rejects.toThrow(/session missing|not authenticated/i)
  })

  it('rejects a non-MIDI file without touching the library (F10)', async () => {
    const before = (await listLibrary(owner.supabase)).length
    const garbage = new TextEncoder().encode('definitely not a midi file')
    await expect(
      importMidi(owner.supabase, garbage, { title: 'garbage', instrument: 'voice' }),
    ).rejects.toThrow(/could not parse/i)
    expect((await listLibrary(owner.supabase)).length).toBe(before)
  })

  it('imports a MusicXML document byte-for-byte (F9)', async () => {
    const xml = readFileSync(join(musicXmlDir, 'ode-to-joy.musicxml'), 'utf8')
    const song = await importMusicXml(
      owner.supabase,
      { name: 'ode-to-joy.musicxml', content: xml },
      { title: 'Ode to Joy (test)', artist: 'Beethoven', instrument: 'voice' },
    )
    const res = await fetch(await getNotationUrl(owner.supabase, song))
    expect(await res.text()).toBe(xml)
  })

  it('reports which seed notation files exist in the bucket (README step 5)', async () => {
    const { data, error } = await owner.supabase.storage.from('notation').list('seed')
    expect(error).toBeNull()
    const present = (data ?? []).map((o) => o.name)
    console.log(
      `seed/ objects in notation bucket: ${present.length ? present.join(', ') : '(none uploaded yet)'}`,
    )
  })
})
