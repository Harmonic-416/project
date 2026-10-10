// Generates the built-in guitar songs as MusicXML with <staff-tuning> and
// string/fret on every note, so alphaTab draws tab from them:
//
//   - House of the Rising Sun (traditional, public domain): a beginner
//     fingerpicked arpeggio in 6/8 — single notes on paper that ring into
//     chords, the hard case for listening.
//   - Ode to Joy (Beethoven, public domain): the melody in open position,
//     one note at a time — the easy case for listening.
//   - Four-Chord Strum (Harmonic, original): Em–C–G–D strummed in quarter
//     notes — the chord case for listening.
//
// Writes the app's built-in copies (public/guitar-songs/) and the catalog
// seed files.
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
  Em: { bass: 6, frets: { 6: 0, 5: 2, 4: 2, 3: 0, 2: 0, 1: 0 } },
  G: { bass: 6, frets: { 6: 3, 5: 2, 4: 0, 3: 0, 2: 0, 1: 3 } },
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

// Ode to Joy in open position: E4 = string 1 open, F4 = 1/1, G4 = 1/3,
// D4 = 2/3, C4 = 2/1. Durations in quarter notes.
const ODE_POSITIONS = { E: [1, 0], F: [1, 1], G: [1, 3], D: [2, 3], C: [2, 1] }
const ODE_PHRASES = [
  ['E', 'E', 'F', 'G'],
  ['G', 'F', 'E', 'D'],
  ['C', 'C', 'D', 'E'],
  [['E', 1.5], ['D', 0.5], ['D', 2]],
  ['E', 'E', 'F', 'G'],
  ['G', 'F', 'E', 'D'],
  ['C', 'C', 'D', 'E'],
  [['D', 1.5], ['C', 0.5], ['C', 2]],
]

export function odeToJoyNotes() {
  const notes = []
  ODE_PHRASES.forEach((phrase, bar) => {
    phrase.forEach((item, index) => {
      const [name, quarters] = Array.isArray(item) ? item : [item, 1]
      const [string, fret] = ODE_POSITIONS[name]
      notes.push({ bar, index, string, fret, midi: TUNING[string] + fret, quarters })
    })
  })
  return notes
}

// Four-Chord Strum: Em C G D twice, four quarter-note strums per bar.
const STRUM_PROGRESSION = ['Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D']

/** One entry per strum: the chord's strings low to high. */
export function fourChordStrumBeats() {
  const beats = []
  STRUM_PROGRESSION.forEach((name, bar) => {
    const strings = Object.keys(CHORDS[name].frets)
      .map(Number)
      .sort((a, b) => b - a) // 6 … 1, low to high
    for (let index = 0; index < 4; index += 1) {
      beats.push({
        bar,
        index,
        chord: name,
        notes: strings.map((string) => {
          const fret = CHORDS[name].frets[string]
          return { string, fret, midi: TUNING[string] + fret }
        }),
      })
    }
  })
  return beats
}

// MusicXML durations for the type/dot combinations used here.
const TYPES = {
  0.5: { type: 'eighth', dot: false },
  1: { type: 'quarter', dot: false },
  1.5: { type: 'quarter', dot: true },
  2: { type: 'half', dot: false },
}

function noteXml({ string, fret, midi, duration = 1, type = 'eighth', dot = false, inChord = false }) {
  const step = STEPS[midi % 12]
  const alter = ALTERS[midi % 12]
  const octave = Math.floor(midi / 12) - 1
  return [
    '      <note>',
    inChord ? '        <chord/>' : null,
    `        <pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>`,
    `        <duration>${duration}</duration>`,
    '        <voice>1</voice>',
    `        <type>${type}</type>`,
    dot ? '        <dot/>' : null,
    alter ? '        <accidental>sharp</accidental>' : null,
    `        <notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations>`,
    '      </note>',
  ]
    .filter(Boolean)
    .join('\n')
}

