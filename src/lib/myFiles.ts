import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The song files someone has opened, kept on the account (migration 0019):
 * a row per file (name, fingerprint, times) and the file itself in the
 * private `my-files` bucket at `<user id>/<fingerprint>`, owner-only. The
 * device keeps its own copies too (app/src/tabs/home/myFiles.js); Home lists
 * both as one, and a file only on the account is fetched when opened.
 */

export type FileInstrument = 'voice' | 'guitar'

/** A file as the device lists it: `id` is its SHA-256 fingerprint (hex); times in ms since the epoch. */
export interface DeviceFile {
  id: string
  name: string
  instrument: FileInstrument
  size: number
  added: number
  opened: number
}

/** What the account keeps about a file: the same, by fingerprint; `stored` once the file itself is in the bucket. */
export interface MyFileRecord {
  fingerprint: string
  name: string
  instrument: FileInstrument
  size: number
  added: number
  opened: number
  stored: boolean
}

/**
 * The account's list and this device's as one: `local` says whether the
 * file is on this device, `stored` whether the account has it (null when
 * signed out, i.e. no account list to compare with).
 */
export interface MergedFile extends DeviceFile {
  local: boolean
  stored: boolean | null
}

const BUCKET = 'my-files'

const FINGERPRINT = /^[0-9a-f]{64}$/
const COLUMNS = 'fingerprint, name, instrument, size, added_at, opened_at, stored_at'

/**
 * Pure: the device's files and the account's list as one list, newest
 * opened first. A file on both is one entry (the earliest added, the latest
 * opened, the device's name); one only on the account is `local: false`.
 * Without an account list (`remote` null, signed out) `stored` is null.
 */
export function mergeMyFiles(local: DeviceFile[], remote: MyFileRecord[] | null): MergedFile[] {
  const byId = new Map<string, MergedFile>()
  for (const file of local) byId.set(file.id, { ...file, local: true, stored: remote ? false : null })
  for (const record of remote ?? []) {
    const have = byId.get(record.fingerprint)
    if (have) {
      have.added = Math.min(have.added, record.added)
      have.opened = Math.max(have.opened, record.opened)
      have.stored = record.stored
    } else {
      byId.set(record.fingerprint, {
        id: record.fingerprint,
        name: record.name,
        instrument: record.instrument,
        size: record.size,
        added: record.added,
        opened: record.opened,
        local: false,
        stored: record.stored,
      })
    }
  }
  return [...byId.values()].sort((a, b) => b.opened - a.opened)
}

interface Row {
  fingerprint: string
  name: string
  instrument: FileInstrument
  size: number
  added_at: string
  opened_at: string
  stored_at: string | null
}

const fromRow = (row: Row): MyFileRecord => ({
  fingerprint: row.fingerprint,
  name: row.name,
  instrument: row.instrument,
  size: row.size,
  added: new Date(row.added_at).getTime(),
  opened: new Date(row.opened_at).getTime(),
  stored: row.stored_at !== null,
})

/** The signed-in user's list, newest opened first (row-level security: only their own). */
export async function listMyFileRecords(supabase: SupabaseClient): Promise<MyFileRecord[]> {
  const { data, error } = await supabase.from('my_file').select(COLUMNS).order('opened_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Row[]).map(fromRow)
}

/**
 * Put the device's files on the account's list, or refresh them. On a file
 * already listed the earliest added and latest opened win (a trigger). Files
 * without a proper fingerprint are skipped.
 */
export async function upsertMyFileRecords(supabase: SupabaseClient, files: DeviceFile[]): Promise<void> {
  const rows = files
    .filter((file) => FINGERPRINT.test(file.id) && (file.instrument === 'voice' || file.instrument === 'guitar'))
    .map((file) => ({
      fingerprint: file.id,
      name: (file.name || 'file').slice(0, 255),
      instrument: file.instrument,
      size: Math.max(0, Math.round(file.size)),
      added_at: new Date(file.added).toISOString(),
      opened_at: new Date(file.opened).toISOString(),
    }))
  if (rows.length === 0) return
  // user_id defaults to auth.uid(), and the conflict target includes it.
  const { error } = await supabase.from('my_file').upsert(rows, { onConflict: 'user_id,fingerprint' })
  if (error) throw error
}

async function userId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw error ?? new Error('Not signed in')
  return data.user.id
}

/**
 * Keep a file on the account: its row (as upsertMyFileRecords), then the
 * file itself, then `stored_at`. A file already in the bucket is the same
 * file (it is named by its fingerprint), so that counts as kept. Throws the
 * database's own message when the account is full.
 */
export async function storeMyFile(supabase: SupabaseClient, file: DeviceFile, bytes: ArrayBuffer | Uint8Array | Blob): Promise<void> {
  if (!FINGERPRINT.test(file.id)) throw new Error('Not a file fingerprint')
  const uid = await userId(supabase)
  await upsertMyFileRecords(supabase, [file])
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(`${uid}/${file.id}`, bytes, { contentType: 'application/octet-stream', upsert: false })
  if (uploadError && !/exists|duplicate/i.test(uploadError.message)) throw uploadError
  const { error } = await supabase
    .from('my_file')
    .update({ stored_at: new Date().toISOString() })
    .eq('fingerprint', file.id)
  if (error) throw error
}

/** The file itself, from the account (for a device that doesn't have it). */
export async function fetchMyFile(supabase: SupabaseClient, fingerprint: string): Promise<ArrayBuffer> {
  const uid = await userId(supabase)
  const { data, error } = await supabase.storage.from(BUCKET).download(`${uid}/${fingerprint}`)
  if (error) throw error
  return data.arrayBuffer()
}

/** How much the account keeps, and may: { files, usedBytes, maxFiles, maxBytes }. */
export async function myFileStorageUsed(
  supabase: SupabaseClient,
): Promise<{ files: number; usedBytes: number; maxFiles: number; maxBytes: number }> {
  const { data, error } = await supabase.rpc('my_file_storage_used').single()
  if (error) throw error
  const row = data as { files: number; used_bytes: number; max_files: number; max_bytes: number }
  return { files: row.files, usedBytes: Number(row.used_bytes), maxFiles: row.max_files, maxBytes: Number(row.max_bytes) }
}

/** Take a file off the account: the file and its row (a device that has it keeps its copy). */
export async function deleteMyFileRecord(supabase: SupabaseClient, fingerprint: string): Promise<void> {
  const uid = await userId(supabase)
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([`${uid}/${fingerprint}`])
  if (removeError) throw removeError
  const { error } = await supabase.from('my_file').delete().eq('fingerprint', fingerprint)
  if (error) throw error
}
