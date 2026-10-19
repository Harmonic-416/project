import { decomposeDuration } from '../../../vocal/midi/quantize.js'
import { GUITAR_CLEF, STANDARD_TUNING, staffDetails } from '../../notation/fretAssign.js'

/**
 * Notes on the song's beat grid → a MusicXML part, for the drafts made from
 * a recording. Unlike the shared MIDI → MusicXML converter (one voice,
 * notes cut at the next onset and at bar lines), this one keeps what an
 * arrangement needs:
 *   - two voices: the melody (voice 1, stems up) over the accompaniment
 *     (voice 2, stems down), joined with <backup>, so the bass rings under
 *     the tune;
 *   - ties, over bar lines and for lengths no single note value can write,
 *     so a held note is held, not cut short or struck again;
 *   - strings and frets when the events have them (and a capo), so
 *     addGuitarTab keeps the fingering; without them, addGuitarTab frets the
 *     part as it does any other.
 *
 *   event: { start, end (sixteenths from the start of bar 1), midi (as it
 *            sounds), string?, fret?, voice?: 1 | 2, lyric?: { text,
 *            syllabic } (written under its first note) }
 *
 * Pure; unit-tested in app/tests/scoreXml.test.js.
 */

export const SLOTS_PER_BEAT = 4 // sixteenths: the grid, and the <divisions> per quarter note

const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B']
const ALTERS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]

const FLAT_STEPS = ['C', 'D', 'D', 'E', 'E', 'F', 'G', 'G', 'A', 'A', 'B', 'B']

/** A pitch, its black keys spelled as sharps, or as flats in a flat key (`fifths` < 0). */
function pitchXml(midi, fifths = 0) {
  const pc = midi % 12
  if (!ALTERS[pc]) return `<pitch><step>${STEPS[pc]}</step><octave>${Math.floor(midi / 12) - 1}</octave></pitch>`
  return fifths < 0
    ? `<pitch><step>${FLAT_STEPS[pc]}</step><alter>-1</alter><octave>${Math.floor(midi / 12) - 1}</octave></pitch>`
    : `<pitch><step>${STEPS[pc]}</step><alter>1</alter><octave>${Math.floor(midi / 12) - 1}</octave></pitch>`
}

const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * A voice's events as successive groups: notes starting together sound
 * together until the longest of them ends, or the next group starts.
 */
function voiceGroups(events) {
  const byStart = new Map()
  for (const event of events) {
    if (!(event.end > event.start)) continue
    if (!byStart.has(event.start)) byStart.set(event.start, [])
    const group = byStart.get(event.start)
    if (!group.some((e) => e.midi === event.midi)) group.push(event)
  }
  const starts = [...byStart.keys()].sort((a, b) => a - b)
  return starts.map((start, i) => {
    const notes = byStart.get(start).sort((a, b) => a.midi - b.midi)
    return { start, end: Math.min(Math.max(...notes.map((n) => n.end)), starts[i + 1] ?? Infinity), notes }
  })
}

const lyricXml = ({ text, syllabic }) => `<lyric number="1"><syllabic>${syllabic}</syllabic><text>${escapeXml(text)}</text></lyric>`

function noteXml(note, { chord, chunk, voice, stem, tieStart, tieStop, fifths, lyric = null }) {
  const ties = `${tieStop ? '<tie type="stop"/>' : ''}${tieStart ? '<tie type="start"/>' : ''}`
  const tied = `${tieStop ? '<tied type="stop"/>' : ''}${tieStart ? '<tied type="start"/>' : ''}`
  const technical = note.string ? `<technical><string>${note.string}</string><fret>${note.fret}</fret></technical>` : ''
  const notations = tied || technical ? `<notations>${tied}${technical}</notations>` : ''
  return (
    `<note>${chord ? '<chord/>' : ''}${pitchXml(note.midi, fifths)}<duration>${chunk.divisions}</duration>${ties}` +
    `<voice>${voice}</voice><type>${chunk.type}</type>${'<dot/>'.repeat(chunk.dots)}${stem ? `<stem>${stem}</stem>` : ''}${notations}${lyric ? lyricXml(lyric) : ''}</note>`
  )
}