/** First-bar attributes: guitar clef (treble, octave down), six-string standard tuning, tempo. */
function attributesXml({ divisions, fifths, mode, beats, beatType, tempo }) {
  return [
    '      <attributes>',
    `        <divisions>${divisions}</divisions>`,
    `        <key><fifths>${fifths}</fifths><mode>${mode}</mode></key>`,
    `        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>`,
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
    // Always a quarter-note mark: alphaTab 1.8 ignores <beat-unit-dot/> and
    // would add a second, wrong tempo.
    `        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type>`,
    `        <sound tempo="${tempo}"/>`,
    '      </direction>',
  ]
}

function harmonyXml(chordName) {
  return [
    '      <harmony>',
    `        <root><root-step>${chordName[0]}</root-step></root>`,
    // kind@text is the suffix printed after the root ("m" → Am), not the full name.
    chordName.endsWith('m') ? '        <kind text="m">minor</kind>' : '        <kind text="">major</kind>',
    '      </harmony>',
  ]
}

function scoreXml({ title, composer, arranger, measures }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <identification><creator type="composer">${composer}</creator><creator type="arranger">${arranger}</creator></identification>
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

export function houseOfTheRisingSunMusicXml() {
  const notes = houseOfTheRisingSunNotes()
  const measures = PROGRESSION.map((chordName, bar) => {
    const lines = [`    <measure number="${bar + 1}">`]
    // Quarter = 90 (= dotted quarter 60).
    if (bar === 0) lines.push(...attributesXml({ divisions: 2, fifths: 0, mode: 'minor', beats: 6, beatType: 8, tempo: 90 }))
    lines.push(...harmonyXml(chordName))
    for (const note of notes.filter((n) => n.bar === bar)) lines.push(noteXml(note))
    lines.push('    </measure>')
    return lines.join('\n')
  })
  return scoreXml({
    title: 'House of the Rising Sun',
    composer: 'Traditional',
    arranger: 'Harmonic (beginner arpeggio)',
    measures,
  })
}

export function odeToJoyMusicXml() {
  const notes = odeToJoyNotes()
  const measures = ODE_PHRASES.map((_, bar) => {
    const lines = [`    <measure number="${bar + 1}">`]
    if (bar === 0) lines.push(...attributesXml({ divisions: 2, fifths: 0, mode: 'major', beats: 4, beatType: 4, tempo: 100 }))
    for (const note of notes.filter((n) => n.bar === bar)) {
      lines.push(noteXml({ ...note, duration: note.quarters * 2, ...TYPES[note.quarters] }))
    }
    lines.push('    </measure>')
    return lines.join('\n')
  })
  return scoreXml({ title: 'Ode to Joy', composer: 'Ludwig van Beethoven', arranger: 'Harmonic (open-position melody)', measures })
}

export function fourChordStrumMusicXml() {
  const beats = fourChordStrumBeats()
  const measures = STRUM_PROGRESSION.map((chordName, bar) => {
    const lines = [`    <measure number="${bar + 1}">`]
    if (bar === 0) lines.push(...attributesXml({ divisions: 1, fifths: 1, mode: 'major', beats: 4, beatType: 4, tempo: 80 }))
    lines.push(...harmonyXml(chordName))
    for (const beat of beats.filter((b) => b.bar === bar)) {
      beat.notes.forEach((note, i) => lines.push(noteXml({ ...note, duration: 1, type: 'quarter', inChord: i > 0 })))
    }
    lines.push('    </measure>')
    return lines.join('\n')
  })
  return scoreXml({ title: 'Four-Chord Strum', composer: 'Harmonic', arranger: 'Harmonic (beginner strumming)', measures })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputs = [
    [houseOfTheRisingSunMusicXml(), ['seed/notation/house-of-the-rising-sun.musicxml', 'guitar-songs/house-of-the-rising-sun.musicxml']],
    [odeToJoyMusicXml(), ['seed/notation/ode-to-joy-guitar.musicxml', 'guitar-songs/ode-to-joy.musicxml']],
    [fourChordStrumMusicXml(), ['guitar-songs/four-chord-strum.musicxml']],
  ]
  for (const [xml, targets] of outputs) {
    for (const target of targets) {
      const relative = target.startsWith('seed/')
        ? `../../../supabase/${target}`
        : `../../../app/public/${target}`
      const path = fileURLToPath(new URL(relative, import.meta.url))
      writeFileSync(path, xml)
      console.log('wrote', path)
    }
  }
}
