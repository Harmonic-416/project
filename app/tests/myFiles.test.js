import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  MAX_FILES,
  deleteMyFile,
  fileKind,
  formatSize,
  listMyFiles,
  loadMyFile,
  myFilesAvailable,
  rememberMyFile,
} from '../src/tabs/home/myFiles.js'

const bytes = (text) => new TextEncoder().encode(text).buffer
const tick = () => new Promise((r) => setTimeout(r, 3))

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

    const f1 = await loadMyFile('f1')
    expect(new TextDecoder().decode(f1.bytes)).toBe('<score/>')

    await deleteMyFile('f2')
    expect((await listMyFiles()).map((f) => f.id)).toEqual(['f1'])
    expect(await loadMyFile('f2')).toBeNull()
    await deleteMyFile('f1')
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
    await deleteMyFile('a')
    await deleteMyFile('b')
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