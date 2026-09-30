import { parseMidi } from 'midi-file'

/**
 * Lyrics from a MIDI file, attached to the notes they're sung on.
 *
 * @tonejs/midi only keeps lyric events from the first track, so the raw
 * events are read again here with midi-file (the parser it uses). Lyrics
 * come from `lyrics` meta events; Soft Karaoke (.kar) files, which put the
 * syllables in `text` events and mark themselves with "@K…", are read too.
 *
 * Syllables follow the usual conventions: a trailing "-" continues the word,
 * leading/trailing spaces or "/" (new line) and "\" (new paragraph) start a
 * new one.
 */

/** midi-file decodes text byte-per-char (Latin-1); most modern files are UTF-8. */
function decodeText(raw) {
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0) & 0xff)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return raw
  }
}

/** Raw lyric events per MIDI track: [{ trackName, events: [{ ticks, text }] }]. */
export function readLyricStreams(arrayBuffer) {
  const data = parseMidi(new Uint8Array(arrayBuffer))
  const isKaraoke = data.tracks.some((track) => track.some((e) => e.type === 'text' && e.text?.startsWith('@K')))
  const hasLyricEvents = data.tracks.some((track) => track.some((e) => e.type === 'lyrics'))
  const wanted = (e) =>
    e.type === 'lyrics' || (!hasLyricEvents && isKaraoke && e.type === 'text' && !e.text.startsWith('@'))

  return data.tracks
    .map((track) => {
      let ticks = 0
      let trackName = ''
      const events = []
      for (const event of track) {
        ticks += event.deltaTime
        if (event.type === 'trackName') trackName = decodeText(event.text).trim()
        else if (wanted(event)) events.push({ ticks, text: decodeText(event.text) })
      }
      return { trackName, events }
    })
    .filter((stream) => stream.events.length > 0)
}

/**
 * Raw events → [{ ticks, text, syllabic }] with MusicXML syllabic values
 * (single | begin | middle | end). Events that are only spacing or line
 * markers end the previous word and are dropped.
 */
export function toSyllables(events) {
  const parsed = []
  let pendingBreak = false
  for (const { ticks, text: raw } of events) {
    const clean = raw.replace(/[\r\n]/g, ' ')
    const text = clean.replace(/^[\s/\\]+/, '').trim().replace(/-$/, '').trim()
    const breaksBefore = pendingBreak || /^[\s/\\]/.test(clean)
    if (!text) {
      if (parsed.length) parsed[parsed.length - 1].spaceAfter = true
      pendingBreak = true
      continue
    }
    pendingBreak = false
    parsed.push({ ticks, text, breaksBefore, spaceAfter: /\s$/.test(clean), hyphen: /-\s*$/.test(clean) })
  }

  // Files without any spacing convention put one whole word per event unless hyphenated.
  const spaced = parsed.some((s) => s.breaksBefore || s.spaceAfter)
  const endsWord = (i) => {
    const s = parsed[i]
    if (s.hyphen) return false
    if (!spaced || i === parsed.length - 1) return true
    return s.spaceAfter || parsed[i + 1].breaksBefore
  }

  return parsed.map((s, i) => {
    const starts = i === 0 || endsWord(i - 1)
    const ends = endsWord(i)
    const syllabic = starts ? (ends ? 'single' : 'begin') : ends ? 'end' : 'middle'
    return { ticks: s.ticks, text: s.text, syllabic }
  })
}

/**
 * Attach each lyric stream to the note track it fits best (the most note
 * onsets within `tolerance` ticks of a syllable — lyrics often live in their
 * own track, or with the melody but not in @tonejs/midi's split of it).
 * Returns one Map(noteIndex → { text, syllabic }) per entry of `tracks`.
 */
export function assignLyrics(tracks, streams, ppq) {
  const tolerance = Math.max(1, Math.round(ppq / 8))
  const result = tracks.map(() => new Map())

  const nearestNote = (notes, ticks) => {
    let best = -1
    let bestDistance = Infinity
    notes.forEach((note, i) => {
      const distance = Math.abs(note.ticks - ticks)
      if (distance <= tolerance && distance < bestDistance) {
        best = i
        bestDistance = distance
      }
    })
    return best
  }

  for (const stream of streams) {
    const syllables = toSyllables(stream.events)
    if (!syllables.length) continue
    let bestTrack = -1
    let bestHits = 0
    tracks.forEach((track, t) => {
      const nameMatch = stream.trackName && track.name?.trim() === stream.trackName
      const hits = syllables.filter((s) => nearestNote(track.notes, s.ticks) !== -1).length + (nameMatch ? 0.5 : 0)
      if (hits > bestHits) {
        bestHits = hits
        bestTrack = t
      }
    })
    if (bestTrack === -1) continue
    const notes = tracks[bestTrack].notes
    for (const syllable of syllables) {
      const i = nearestNote(notes, syllable.ticks)
      if (i !== -1 && !result[bestTrack].has(i)) {
        result[bestTrack].set(i, { text: syllable.text, syllabic: syllable.syllabic })
      }
    }
  }
  return result
}
