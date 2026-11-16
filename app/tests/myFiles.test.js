import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEVICE,
  MAX_FILES,
  adoptDeviceFiles,
  deleteMyFile,
  fileKind,
  formatSize,
  getMyFilesOwner,
  listMyFiles,
  loadMyFile,
  myFilesAvailable,
  onMyFilesChanged,
  rememberMyFile,
  setMyFilesOwner,
} from '../src/tabs/home/myFiles.js'

const bytes = (text) => new TextEncoder().encode(text).buffer
const tick = () => new Promise((r) => setTimeout(r, 3))
const ids = async () => (await listMyFiles()).map((f) => f.id)

afterEach(async () => {
  for (const owner of ['alice', 'bob', null]) {
    setMyFilesOwner(owner)
    for (const f of await listMyFiles()) await deleteMyFile(f.id)
  }
})

describe('My files on this device', () => {
  it('remembers, lists the latest first, reopens and deletes', async () => {
    expect(myFilesAvailable()).toBe(true)
    await rememberMyFile({ id: 'f1', name: 'song.musicxml', instrument: 'voice', bytes: bytes('<score/>') })
    await tick()
    await rememberMyFile({ id: 'f2', name: 'riff.gp5', instrument: 'guitar', bytes: bytes('gp') })

    const list = await listMyFiles()
    expect(list.map((f) => f.id)).toEqual(['f2', 'f1'])
    expect(list[0]).toMatchObject({ name: 'riff.gp5', instrument: 'guitar', size: 2 })
    expect(list[0]).not.toHaveProperty('bytes')
    expect(list[0]).not.toHaveProperty('owner')

    const f1 = await loadMyFile('f1')
    expect(new TextDecoder().decode(f1.bytes)).toBe('<score/>')
    expect(f1).not.toHaveProperty('key')

    await deleteMyFile('f2')
    expect(await ids()).toEqual(['f1'])
    expect(await loadMyFile('f2')).toBeNull()
  })

  it('opening a file again moves it to the top and keeps when it was added', async () => {
    await rememberMyFile({ id: 'a', name: 'a.mid', instrument: 'voice', bytes: bytes('a') })
    const added = (await loadMyFile('a')).added
    await tick()
    await rememberMyFile({ id: 'b', name: 'b.mid', instrument: 'voice', bytes: bytes('b') })
    await tick()
    await rememberMyFile({ id: 'a', name: 'a.mid', instrument: 'voice', bytes: bytes('a') })
    const list = await listMyFiles()
    expect(list.map((f) => f.id)).toEqual(['a', 'b'])
    expect(list[0].added).toBe(added)
    expect(list[0].opened).toBeGreaterThan(added)
  })

  it(`keeps only the ${MAX_FILES} most recent`, async () => {
    for (let i = 0; i < MAX_FILES + 2; i++) {
      await rememberMyFile({ id: `n${i}`, name: `${i}.mid`, instrument: 'voice', bytes: bytes(String(i)) })
      await tick()
    }
    const list = await listMyFiles()
    expect(list).toHaveLength(MAX_FILES)
    expect(list.some((f) => f.id === 'n0' || f.id === 'n1')).toBe(false)
  })

  it('ignores a file without a fingerprint', async () => {
    const before = (await listMyFiles()).length
    await rememberMyFile({ id: null, name: 'x.mid', instrument: 'voice', bytes: bytes('x') })
    expect(await listMyFiles()).toHaveLength(before)
    expect(await loadMyFile(null)).toBeNull()
  })

  it('formats sizes and kinds', () => {
    expect(formatSize(900)).toBe('900 B')
    expect(formatSize(214 * 1024)).toBe('214 KB')
    expect(formatSize(1.25 * 1024 * 1024)).toBe('1.3 MB')
    expect(fileKind('Ode.musicxml')).toBe('MusicXML')
    expect(fileKind('x.MXL')).toBe('MusicXML')
    expect(fileKind('a.midi')).toBe('MIDI')
    expect(fileKind('riff.gp5')).toBe('Guitar Pro')
    expect(fileKind('notes')).toBe('NOTES')
  })
})

describe('My files, per account', () => {
  it('keeps each account’s list apart from the device’s, and finds a device file while signed in', async () => {
    expect(getMyFilesOwner()).toBe(DEVICE)
    await rememberMyFile({ id: 'd1', name: 'device.mid', instrument: 'voice', bytes: bytes('d') })

    setMyFilesOwner('alice')
    expect(getMyFilesOwner()).toBe('alice')
    expect(await ids()).toEqual([])
    await rememberMyFile({ id: 'a1', name: 'alice.mid', instrument: 'voice', bytes: bytes('a') })
    expect(await ids()).toEqual(['a1'])
    // Opened here before signing in: still found (a shared attempt or Home may ask for it).
    expect((await loadMyFile('d1'))?.name).toBe('device.mid')

    setMyFilesOwner('bob')
    expect(await ids()).toEqual([])
    expect(await loadMyFile('a1')).toBeNull()

    setMyFilesOwner(null)
    expect(await ids()).toEqual(['d1'])
  })

  it('signing in adopts the device’s files, keeping the earliest added and the latest opened', async () => {
    await rememberMyFile({ id: 'shared', name: 'both.mid', instrument: 'voice', bytes: bytes('s') })
    const deviceAdded = (await loadMyFile('shared')).added
    await tick()
    await rememberMyFile({ id: 'only-device', name: 'mine.gp5', instrument: 'guitar', bytes: bytes('g') })

    setMyFilesOwner('alice')
    await tick()
    await rememberMyFile({ id: 'shared', name: 'both.mid', instrument: 'voice', bytes: bytes('s') })
    const aliceOpened = (await loadMyFile('shared')).opened
    expect(await adoptDeviceFiles('alice')).toBe(2)

    const list = await listMyFiles()
    expect(list.map((f) => f.id).sort()).toEqual(['only-device', 'shared'])
    const shared = list.find((f) => f.id === 'shared')
    expect(shared.added).toBe(deviceAdded)
    expect(shared.opened).toBe(aliceOpened)
    expect((await loadMyFile('only-device'))?.name).toBe('mine.gp5')

    setMyFilesOwner(null)
    expect(await ids()).toEqual([])
    expect(await adoptDeviceFiles('alice')).toBe(0)
  })

  it('announces what was remembered and deleted', async () => {
    const seen = []
    const stop = onMyFilesChanged((change) => seen.push(change))
    await rememberMyFile({ id: 'e1', name: 'e.mid', instrument: 'voice', bytes: bytes('e') })
    await deleteMyFile('e1')
    stop()
    await rememberMyFile({ id: 'e2', name: 'e2.mid', instrument: 'voice', bytes: bytes('e') })
    expect(seen).toHaveLength(2)
    expect(seen[0].type).toBe('remembered')
    expect(seen[0].file).toMatchObject({ id: 'e1', name: 'e.mid', instrument: 'voice', size: 1 })
    expect(seen[0].file).not.toHaveProperty('bytes')
    expect(seen[1]).toEqual({ type: 'deleted', id: 'e1' })
  })
})
