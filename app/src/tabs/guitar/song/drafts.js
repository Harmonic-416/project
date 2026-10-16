/**
 * Draft transcriptions kept on this device (IndexedDB), so a recording is
 * transcribed once and reopened from the library — "My transcriptions" —
 * until the player saves it somewhere for good (a Guitar Pro export, or
 * their library once uploads are per-user).
 *
 *   draft: { id, title, created, updated, format: 'musicxml' | 'guitar-pro', bytes: ArrayBuffer,
 *            about?: { isolated, heard } — how it was made (pipeline.js) }
 *
 * `id` is the recording's fingerprint, so transcribing the same file again
 * replaces its draft. Unit-tested in app/tests/drafts.test.js.
 */

const DB = 'harmonic-guitar'
const STORE = 'drafts'

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

/** Save (or replace) a draft; `created` is kept from the one it replaces. */
export async function saveDraft({ id, title, format, bytes, about = null }) {
  const now = Date.now()
  const previous = await loadDraft(id)
  await withStore('readwrite', (store) => store.put({ id, title, format, bytes, about, created: previous?.created ?? now, updated: now }))
}

/** One draft, or null. */
export async function loadDraft(id) {
  return (await withStore('readonly', (store) => store.get(id))) ?? null
}

/** Every draft's { id, title, updated }, the most recent first. */
export async function listDrafts() {
  const all = (await withStore('readonly', (store) => store.getAll())) ?? []
  return all.map(({ id, title, updated }) => ({ id, title, updated })).sort((a, b) => b.updated - a.updated)
}

export async function deleteDraft(id) {
  await withStore('readwrite', (store) => store.delete(id))
}

/** Whether drafts can be kept here at all (private windows, old browsers). */
export const draftsAvailable = () => typeof globalThis.indexedDB !== 'undefined'
