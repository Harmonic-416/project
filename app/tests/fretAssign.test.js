import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addGuitarTab, assignFrets, octaveShiftFor, playableChord, STANDARD_TUNING } from '../src/tabs/guitar/notation/fretAssign.js'
import { loadGuitarNotation, scoreNotes } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { describeChanges, tabNotice } from '../src/tabs/guitar/notation/tabReport.js'
import { midiToMusicXml } from '../src/tabs/vocal/midi/midiToMusicXml.js'
import { parseMidiFile } from '../src/tabs/vocal/midi/parseMidi.js'

const bytesOf = (relativePath) => {
  const buffer = readFileSync(new URL(relativePath, import.meta.url))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

const pitchAt = ({ string, fret }) => STANDARD_TUNING[string - 1] + fret

describe('assignFrets', () => {
  it('puts every note where it sounds right', () => {
    const groups = [[60], [62], [64], [65], [67], [69], [71], [72]]
    const shapes = assignFrets(groups)
    shapes.forEach((shape, i) => expect(pitchAt(shape[0])).toBe(groups[i][0]))
  })

  it('plays a C major scale in open position', () => {
    const shapes = assignFrets([[48], [50], [52], [53], [55], [57], [59], [60]])
    for (const [{ fret }] of shapes) expect(fret).toBeLessThanOrEqual(3)
  })

  it('finds the open E minor shape', () => {
    const [shape] = assignFrets([[40, 47, 52, 55, 59, 64]])
    expect(shape.map(({ string, fret }) => [string, fret])).toEqual([
      [6, 0],
      [5, 2],
      [4, 2],
      [3, 0],
      [2, 0],
      [1, 0],
    ])
  })

  it('keeps chords within a four-fret stretch on separate strings', () => {
    const [shape] = assignFrets([[45, 52, 57, 61, 64]]) // A major
    expect(new Set(shape.map((p) => p.string)).size).toBe(5)
    const fretted = shape.filter((p) => p.fret > 0).map((p) => p.fret)
    expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(4)
  })

  it('stays in one place on the neck rather than jumping around', () => {
    // A high phrase: once up at the 7th position, it should stay there.
    const shapes = assignFrets([[71], [72], [74], [76], [74], [72], [71]])
    const hands = shapes.map(([{ fret }]) => fret)
    expect(Math.max(...hands) - Math.min(...hands)).toBeLessThanOrEqual(5)
  })

  it('gives up on notes the guitar cannot play, and carries on after them', () => {
    const shapes = assignFrets([[60], [30], [64], [40, 41, 42, 43, 44, 45, 46]])
    expect(shapes[0]).not.toBeNull()
    expect(shapes[1]).toBeNull()
    expect(pitchAt(shapes[2][0])).toBe(64)
    expect(shapes[3]).toBeNull() // seven notes, six strings
  })
})

describe('addGuitarTab', () => {
  it('adds strings, frets, a six-string tuning and the guitar clef to converted MIDI', async () => {
    const midi = await parseMidiFile(bytesOf('../../tests/fixtures/midi/twinkle.mid'))
    const { musicXml, tabbedParts } = addGuitarTab(midiToMusicXml(midi).musicXml)
    expect(tabbedParts).toBe(1)
    expect(musicXml).toContain('<staff-lines>6</staff-lines>')
    expect(musicXml).toContain('<clef-octave-change>-1</clef-octave-change>')
    const notes = (musicXml.match(/<note>[\s\S]*?<\/note>/g) ?? []).filter((n) => !n.includes('<rest'))
    expect(notes.every((n) => /<technical><string>\d<\/string><fret>\d+<\/fret><\/technical>/.test(n))).toBe(true)
  })

  it('fits a part the guitar can’t play as written, by octaves, and says so', async () => {
    const midi = await parseMidiFile(bytesOf('../../tests/fixtures/midi/synth_extreme_pitch_zero_dur.mid'))
    const { musicXml, tabbedParts, parts } = addGuitarTab(midiToMusicXml(midi).musicXml)
    expect(tabbedParts).toBe(1)
    expect(Number.isInteger(parts[0].octaveShift / 12)).toBe(true)
    expect(Math.abs(parts[0].octaveShift) + parts[0].foldedNotes).toBeGreaterThan(0) // something had to move
    expect(tabsOf(musicXml).every(Boolean)).toBe(true)
  })
})

// ── MusicXML from anywhere ─────────────────────────────────────────────────

/** A partwise score: parts [{ id, name, body }]. */
const score = (parts) =>
  `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list>${parts
    .map((p) => `<score-part id="${p.id}"><part-name>${p.name}</part-name></score-part>`)
    .join('')}</part-list>${parts.map((p) => `<part id="${p.id}">${p.body}</part>`).join('')}</score-partwise>`

/** A note, the way notation programs write one (attributes on <note>, a voice, a type). */
const note = (step, octave, { duration = 4, chord = false, voice = 1, tie, staff } = {}) =>
  `<note default-x="80" default-y="-15">${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch>` +
  `<duration>${duration}</duration>${tie ? `<tie type="${tie}"/>` : ''}<voice>${voice}</voice><type>quarter</type>` +
  `${staff ? `<staff>${staff}</staff>` : ''}${tie ? `<notations><tied type="${tie}"/></notations>` : ''}</note>`

const header = (extra = '') =>
  `<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>${extra}</attributes>`
const measure = (n, ...content) => `<measure number="${n}">${content.join('')}</measure>`
const backup = (duration) => `<backup><duration>${duration}</duration></backup>`

/** [{ string, fret } | null] for every note that isn't a rest, in order. */
const tabsOf = (xml) =>
  [...xml.matchAll(/<note\b[^>]*>[\s\S]*?<\/note>/g)]
    .filter(([n]) => !n.includes('<rest'))
    .map(([n]) => {
      const m = n.match(/<string>(\d)<\/string><fret>(\d+)<\/fret>/)
      return m ? { string: Number(m[1]), fret: Number(m[2]) } : null
    })
const pitchOf = (step, octave) => (octave + 1) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step]
const bytes = (xml) => new TextEncoder().encode(xml).buffer

