// Generates the built-in guitar song: House of the Rising Sun (traditional,
// public domain) as a beginner fingerpicked arpeggio in 6/8, written as
// MusicXML with <staff-tuning> and string/fret on every note so alphaTab
// draws tab from it. Writes the catalog seed file and the app's built-in copy.
//
//   node tests/fixtures/guitar/generate.mjs
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Strings numbered like tab: 1 = high E4 … 6 = low E2 (standard tuning).
const TUNING = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 }

// Open-position shapes: string → fret. `bass` is the string picked first.
const CHORDS = {
  Am: { bass: 5, frets: { 5: 0, 4: 2, 3: 2, 2: 1, 1: 0 } },
  C: { bass: 5, frets: { 5: 3, 4: 2, 3: 0, 2: 1, 1: 0 } },
  D: { bass: 4, frets: { 4: 0, 3: 2, 2: 3, 1: 2 } },
  F: { bass: 4, frets: { 4: 3, 3: 2, 2: 1, 1: 1 } }, // small F, no barre
  E: { bass: 6, frets: { 6: 0, 5: 2, 4: 2, 3: 1, 2: 0, 1: 0 } },
}

// Verse: 16 bars, one chord per bar.
const PROGRESSION = ['Am', 'C', 'D', 'F', 'Am', 'C', 'E', 'E', 'Am', 'C', 'D', 'F', 'Am', 'E', 'Am', 'E']

// Six eighth notes per bar: bass, then strings 3-2-1-2-3.
const PATTERN = (bass) => [bass, 3, 2, 1, 2, 3]

const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B']
const ALTERS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]

export function houseOfTheRisingSunNotes() {
  const notes = []
  PROGRESSION.forEach((name, bar) => {
    const chord = CHORDS[name]
    PATTERN(chord.bass).forEach((string, index) => {
      const fret = chord.frets[string]
      notes.push({ bar, index, chord: name, string, fret, midi: TUNING[string] + fret })
    })
  })
  return notes
}

function noteXml({ string, fret, midi }) {
  const step = STEPS[midi % 12]
  const alter = ALTERS[midi % 12]
  const octave = Math.floor(midi / 12) - 1
  return [
    '      <note>',
    `        <pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>`,
    '        <duration>1</duration>',
    '        <voice>1</voice>',
    '        <type>eighth</type>',
    alter ? '        <accidental>sharp</accidental>' : null,
    `        <notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations>`,
    '      </note>',
  ]
    .filter(Boolean)
    .join('\n')
}

function measureXml(barNotes, bar) {
  const chordName = barNotes[0].chord
  const lines = [`    <measure number="${bar + 1}">`]
  if (bar === 0) {
    lines.push(
      '      <attributes>',
      '        <divisions>2</divisions>',
      '        <key><fifths>0</fifths><mode>minor</mode></key>',
      '        <time><beats>6</beats><beat-type>8</beat-type></time>',
      '        <clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>',
      '        <staff-details>',
      '          <staff-lines>6</staff-lines>',
      ...[6, 5, 4, 3, 2, 1].map((string, i) => {
        const midi = TUNING[string]
        return `          <staff-tuning line="${i + 1}"><tuning-step>${STEPS[midi % 12]}</tuning-step><tuning-octave>${Math.floor(midi / 12) - 1}</tuning-octave></staff-tuning>`
      }),
      '        </staff-details>',
      '      </attributes>',
      '      <direction placement="above">',
      // Quarter = 90 (= dotted quarter 60). Not written as a dotted-quarter
      // mark: alphaTab 1.8 ignores <beat-unit-dot/> and would add a second
      // tempo of quarter = 60.
      '        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type>',
      '        <sound tempo="90"/>',
      '      </direction>',
    )
  }
  lines.push(
    '      <harmony>',
    `        <root><root-step>${chordName[0]}</root-step></root>`,
    // kind@text is the suffix printed after the root ("m" → Am), not the full name.
    chordName.endsWith('m') ? '        <kind text="m">minor</kind>' : '        <kind text="">major</kind>',
    '      </harmony>',
  )
  for (const note of barNotes) lines.push(noteXml(note))
  lines.push('    </measure>')
  return lines.join('\n')
}

export function houseOfTheRisingSunMusicXml() {
  const notes = houseOfTheRisingSunNotes()
  const measures = PROGRESSION.map((_, bar) => measureXml(notes.filter((n) => n.bar === bar), bar))
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>House of the Rising Sun</work-title></work>
  <identification><creator type="composer">Traditional</creator><creator type="arranger">Harmonic (beginner arpeggio)</creator></identification>
  <part-list>
    <score-part id="P1">
      <part-name>Guitar</part-name>
      <score-instrument id="P1-I1"><instrument-name>Acoustic Guitar (steel)</instrument-name></score-instrument>
      <midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>26</midi-program></midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
${measures.join('\n')}
  </part>
</score-partwise>
`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const xml = houseOfTheRisingSunMusicXml()
  for (const target of [
    '../../../supabase/seed/notation/house-of-the-rising-sun.musicxml',
    '../../../app/public/guitar-songs/house-of-the-rising-sun.musicxml',
  ]) {
    const path = fileURLToPath(new URL(target, import.meta.url))
    writeFileSync(path, xml)
    console.log('wrote', path)
  }
}
