/**
 * Songs you opened from a file (MusicXML, MIDI, Guitar Pro…), kept on this
 * device (IndexedDB) so Home can list them and open them again. Nothing is
 * uploaded: like the rest of the app, song files never leave the device
 * (migration 0004). Opening the same file again just moves it to the top.
 *
 *   file: { id, name, instrument: 'voice' | 'guitar', size, bytes: ArrayBuffer, added, opened }
 *
 * `id` is the file's fingerprint (SHA-256), which is also how a shared
 * attempt names a song that isn't in the catalog, so a friend's attempt can
 * find its song here. Unit-tested in app/tests/myFiles.test.js.
 */

const DB = 'harmonic-files'
const STORE = 'files'
/** Keep the list short; the oldest-opened files go first. */
export const MAX_FILES = 30

function openDb() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, work) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const result = work(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(result?.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

export const myFilesAvailable = () => typeof globalThis.indexedDB !== 'undefined'

/** Most recently opened first, without the file contents. */
export async function listMyFiles() {
  if (!myFilesAvailable()) return []
  const all = (await withStore('readonly', (store) => store.getAll())) ?? []
  return all
    .map(({ id, name, instrument, size, added, opened }) => ({ id, name, instrument, size, added, opened }))
    .sort((a, b) => b.opened - a.opened)
}

/** One file with its contents, or null. */
export async function loadMyFile(id) {
  if (!myFilesAvailable() || !id) return null
  return (await withStore('readonly', (store) => store.get(id))) ?? null
}

/** Remember a file that was just opened (or bump it to the top). */
export async function rememberMyFile({ id, name, instrument, bytes }) {
  if (!myFilesAvailable() || !id) return
  const now = Date.now()
  const previous = await loadMyFile(id)
  await withStore('readwrite', (store) =>
    store.put({
      id,
      name,
      instrument,
      size: bytes.byteLength,
      bytes,
      added: previous?.added ?? now,
      opened: now,
    }),
  )
  const all = await listMyFiles()
  for (const old of all.slice(MAX_FILES)) await deleteMyFile(old.id)
}

export async function deleteMyFile(id) {
  if (!myFilesAvailable()) return
  await withStore('readwrite', (store) => store.delete(id))
}

/** "214 KB", "1.2 MB". */
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "MusicXML", "MIDI"… from the file name. */
export function fileKind(name) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'mid' || ext === 'midi') return 'MIDI'
  if (ext === 'musicxml' || ext === 'xml' || ext === 'mxl') return 'MusicXML'
  if (ext?.startsWith('gp')) return 'Guitar Pro'
  if (ext === 'alphatex' || ext === 'atex') return 'alphaTex'
  return ext ? ext.toUpperCase() : 'File'
}