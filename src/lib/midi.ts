import { Midi } from '@tonejs/midi'

/**
 * Task 3.3 (F10): BEST-EFFORT MIDI → MusicXML transformation.
 *
 * Scope is deliberately modest (F10 is a "could"): the melody line of the
 * first track with notes, quantized to 16ths, becomes a single-part
 * score-partwise document that AlphaTab can render. Chords, multiple voices,
 * triplets, and percussion are out of scope — files relying on them should
 * fail with a clear error rather than produce a corrupt song.
 */

class MidiConversionError extends Error {}

const STEP_ALTER: ReadonlyArray<readonly [string, number]> = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
]

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function midiToMusicXml(data: ArrayBuffer | Uint8Array, title = 'Imported MIDI'): string {
  let midi: Midi
  try {
    midi = new Midi(data)
  } catch {
    throw new MidiConversionError('Could not parse this file as MIDI')
  }

  const track = midi.tracks.find((t) => t.notes.length > 0)
  if (!track) throw new MidiConversionError('MIDI file contains no notes')

  const ppq = midi.header.ppq
  const sixteenth = ppq / 4
  const ts = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
  const [beats, beatType] = [ts[0] ?? 4, ts[1] ?? 4]
  const ticksPerMeasure = ppq * beats * (4 / beatType)

  // Monophonic best-effort: sort by start, drop overlapping chord tones.
  const notes = [...track.notes].sort((a, b) => a.ticks - b.ticks)
  const line: { startTicks: number; durTicks: number; midi: number }[] = []
  let lineEnd = 0
  for (const n of notes) {
    const start = Math.round(n.ticks / sixteenth) * sixteenth
    if (start < lineEnd) continue // simultaneous/overlapping tone: skip
    const dur = Math.max(sixteenth, Math.round(n.durationTicks / sixteenth) * sixteenth)
    line.push({ startTicks: start, durTicks: dur, midi: n.midi })
    lineEnd = start + dur
  }
  if (line.length === 0) throw new MidiConversionError('No convertible melody line found')

  // Emit measures of <note> elements, inserting rests for gaps.
  const events: { durTicks: number; midi: number | null }[] = []
  let cursor = 0
  for (const n of line) {
    if (n.startTicks > cursor) events.push({ durTicks: n.startTicks - cursor, midi: null })
    events.push({ durTicks: n.durTicks, midi: n.midi })
    cursor = n.startTicks + n.durTicks
  }

  let body = ''
  let measure = 1
  let inMeasure = 0
  const openMeasure = () =>
    `    <measure number="${measure}">\n` +
    (measure === 1
      ? `      <attributes>\n        <divisions>${ppq}</divisions>\n` +
        `        <key><fifths>0</fifths></key>\n` +
        `        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>\n` +
        `        <clef><sign>G</sign><line>2</line></clef>\n      </attributes>\n`
      : '')

  body += openMeasure()
  for (const ev of events) {
    let remaining = ev.durTicks
    while (remaining > 0) {
      const room = ticksPerMeasure - inMeasure
      const slice = Math.min(remaining, room)
      if (ev.midi === null) {
        body += `      <note><rest/><duration>${slice}</duration></note>\n`
      } else {
        const [step, alter] = STEP_ALTER[ev.midi % 12]!
        const octave = Math.floor(ev.midi / 12) - 1
        body +=
          `      <note><pitch><step>${step}</step>` +
          (alter ? `<alter>${alter}</alter>` : '') +
          `<octave>${octave}</octave></pitch><duration>${slice}</duration></note>\n`
      }
      inMeasure += slice
      remaining -= slice
      if (inMeasure >= ticksPerMeasure) {
        body += `    </measure>\n`
        measure += 1
        inMeasure = 0
        body += openMeasure()
      }
    }
  }
  body += `    </measure>\n`

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<score-partwise version="3.1">\n` +
    `  <work><work-title>${xmlEscape(title)}</work-title></work>\n` +
    `  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>\n` +
    `  <part id="P1">\n${body}  </part>\n` +
    `</score-partwise>\n`
  )
}

export { MidiConversionError }
