import type { SupabaseClient } from '@supabase/supabase-js'

/** Tasks 3.1–3.5 (F4, F9, F23, N3, N5): library, import, recordings. */

export interface Song {
  id: string
  user_id: string | null
  title: string
  artist: string | null
  instrument: 'guitar' | 'voice'
  notation_path: string
  /** The file it was imported from (migration 0004); null for seed songs and older imports. */
  source_path: string | null
  source_format: SourceFormat | null
  created_at: string
}

export type SourceFormat = 'midi' | 'musicxml' | 'mxl'

/** The original file behind an import, kept next to the canonical MusicXML. */
export interface SourceFile {
  data: ArrayBuffer | Uint8Array | Blob
  format: SourceFormat
}

const SOURCE_TYPES: Record<SourceFormat, { ext: string; contentType: string }> = {
  midi: { ext: 'mid', contentType: 'audio/midi' },
  musicxml: { ext: 'musicxml', contentType: 'application/vnd.recordare.musicxml+xml' },
  mxl: { ext: 'mxl', contentType: 'application/vnd.recordare.musicxml' },
}

/** F4: seed songs (user_id null) plus the caller's own imports. */
export async function listLibrary(supabase: SupabaseClient): Promise<Song[]> {
  const { data, error } = await supabase.from('song').select('*').order('created_at')
  if (error) throw error
  return (data ?? []) as Song[]
}

export async function getNotationUrl(supabase: SupabaseClient, song: Song): Promise<string> {
  const { data, error } = await supabase.storage
    .from('notation')
    .createSignedUrl(song.notation_path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

/**
 * F9: import a MusicXML file as a song owned by the caller.
 * Validation is minimal here (root element sniff); AlphaTab is the real
 * arbiter of renderability on the frontend.
 *
 * With `source` (e.g. the .mid the MusicXML was converted from), that file
 * is stored too, as `<user_id>/<song_id>.<ext>`. Either everything lands or
 * nothing does: a failed step removes what was already uploaded.
 */
export async function importMusicXml(
  supabase: SupabaseClient,
  file: { name: string; content: string | Blob },
  meta: { title: string; artist?: string; instrument: 'guitar' | 'voice' },
  source?: SourceFile,
): Promise<Song> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Not authenticated')

  const text =
    typeof file.content === 'string' ? file.content : await file.content.text()
  if (!/<(score-partwise|score-timewise)[\s>]/.test(text)) {
    throw new Error('Not a valid MusicXML file (missing score-partwise/score-timewise root)')
  }

  const songId = crypto.randomUUID()
  const path = `${userData.user.id}/${songId}.musicxml`
  const sourceType = source ? SOURCE_TYPES[source.format] : null
  if (source && !sourceType) throw new Error(`Unknown source format: ${source.format}`)
  const sourcePath = sourceType ? `${userData.user.id}/${songId}.source.${sourceType.ext}` : null

  const uploaded: string[] = []
  const rollback = async () => {
    if (uploaded.length) await supabase.storage.from('notation').remove(uploaded)
  }
  try {
    const { error: uploadError } = await supabase.storage
      .from('notation')
      .upload(path, text, { contentType: 'application/vnd.recordare.musicxml+xml' })
    if (uploadError) throw uploadError
    uploaded.push(path)

    if (source && sourceType && sourcePath) {
      // slice(): a Uint8Array may view a SharedArrayBuffer, which Blob won't take.
      const body =
        source.data instanceof Blob
          ? source.data
          : new Blob([source.data instanceof Uint8Array ? source.data.slice() : source.data])
      const { error: sourceError } = await supabase.storage
        .from('notation')
        .upload(sourcePath, body, { contentType: sourceType.contentType })
      if (sourceError) throw sourceError
      uploaded.push(sourcePath)
    }

    const { data, error } = await supabase
      .from('song')
      .insert({
        id: songId,
        user_id: userData.user.id,
        title: meta.title,
        artist: meta.artist ?? null,
        instrument: meta.instrument,
        notation_path: path,
        source_path: sourcePath,
        source_format: source?.format ?? null,
      })
      .select()
      .single()
    if (error) throw error
    return data as Song
  } catch (err) {
    await rollback().catch(() => {})
    throw err
  }
}

/** Short-lived signed URL for the file a song was imported from, or null if it has none. */
export async function getSourceUrl(supabase: SupabaseClient, song: Song): Promise<string | null> {
  if (!song.source_path) return null
  const { data, error } = await supabase.storage
    .from('notation')
    .createSignedUrl(song.source_path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

/**
 * F10: best-effort MIDI import — convert to MusicXML (the canonical stored
 * form) and store via the same path as a direct MusicXML import. Fails with
 * a clear error, leaving the library untouched, when conversion isn't
 * possible (MidiConversionError from midiToMusicXml).
 */
export async function importMidi(
  supabase: SupabaseClient,
  data: ArrayBuffer | Uint8Array,
  meta: { title: string; artist?: string; instrument: 'guitar' | 'voice' },
): Promise<Song> {
  const { midiToMusicXml } = await import('./midi')
  const musicXml = midiToMusicXml(data, meta.title)
  return importMusicXml(supabase, { name: `${meta.title}.musicxml`, content: musicXml }, meta, {
    data,
    format: 'midi',
  })
}

/**
 * F23/N3/N5: upload a COMPRESSED attempt recording (audio/webm;codecs=opus from
 * MediaRecorder — never raw PCM) into the private bucket under the owner's
 * folder, and link it to its run-through.
 */
export async function uploadRecording(
  supabase: SupabaseClient,
  runThroughId: string,
  blob: Blob,
  mimeType = 'audio/webm;codecs=opus',
): Promise<{ id: string; storage_path: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Not authenticated')

  const id = crypto.randomUUID()
  const path = `${userData.user.id}/${id}.webm`
  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(path, blob, { contentType: mimeType })
  if (uploadError) throw uploadError

  const { error } = await supabase.from('recording').insert({
    id,
    user_id: userData.user.id,
    run_through_id: runThroughId,
    storage_path: path,
    mime_type: mimeType,
    bytes: blob.size,
  })
  if (error) throw error
  return { id, storage_path: path }
}

/** Owner-only short-lived signed URL for playback from a run-through summary. */
export async function getRecordingUrl(supabase: SupabaseClient, storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('recordings')
    .createSignedUrl(storagePath, 60 * 10)
  if (error) throw error
  return data.signedUrl
}