const restXml = (chunk, voice) =>
  `<note><rest/><duration>${chunk.divisions}</duration><voice>${voice}</voice><type>${chunk.type}</type>${'<dot/>'.repeat(chunk.dots)}</note>`

/** One voice's notes and rests from sixteenth `from` to `to` (one bar). `marks(slot)` gives what goes before a group starting there. */
function voiceXml(groups, from, to, { voice, stem, marks, fifths }) {
  let xml = ''
  let cursor = from
  const rest = (length) => {
    for (const chunk of decomposeDuration(length)) xml += restXml(chunk, voice)
  }
  for (const group of groups) {
    if (group.end <= from || group.start >= to) continue
    const start = Math.max(group.start, from)
    const end = Math.min(group.end, to)
    if (start > cursor) rest(start - cursor)
    if (group.start >= from) xml += marks(group.start)
    const chunks = decomposeDuration(end - start)
    chunks.forEach((chunk, i) => {
      const tieStop = i > 0 || group.start < from
      const tieStart = i < chunks.length - 1 || group.end > to
      group.notes.forEach((note, k) => {
        const lyric = i === 0 && k === 0 && group.start >= from ? (group.notes.find((n) => n.lyric)?.lyric ?? null) : null
        xml += noteXml(note, { chord: k > 0, chunk, voice, stem, tieStart, tieStop, fifths, lyric })
      })
    })
    cursor = end
  }
  if (cursor < to) rest(to - cursor)
  return xml
}

/**
 * A <part> (id `id`) of `measures` bars of `beatsPerBar` quarter notes.
 * `tab`: write the six-string tuning (and `capo`) — the events then carry
 * strings and frets. `harmonies`: [{ slot, xml }] chord names, put before
 * the accompaniment's note at (or after) each slot. `tempo` (BPM) is
 * written in bar 1. `clef` (MusicXML) and `fifths` (the key signature) are
 * the guitar's treble-8 clef and C major unless given.
 */
export function partXml(events, { id, beatsPerBar, measures, tab = false, capo = 0, harmonies = [], tempo = null, clef = GUITAR_CLEF, fifths = 0 }) {
  const perBar = beatsPerBar * SLOTS_PER_BEAT
  const voices = [1, 2].filter((v) => events.some((e) => (e.voice ?? 1) === v))
  if (!voices.length) voices.push(1)
  const groups = new Map(voices.map((v) => [v, voiceGroups(events.filter((e) => (e.voice ?? 1) === v))]))
  const markVoice = voices.at(-1)
  const pending = [...harmonies].sort((a, b) => a.slot - b.slot)
  // Chord names go on the voice that plays the chords, before the first group at or after their slot.
  const marksFor = (voice) => (slot) => {
    if (voice !== markVoice) return ''
    let xml = ''
    while (pending.length && pending[0].slot <= slot) xml += pending.shift().xml
    return xml
  }

  const bars = []
  for (let m = 0; m < measures; m += 1) {
    const from = m * perBar
    const to = from + perBar
    let body = ''
    if (m === 0) {
      body +=
        `<attributes><divisions>${SLOTS_PER_BEAT}</divisions><key><fifths>${fifths}</fifths></key>` +
        `<time><beats>${beatsPerBar}</beats><beat-type>4</beat-type></time>${clef}${tab ? staffDetails(STANDARD_TUNING, { capo }) : ''}</attributes>`
      if (tempo) {
        const bpm = Math.round(tempo)
        body += `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`
      }
    }
    voices.forEach((voice, i) => {
      if (i > 0) body += `<backup><duration>${perBar}</duration></backup>`
      const stem = voices.length > 1 ? (voice === 1 ? 'up' : 'down') : null
      body += voiceXml(groups.get(voice), from, to, { voice, stem, marks: marksFor(voice), fifths })
    })
    bars.push(`<measure number="${m + 1}">${body}</measure>`)
  }
  return `<part id="${id}">${bars.join('')}</part>`
}

/** A whole score from parts: [{ id, name, xml }] (xml from partXml). */
export function scoreXml(parts) {
  const list = parts.map(({ id, name }) => `<score-part id="${id}"><part-name>${escapeXml(name)}</part-name></score-part>`).join('')
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<score-partwise version="4.0"><part-list>${list}</part-list>${parts.map((p) => p.xml).join('')}</score-partwise>\n`
  )
}