describe('tab for MusicXML from anywhere', () => {
  it('frets notes written with attributes, as notation programs export them', () => {
    const xml = score([{ id: 'P1', name: 'Flute', body: measure(1, header(), note('E', 4), note('G', 4), note('B', 4), note('D', 5)) }])
    const { musicXml, parts } = addGuitarTab(xml)
    expect(parts).toMatchObject([{ id: 'P1', name: 'Flute', status: 'tabbed', octaveShift: 0, droppedNotes: 0 }])
    expect(tabsOf(musicXml).map(pitchAt)).toEqual([pitchOf('E', 4), pitchOf('G', 4), pitchOf('B', 4), pitchOf('D', 5)])
    expect(musicXml).toContain('<clef-octave-change>-1</clef-octave-change>')
    expect(musicXml).toContain('<staff-lines>6</staff-lines>')
  })

  it('frets two voices that sound together as one chord, never two notes on one string', () => {
    // G3 and A3 would each want the G string; played together they can't both have it.
    const body = measure(1, header(), note('A', 3, { duration: 16 }), backup(16), note('G', 3, { duration: 16, voice: 2 }))
    const tabs = tabsOf(addGuitarTab(score([{ id: 'P1', name: 'Piano', body }])).musicXml)
    expect(tabs.map(pitchAt)).toEqual([pitchOf('A', 3), pitchOf('G', 3)])
    expect(tabs[0].string).not.toBe(tabs[1].string)
  })

  it('keeps a tied-over note on the string and fret it started on', () => {
    // Up the neck, then a tie into open-position notes that would pull it down if it were fretted again.
    const body =
      measure(1, header(), note('B', 4), note('D', 5), note('E', 5), note('G', 4, { tie: 'start' })) +
      measure(2, note('G', 4, { tie: 'stop' }), note('E', 4), note('F', 4), note('E', 4))
    const tabs = tabsOf(addGuitarTab(score([{ id: 'P1', name: 'Lead', body }])).musicXml)
    expect(tabs[4]).toEqual(tabs[3])
    expect(pitchAt(tabs[4])).toBe(pitchOf('G', 4))
  })

  it('frets a transposing part at the pitch it sounds', async () => {
    // Guitar parts are usually written an octave above where they sound.
    const transpose = '<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>'
    const xml = score([{ id: 'P1', name: 'Guitar', body: measure(1, header(transpose), note('E', 3), note('A', 3), note('E', 5)) }])
    expect(tabsOf(addGuitarTab(xml).musicXml)).toEqual([
      { string: 6, fret: 0 },
      { string: 5, fret: 0 },
      { string: 1, fret: 0 },
    ])
    const notation = await loadGuitarNotation(bytes(xml), 'guitar.musicxml')
    expect(scoreNotes(notation.score).map((n) => n.realValue)).toEqual([40, 45, 64])
  })

  it('moves a line too high for the guitar down by whole octaves, notation included', () => {
    const body = measure(1, header(), note('C', 6), note('D', 6), note('E', 6), note('C', 5))
    const { musicXml, parts } = addGuitarTab(score([{ id: 'P1', name: 'Soprano', body }]))
    expect(parts[0]).toMatchObject({ octaveShift: -12, foldedNotes: 0 })
    expect(tabsOf(musicXml).map(pitchAt)).toEqual([pitchOf('C', 5), pitchOf('D', 5), pitchOf('E', 5), pitchOf('C', 4)])
    expect([...musicXml.matchAll(/<octave>(\d)<\/octave>/g)].map((m) => Number(m[1]))).toEqual([5, 5, 5, 4])
  })

  it('simplifies a chord no hand can fret, keeping its bass and top', () => {
    const chord = [
      ['C', 3],
      ['E', 3],
      ['G', 3],
      ['C', 4],
      ['E', 4],
      ['G', 4],
      ['C', 5],
    ]
    const body = measure(1, header(), ...chord.map(([step, octave], i) => note(step, octave, { duration: 16, chord: i > 0 })))
    const { musicXml, parts } = addGuitarTab(score([{ id: 'P1', name: 'Piano', body }]))
    expect(parts[0].droppedNotes).toBeGreaterThan(0)
    const tabs = tabsOf(musicXml)
    expect(tabs.map(pitchAt)).toContain(pitchOf('C', 3))
    expect(tabs.map(pitchAt)).toContain(pitchOf('C', 5))
    expect(new Set(tabs.map((t) => t.string)).size).toBe(tabs.length)
  })

  it('folds a piano’s two staves into one six-string staff', async () => {
    const twoStaves =
      '<attributes><divisions>4</divisions><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef>' +
      '<clef number="2"><sign>F</sign><line>4</line></clef></attributes>'
    const body = measure(1, twoStaves, note('E', 4, { duration: 16, staff: 1 }), backup(16), note('C', 3, { duration: 16, voice: 5, staff: 2 }))
    const xml = score([{ id: 'P1', name: 'Piano', body }])
    const { musicXml, parts } = addGuitarTab(xml)
    expect(parts[0]).toMatchObject({ status: 'tabbed', mergedStaves: 2 })
    expect(musicXml).not.toMatch(/<staves>|<staff>|number="2"/)
    const notation = await loadGuitarNotation(bytes(xml), 'piano.musicxml')
    expect(notation.score.tracks[0].staves).toHaveLength(1)
    expect(notation.hasTab).toBe(true)
  })

  it('keeps a voice’s timing as a rest when its note is left out (a unison)', async () => {
    const body = measure(1, header(), note('E', 4, { duration: 16 }), backup(16), note('E', 4, { duration: 16, voice: 2 }))
    const xml = score([{ id: 'P1', name: 'Choir', body }])
    const { musicXml, parts } = addGuitarTab(xml)
    expect(parts[0].droppedNotes).toBe(1)
    expect(musicXml).toContain('<rest/>')
    const notation = await loadGuitarNotation(bytes(xml), 'choir.musicxml')
    expect(scoreNotes(notation.score)).toHaveLength(1)
  })

  it('leaves percussion, skipped parts and a file’s own tab alone', () => {
    const drums = measure(
      1,
      '<attributes><divisions>4</divisions><clef><sign>percussion</sign></clef></attributes>',
      '<note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>4</duration></note>',
    )
    const xml = score([
      { id: 'P1', name: 'Drums', body: drums },
      { id: 'P2', name: 'Bass', body: measure(1, header(), note('E', 2)) },
    ])
    const { musicXml, parts } = addGuitarTab(xml, { skipParts: ['P2'] })
    expect(musicXml).toBe(xml)
    expect(parts.map((p) => p.status)).toEqual(['skipped', 'skipped'])
    const own = readFileSync(new URL('../public/guitar-songs/house-of-the-rising-sun.musicxml', import.meta.url), 'utf8')
    const kept = addGuitarTab(own)
    expect(kept.musicXml).toBe(own)
    expect(kept.parts.map((p) => p.status)).toEqual(['kept'])
  })
})

