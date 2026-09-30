import type { SupabaseClient } from '@supabase/supabase-js'

/** Tasks 3.1–3.5 (F4, F9, F23, N3, N5): library, import, recordings. */

export interface Song {
  id: string
  user_id: string | null
  title: string
  artist: string | null
  instrument: 'guitar' | 'voice'
  notation_path: string
  created_at: string
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
 */
export async function importMusicXml(
  supabase: SupabaseClient,
  file: { name: string; content: string | Blob },
  meta: { title: string; artist?: string; instrument: 'guitar' | 'voice' },
): Promise<Song> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('Not authenticated')

  const text =
    typeof file.content === 'string' ? file.content : await file.content.text()
  if (!/<(score-partwise|score-timewise)[\s>]/.test(text)) {
    throw new Error('Not a valid MusicXML file (missing score-partwise/score-timewise root)')
  }

  const path = `${userData.user.id}/${crypto.randomUUID()}.musicxml`
  const { error: uploadError } = await supabase.storage
    .from('notation')
    .upload(path, text, { contentType: 'application/vnd.recordare.musicxml+xml' })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('song')
    .insert({
      user_id: userData.user.id,
      title: meta.title,
      artist: meta.artist ?? null,
      instrument: meta.instrument,
      notation_path: path,
    })
    .select()
    .single()
  if (error) throw error
  return data as Song
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
  return importMusicXml(supabase, { name: `${meta.title}.musicxml`, content: musicXml }, meta)
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
