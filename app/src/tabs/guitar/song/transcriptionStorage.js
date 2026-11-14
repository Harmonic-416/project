import { draftsAvailable, saveDraft } from './drafts.js'

/** A full or blocked browser store must not discard a finished transcription. */
export async function keepTranscriptionCopy({ id, title, musicXml, about }) {
  const bytes = new TextEncoder().encode(musicXml).buffer
  if (!draftsAvailable()) return { bytes, kept: false }
  try {
    await saveDraft({ id, title, format: 'musicxml', bytes, about })
    return { bytes, kept: true }
  } catch {
    return { bytes, kept: false }
  }
}