describe('fitting to the guitar', () => {
  it('shifts by whole octaves, the smallest shift that fits most notes', () => {
    expect(octaveShiftFor([60, 64, 67])).toBe(0)
    expect(octaveShiftFor([84, 86, 88])).toBe(-12)
    expect(octaveShiftFor([28, 31, 36])).toBe(12)
  })

  it('keeps every note of a chord that can be fretted, a unison once', () => {
    expect(playableChord([40, 47, 52, 55, 59, 64])).toEqual([40, 47, 52, 55, 59, 64]) // E minor
    expect(playableChord([52, 52, 55])).toEqual([52, 55])
  })
})

describe('what the player is told', () => {
  const part = (changes) => ({ id: 'P1', name: 'Voice', status: 'tabbed', octaveShift: 0, foldedNotes: 0, droppedNotes: 0, mergedStaves: 0, ...changes })

  it('describes each change in words', () => {
    expect(describeChanges(part({}))).toBe('')
    expect(describeChanges(part({ octaveShift: -12 }))).toBe('moved down an octave to fit the guitar')
    expect(describeChanges(part({ octaveShift: 24, foldedNotes: 1, mergedStaves: 2, droppedNotes: 3 }))).toBe(
      'moved up two octaves to fit the guitar, 1 note moved by an octave to stay on the neck, 2 staves merged into one, 3 notes left out of chords',
    )
  })

  it('lists the changed parts and the ones left as notation', () => {
    const tab = { generated: true, parts: [part({}), part({ name: 'Bass', octaveShift: 12 }), { ...part({}), name: 'Drums', status: 'skipped' }] }
    expect(tabNotice(tab)).toEqual({ generated: true, changes: ['Bass: moved up an octave to fit the guitar'], notationOnly: ['Drums'] })
    expect(tabNotice(undefined)).toEqual({ generated: false, changes: [], notationOnly: [] })
  })
})

describe('MIDI songs in the Guitar tab', () => {
  it('open with tab, every note at its own pitch', async () => {
    const notation = await loadGuitarNotation(bytesOf('../../tests/fixtures/midi/twinkle.mid'), 'twinkle.mid')
    expect(notation.hasTab).toBe(true)
    const midi = await parseMidiFile(bytesOf('../../tests/fixtures/midi/twinkle.mid'))
    const expected = midi.tracks.flatMap((t) => t.notes.map((n) => n.midi))
    expect(scoreNotes(notation.score).map((n) => n.realValue)).toEqual(expected)
  })
})
