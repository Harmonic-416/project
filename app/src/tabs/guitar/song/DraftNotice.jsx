/**
 * Over a transcription: how it was made (`about`, from the pipeline: whether
 * the guitar was separated from a band, and how much of the song it plays
 * in). Older drafts don't say.
 */
export default function DraftNotice({ about }) {
  let text = 'Draft from a recording: the notes, rhythm and fingering are a best guess, so check it by ear.'
  if (about?.isolated) {
    const share = Math.round((about.heard ?? 0) * 100)
    text =
      `The guitar part, isolated from the full song${share ? ` (the guitar plays in about ${share}% of it)` : ''}. ` +
      'Other instruments can bleed into it, so check stray notes by ear.'
  } else if (about) {
    text = 'Transcribed from a recording of a guitar on its own: a best guess, so check it by ear.'
  }
  return (
    <div className="guitar-song__notice guitar-song__notice--info">
      <p>{text}</p>
    </div>
  )
}
