import { DIVISIONS_PER_QUARTER, quantizeTicksToGrid, ticksToDivisions, decomposeDuration } from './quantize.js'
import { midiNoteToPitch, keySignatureToFifths } from './pitch.js'

// Known simplifications (documented, not silent): only the first tempo/time
// signature/key signature event is used (no mid-piece changes); notes are
// assumed melodic-with-occasional-chords per track (true overlapping
// polyphony within one track isn't voice-separated); notes that cross a
// measure boundary are clipped rather than tied; clef is always treble.
// All are reasonable for "clean" input and are natural spots to improve
// later without touching the rest of the pipeline.

const XML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
`

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Group notes (already sorted by startDivision) that share an onset into chords. */
function groupIntoChords(sortedNotes) {
  const groups = []
  for (const note of sortedNotes) {
    const last = groups[groups.length - 1]
    if (last && last.startDivision === note.startDivision) {
      last.notes.push(note)
      last.endDivision = Math.max(last.endDivision, note.endDivision)
    } else {
      groups.push({ startDivision: note.startDivision, endDivision: note.endDivision, notes: [note] })
    }
  }
  return groups
}

function renderRestChunk({ divisions, type, dots }) {
  return `
      <note>
        <rest/>
        <duration>${divisions}</duration>
        <type>${type}</type>${dots ? '\n        <dot/>' : ''}
      </note>`
}

function renderChordChunk(notes, { divisions, type, dots }) {
  return notes
    .map((note, i) => {
      const { step, alter, octave } = midiNoteToPitch(note.midi)
      return `
      <note>${i > 0 ? '\n        <chord/>' : ''}
        <pitch>
          <step>${step}</step>${alter ? `\n          <alter>${alter}</alter>` : ''}
          <octave>${octave}</octave>
        </pitch>
        <duration>${divisions}</duration>
        <type>${type}</type>${dots ? '\n        <dot/>' : ''}
      </note>`
    })
    .join('')
}

/** Decompose a duration into notatable chunks, rendering + tracking each chunk's onset. */
function renderChunks(totalDivisions, cursorStart, renderOne) {
  let xml = ''
  const onsets = []
  let pos = cursorStart
  for (const chunk of decomposeDuration(totalDivisions)) {
    onsets.push(pos)
    xml += renderOne(chunk)
    pos += chunk.divisions
  }
  return { xml, onsets }
}

function buildPart(partId, groups, opts) {
  const { divisionsPerMeasure, measureCount, numerator, denominator, fifths, bpm, isFirstPart } = opts
  const measuresXml = []
  const onsets = []
  let groupIndex = 0

  for (let m = 0; m < measureCount; m++) {
    const measureStart = m * divisionsPerMeasure
    const measureEnd = measureStart + divisionsPerMeasure
    let cursor = measureStart
    let notesXml = ''

    while (cursor < measureEnd && groupIndex < groups.length && groups[groupIndex].startDivision < measureEnd) {
      const group = groups[groupIndex]
      if (group.startDivision > cursor) {
        const { xml, onsets: restOnsets } = renderChunks(group.startDivision - cursor, cursor, renderRestChunk)
        notesXml += xml
        onsets.push(...restOnsets)
        cursor = group.startDivision
      }
      const clippedEnd = Math.min(group.endDivision, measureEnd)
      const dur = clippedEnd - cursor
      if (dur > 0) {
        const { xml, onsets: noteOnsets } = renderChunks(dur, cursor, (chunk) => renderChordChunk(group.notes, chunk))
        notesXml += xml
        onsets.push(...noteOnsets)
      }
      cursor = clippedEnd
      groupIndex++ // clip-not-tie: any remainder past the barline is dropped
    }

    if (cursor < measureEnd) {
      const { xml, onsets: restOnsets } = renderChunks(measureEnd - cursor, cursor, renderRestChunk)
      notesXml += xml
      onsets.push(...restOnsets)
    }

    const attributes =
      m === 0
        ? `
      <attributes>
        <divisions>${DIVISIONS_PER_QUARTER}</divisions>
        <key><fifths>${fifths}</fifths></key>
        <time><beats>${numerator}</beats><beat-type>${denominator}</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>`
        : ''
    const direction =
      m === 0 && isFirstPart
        ? `
      <direction placement="above">
        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(bpm)}</per-minute></metronome></direction-type>
        <sound tempo="${Math.round(bpm)}"/>
      </direction>`
        : ''

    measuresXml.push(`    <measure number="${m + 1}">${attributes}${direction}${notesXml}
    </measure>`)
  }

  return { xml: `  <part id="${partId}">\n${measuresXml.join('\n')}\n  </part>`, onsets }
}

/**
 * Convert a parsed @tonejs/midi Midi object into MusicXML plus a parallel
 * playback schedule. Both are derived from the same quantized note groups
 * so Tone.js audio and the OSMD cursor can never drift apart: `cursorTimestamps`
 * is the exact ordered list of onsets (notes + rests) the XML renders, and
 * `playbackSchedule` uses the same time base (seconds, from a single tempo).
 */
export function midiToMusicXml(midi) {
  const ppq = midi.header.ppq
  const [numerator, denominator] = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
  const bpm = midi.header.tempos[0]?.bpm ?? 120
  const fifths = keySignatureToFifths(midi.header.keySignatures[0])
  const secondsPerDivision = 60 / bpm / DIVISIONS_PER_QUARTER
  const divisionsPerMeasure = Math.round(numerator * (4 / denominator) * DIVISIONS_PER_QUARTER)

  const tracks = midi.tracks.filter((t) => t.notes.length > 0)
  if (tracks.length === 0) {
    throw new Error('This MIDI file has no notes to convert.')
  }

  const quantizedTracks = tracks.map((track) => {
    const notes = track.notes
      .map((note) => {
        const startDivision = ticksToDivisions(quantizeTicksToGrid(note.ticks, ppq), ppq)
        let endDivision = ticksToDivisions(quantizeTicksToGrid(note.ticks + note.durationTicks, ppq), ppq)
        if (endDivision <= startDivision) endDivision = startDivision + 1
        return { midi: note.midi, name: note.name, startDivision, endDivision }
      })
      .sort((a, b) => a.startDivision - b.startDivision)
    return { name: track.name || track.instrument?.name || 'Track', notes }
  })

  const chordGroupsByTrack = quantizedTracks.map((t) => groupIntoChords(t.notes))

  const totalDivisions = Math.max(divisionsPerMeasure, ...chordGroupsByTrack.flat().map((g) => g.endDivision))
  const measureCount = Math.ceil(totalDivisions / divisionsPerMeasure)

  const parts = chordGroupsByTrack.map((groups, i) =>
    buildPart(`P${i + 1}`, groups, {
      divisionsPerMeasure,
      measureCount,
      numerator,
      denominator,
      fifths,
      bpm,
      isFirstPart: i === 0,
    }),
  )

  const partList = quantizedTracks
    .map((t, i) => `    <score-part id="P${i + 1}"><part-name>${escapeXml(t.name)}</part-name></score-part>`)
    .join('\n')

  const musicXml = `${XML_HEADER}<score-partwise version="4.0">
  <part-list>
${partList}
  </part-list>
${parts.map((p) => p.xml).join('\n')}
</score-partwise>
`

  const playbackSchedule = chordGroupsByTrack.flatMap((groups, trackIndex) =>
    groups.map((group) => ({
      trackIndex,
      pitches: group.notes.map((n) => n.name),
      time: group.startDivision * secondsPerDivision,
      duration: (group.endDivision - group.startDivision) * secondsPerDivision,
    })),
  )

  const cursorTimestamps = [...new Set(parts.flatMap((p) => p.onsets))]
    .sort((a, b) => a - b)
    .map((d) => d * secondsPerDivision)

  return { musicXml, playbackSchedule, cursorTimestamps, bpm }
}
