/**
 * Songs you opened from a file (MusicXML, MIDI, Guitar Pro…), kept on this
 * device (IndexedDB) so Home can list them and open them again, even
 * offline. Opening the same file again just moves it to the top. Signed in,
 * each is also kept on the account, private to its owner (migration 0019,
 * src/lib/myFiles.ts), by whoever listens to onMyFilesChanged
 * (useMyFilesSync.js); this module never loads the Supabase layer.
 *
 *   file: { id, name, instrument: 'voice' | 'guitar', size, bytes: ArrayBuffer, added, opened }
 *
 * `id` is the file's fingerprint (SHA-256), which is also how a shared
 * attempt names a song that isn't in the catalog, so a friend's attempt can
 * find its song here.
 *
 * Each account has its own list on the device, and files opened while
 * signed out belong to the device itself (`DEVICE`): setMyFilesOwner says
 * whose list the calls below work on (useMyFilesSync.js keeps it in step
 * with the sign-in), and adoptDeviceFiles moves the device's files into an
 * account's list when someone signs in. Signing out deletes nothing: the
 * device's copies stay. Unit-tested in app/tests/myFiles.test.js.
 */

const DB = 'harmonic-files'
const STORE = 'files'
// 1: one list for the device, keyed by fingerprint. 2: a list per owner, keyed `<owner>/<fingerprint>`.
const VERSION = 2
/** Keep each list short; the oldest-opened files go first. */
export const MAX_FILES = 30
/** The owner of files opened while signed out. */
export const DEVICE = 'device'

let owner = DEVICE

/** Whose list the other calls work on: a user id, or null for the device's own. */
export function setMyFilesOwner(userId) {
  owner = userId || DEVICE
}

export const getMyFilesOwner = () => owner

const keyOf = (own, id) => `${own}/${id}`

function upgrade(request, oldVersion) {
  const db = request.result
  if (oldVersion < 1) {
    db.createObjectStore(STORE, { keyPath: 'key' }).createIndex('owner', 'owner')
    return
  }
  if (oldVersion < 2) {
    // Version 1 kept one list for the device, keyed by fingerprint: it becomes the device's list.
    const read = request.transaction.objectStore(STORE).getAll()
    read.onsuccess = () => {
      db.deleteObjectStore(STORE)
      const store = db.createObjectStore(STORE, { keyPath: 'key' })
      store.createIndex('owner', 'owner')
      for (const row of read.result) store.put({ ...row, key: keyOf(DEVICE, row.id), owner: DEVICE })
    }
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB, VERSION)
    request.onupgradeneeded = (event) => upgrade(request, event.oldVersion)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Run `work(store)` in one transaction; resolves to the result of the request it returns. */
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

/** A file without its contents (and without the store's own fields). */
const summary = ({ id, name, instrument, size, added, opened }) => ({ id, name, instrument, size, added, opened })

/** A stored row as the callers know a file. */
const asFile = ({ key: _key, owner: _owner, ...file }) => file

/** One owner's rows, most recently opened first. */
async function rowsOf(own) {
  const all = (await withStore('readonly', (store) => store.index('owner').getAll(own))) ?? []
  return all.sort((a, b) => b.opened - a.opened)
}

const getRow = (own, id) => withStore('readonly', (store) => store.get(keyOf(own, id)))

/** The current owner's files, most recently opened first, without the file contents. */
export async function listMyFiles() {
  if (!myFilesAvailable()) return []
  return (await rowsOf(owner)).map(summary)
}

/**
 * One file with its contents, or null. Signed in, a file opened on this
 * device while signed out is found too (it joins the account's list on the
 * next sign-in; see adoptDeviceFiles).
 */
export async function loadMyFile(id) {
  if (!myFilesAvailable() || !id) return null
  const mine = await getRow(owner, id)
  if (mine) return asFile(mine)
  if (owner !== DEVICE) {
    const device = await getRow(DEVICE, id)
    if (device) return asFile(device)
  }
  return null
}

/** Remember a file that was just opened (or bump it to the top). */
export async function rememberMyFile({ id, name, instrument, bytes }) {
  if (!myFilesAvailable() || !id) return
  const now = Date.now()
  const previous = await getRow(owner, id)
  const row = {
    key: keyOf(owner, id),
    id,
    owner,
    name,
    instrument,
    size: bytes.byteLength,
    bytes,
    added: previous?.added ?? now,
    opened: now,
  }
  await withStore('readwrite', (store) => store.put(row))
  await prune(owner)
  keepStorage()
  announce({ type: 'remembered', file: summary(row) })
}

export async function deleteMyFile(id) {
  if (!myFilesAvailable() || !id) return
  await withStore('readwrite', (store) => store.delete(keyOf(owner, id)))
  announce({ type: 'deleted', id })
}

/**
 * Signing in: the files opened on this device while signed out join the
 * account's list (on this device). A file already on both keeps the earlier
 * added and the later opened. Resolves to how many moved.
 */
export async function adoptDeviceFiles(userId) {
  if (!myFilesAvailable() || !userId) return 0
  const device = await rowsOf(DEVICE)
  for (const row of device) {
    const mine = await getRow(userId, row.id)
    const merged = {
      ...row,
      key: keyOf(userId, row.id),
      owner: userId,
      added: Math.min(row.added, mine?.added ?? row.added),
      opened: Math.max(row.opened, mine?.opened ?? 0),
    }
    await withStore('readwrite', (store) => {
      store.put(merged)
      return store.delete(row.key)
    })
  }
  if (device.length) await prune(userId)
  return device.length
}

async function prune(own) {
  const all = await rowsOf(own)
  for (const old of all.slice(MAX_FILES)) await withStore('readwrite', (store) => store.delete(old.key))
}

// ── Telling others ─────────────────────────────────────────────────────
// { type: 'remembered', file } or { type: 'deleted', id }, after the write.
// Kept apart from the account sync so this module (and its tests) never
// load the Supabase layer.
const listeners = new Set()

function announce(change) {
  for (const listener of listeners) listener(change)
}

/** Call `listener` after every remember or delete; returns a function that stops it. */
export function onMyFilesChanged(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// ── Keeping the files ──────────────────────────────────────────────────
// Browsers may evict a site's storage when the disk is tight (Safari also
// after a week without a visit, unless the app is installed). Persistent
// storage asks them not to; asked once, the first time a file is kept here,
// since Firefox puts the question to the user.
let persistAsked = false

function keepStorage() {
  if (persistAsked) return
  persistAsked = true
  try {
    globalThis.navigator?.storage?.persist?.()?.catch(() => {})
  } catch {
    // Not offered here: the files are still kept, just not guaranteed.
  }
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
