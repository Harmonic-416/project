import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'

const bytes = (text) => new TextEncoder().encode(text).buffer

/** What version 1 of the store kept: one list for the device, keyed by fingerprint. */
function seedVersion1() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('harmonic-files', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' })
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('files', 'readwrite')
      tx.objectStore('files').put({ id: 'old1', name: 'old.musicxml', instrument: 'voice', size: 6, bytes: bytes('<old/>'), added: 1000, opened: 2000 })
      tx.objectStore('files').put({ id: 'old2', name: 'riff.gp5', instrument: 'guitar', size: 2, bytes: bytes('gp'), added: 1500, opened: 3000 })
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
    request.onerror = () => reject(request.error)
  })
}

describe('My files, upgraded from the one-list store', () => {
  it('keeps the files as the device’s, and an account sees them only until it adopts them', async () => {
    await seedVersion1()
    const { adoptDeviceFiles, listMyFiles, loadMyFile, setMyFilesOwner } = await import('../src/tabs/home/myFiles.js')

    expect((await listMyFiles()).map((f) => f.id)).toEqual(['old2', 'old1'])
    expect(new TextDecoder().decode((await loadMyFile('old1')).bytes)).toBe('<old/>')
    expect(await loadMyFile('old1')).not.toHaveProperty('key')

    setMyFilesOwner('user-a')
    expect(await listMyFiles()).toEqual([])
    // Still found while signed in: it was opened here.
    expect((await loadMyFile('old1'))?.name).toBe('old.musicxml')

    expect(await adoptDeviceFiles('user-a')).toBe(2)
    expect((await listMyFiles()).map((f) => f.id)).toEqual(['old2', 'old1'])
    setMyFilesOwner(null)
    expect(await listMyFiles()).toEqual([])
  })
})
