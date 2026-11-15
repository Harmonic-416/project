// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { detectNotationFormat, loadNotation, NOTATION_ACCEPT } from '../src/tabs/vocal/notation/loadNotation.js'
import { MuseScoreImportError, museScoreToMusicXml } from '../src/tabs/vocal/notation/musescore/readMuseScore.js'
import { spellPitch } from '../src/tabs/vocal/notation/musescore/parseMscx.js'
import { orderedNotes, summarizeMusicXml } from './musicXmlSummary.js'

/**
 * The in-browser MuseScore importer against MuseScore 4's own MusicXML
 * export of the same files (tests/fixtures/musescore/, rebuilt by
 * make-fixtures.sh): same parts, measures, pitches and spellings, rhythms,
 * voices and lyrics, compared semantically rather than byte for byte.
 */

// Built from the path rather than new URL(…, import.meta.url), which Vite rewrites to an asset URL under jsdom.
const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/musescore')
const fixturePath = (name) => resolve(FIXTURE_DIR, name)
const bytes = (name) => new Uint8Array(readFileSync(fixturePath(name))).buffer
const text = (name) => readFileSync(fixturePath(name), 'utf8')
const encode = (s) => new TextEncoder().encode(s).buffer

const comparable = (n) => ({
  measure: n.measure,
  staff: n.staff,
  voice: n.voice,
  onset: n.onset,
  rest: n.rest,
  midi: n.midi,
  spelling: n.spelling,
  duration: n.duration,
  lyrics: n.lyrics,
})

const FIXTURES = [
  // [score, MuseScore's export, what it is]
  ['satb-features.mscz', 'satb-features.ref.musicxml', 'MuseScore 4 SATB + piano, repeats, key/time/tempo changes, triplets, ties'],
  ['hymn-ms3.mscx', 'hymn-ms3.ref.musicxml', 'MuseScore 3.02 closed-score hymn, two voices per staff, two verses'],
  ['amazing-grace.mscz', 'amazing-grace.ref.musicxml', 'MuseScore 4 file saved in the app, pickup and lyrics'],
  ['ode-to-joy.mscx', 'ode-to-joy.ref.musicxml', 'uncompressed MuseScore 4 .mscx'],
]

describe('MuseScore import matches MuseScore’s own MusicXML export', () => {
  for (const [score, reference, what] of FIXTURES) {
    it(`${score} (${what})`, async () => {
      const { musicXml } = await museScoreToMusicXml(bytes(score))
      const mine = summarizeMusicXml(musicXml)
      const ref = summarizeMusicXml(text(reference))

      expect(mine.map((p) => p.name)).toEqual(ref.map((p) => p.name))
      expect(mine.map((p) => p.measureCount)).toEqual(ref.map((p) => p.measureCount))
      mine.forEach((part, i) => {
        const a = orderedNotes(part.notes).map(comparable)
        const b = orderedNotes(ref[i].notes).map(comparable)
        // Pitch sequence and rhythm first, for a readable failure; then everything.
        expect(a.filter((n) => !n.rest).map((n) => n.midi)).toEqual(b.filter((n) => !n.rest).map((n) => n.midi))
        expect(a.map((n) => n.duration)).toEqual(b.map((n) => n.duration))
        expect(a.map((n) => n.lyrics)).toEqual(b.map((n) => n.lyrics))
        expect(a).toEqual(b)
      })
    })
  }
})

describe('MuseScore import keeps the markings singers read', () => {
  const doc = async (name) => new DOMParser().parseFromString((await museScoreToMusicXml(bytes(name))).musicXml, 'application/xml')
  const all = (d, selector) => [...d.querySelectorAll(selector)]

  it('SATB: clefs, keys, meters, tempo, dynamics, hairpin, repeats, endings, ties, slurs, tuplets, fermatas', async () => {
    const d = await doc('satb-features.mscz')
    const tenor = d.querySelector('part#P3')
    expect(tenor.querySelector('clef sign').textContent).toBe('G')
    expect(tenor.querySelector('clef clef-octave-change').textContent).toBe('-1')
    expect(d.querySelector('part#P4 clef sign').textContent).toBe('F')
    expect(d.querySelector('part#P5 staves').textContent).toBe('2')

    const soprano = d.querySelector('part#P1')
    expect(all(soprano, 'key fifths').map((n) => n.textContent)).toEqual(['1', '-2'])
    expect(all(soprano, 'time').map((t) => `${t.querySelector('beats').textContent}/${t.querySelector('beat-type').textContent}`)).toEqual(['4/4', '3/4', '6/8', '3/4'])
    expect(all(soprano, 'sound[tempo]').map((s) => Number(s.getAttribute('tempo')))).toEqual([90, 72])
    expect(all(soprano, 'dynamics > *').map((n) => n.tagName)).toEqual(['p', 'f'])
    expect(all(soprano, 'wedge').map((w) => w.getAttribute('type'))).toEqual(['crescendo', 'stop'])

    expect(soprano.querySelector('measure[number="0"]').getAttribute('implicit')).toBe('yes')
    expect(all(soprano, 'repeat').map((r) => r.getAttribute('direction'))).toEqual(['forward', 'backward'])
    expect(all(soprano, 'ending').map((e) => `${e.getAttribute('number')}:${e.getAttribute('type')}`)).toEqual([
      '1:start',
      '1:stop',
      '2:start',
      '2:discontinue',
    ])

    expect(all(soprano, 'tie').length).toBe(6) // A4 h.~q, and F5 h~q~h. across the barline
    expect(all(soprano, 'slur').map((s) => s.getAttribute('type'))).toEqual(['start', 'stop'])
    expect(all(soprano, 'time-modification actual-notes').map((n) => n.textContent)).toEqual(['3', '3', '3'])
    expect(all(soprano, 'tuplet').map((t) => t.getAttribute('type'))).toEqual(['start', 'stop'])
    expect(all(soprano, 'fermata').length).toBe(1)
    expect(all(soprano, 'breath-mark').length).toBe(1)
    // Two verses, the melisma under "toils" extended.
    expect(all(soprano, 'lyric[number="2"]').length).toBeGreaterThan(5)
    expect(all(soprano, 'lyric extend').length).toBe(2)
  })

  it('MuseScore 3: bass clef from the staff default, grace note, explicit natural, two-voice stems', async () => {
    const d = await doc('hymn-ms3.mscx')
    expect(d.querySelector('clef[number="2"] sign').textContent).toBe('F')
    expect(all(d, 'note grace').length).toBe(1)
    expect(all(d, 'accidental').map((a) => a.textContent)).toEqual(['natural'])
    expect(all(d, 'slur').length).toBe(2)
    expect(all(d, 'key fifths').map((n) => n.textContent)).toEqual(['2', '1'])
    const stems = new Set(all(d, 'note').filter((n) => n.querySelector('voice').textContent === '2' && n.querySelector('pitch')).map((n) => n.querySelector('stem')?.textContent))
    expect(stems).toEqual(new Set(['down']))
  })
})

// A minimal score in MuseScore 3/4 layout, for the cases fixtures don't cover.
function mscx({ version = '4.20', part = '', staves = '', extra = '' }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="${version}"><Score><Division>480</Division>${extra}
${part || '<Part><Staff id="1"/><trackName>Voice</trackName><Instrument><longName>Voice</longName></Instrument></Part>'}
${staves}
</Score></museScore>`
}
const chord = (pitch, tpc, type = 'quarter', inner = '') => `<Chord><durationType>${type}</durationType>${inner}<Note><pitch>${pitch}</pitch><tpc>${tpc}</tpc></Note></Chord>`
const measure = (content, attrs = '') => `<Measure${attrs}><voice>${content}</voice></Measure>`
const summary = async (source) => summarizeMusicXml((await museScoreToMusicXml(encode(source))).musicXml)

describe('MuseScore import edge cases', () => {
  it('spells pitches from the tonal pitch class', () => {
    expect(spellPitch(63, 11)).toEqual({ step: 'E', alter: -1, octave: 4 }) // E♭4, not D♯4
    expect(spellPitch(63, 23)).toEqual({ step: 'D', alter: 1, octave: 4 })
    expect(spellPitch(59, 7)).toEqual({ step: 'C', alter: -1, octave: 4 }) // C♭4 sounds as B3
    expect(spellPitch(60, 26)).toEqual({ step: 'B', alter: 1, octave: 3 }) // B♯3 sounds as C4
    expect(spellPitch(61, NaN)).toEqual({ step: 'C', alter: 1, octave: 4 }) // no tpc: sharps
  })

  it('skips unknown elements and excerpts nested inside the score', async () => {
    const source = mscx({
      staves: `<Staff id="1">${measure(`<TimeSig><sigN>2</sigN><sigD>4</sigD></TimeSig><FutureThing><x>1</x></FutureThing>${chord(60, 14)}<Harmony><root>14</root></Harmony>${chord(62, 16)}`)}</Staff>
        <Score><Part><Staff id="1"/><Instrument><longName>Excerpt</longName></Instrument></Part><Staff id="1">${measure(chord(72, 14, 'half'))}</Staff></Score>`,
    })
    const [part, ...rest] = await summary(source)
    expect(rest).toEqual([])
    expect(part.name).toBe('Voice')
    expect(part.notes.map((n) => n.midi)).toEqual([60, 62])
  })

  it('reads MuseScore 3 slurs written as voice-level spanners, and the instrument clef', async () => {
    const slurStart = '<Spanner type="Slur"><Slur/><next><location><fractions>1/4</fractions></location></next></Spanner>'
    const source = mscx({
      version: '3.01',
      part: '<Part><Staff id="1"/><trackName>Bass</trackName><Instrument><longName>Bass</longName><clef>F</clef></Instrument></Part>',
      staves: `<Staff id="1">${measure(`<TimeSig><sigN>2</sigN><sigD>4</sigD></TimeSig>${slurStart}${chord(48, 14, 'quarter', '<Lyrics><text>Ah</text><ticks>480</ticks></Lyrics>')}${chord(50, 16)}`)}</Staff>`,
    })
    const xml = (await museScoreToMusicXml(encode(source))).musicXml
    const d = new DOMParser().parseFromString(xml, 'application/xml')
    expect(d.querySelector('clef sign').textContent).toBe('F')
    expect([...d.querySelectorAll('slur')].map((s) => s.getAttribute('type'))).toEqual(['start', 'stop'])
    expect(d.querySelector('lyric extend')).not.toBeNull()
  })

  it('moves the clock with <location> and fills an empty staff with a bar rest', async () => {
    const source = mscx({
      part: '<Part><Staff id="1"/><Staff id="2"/><trackName>Piano</trackName><Instrument><longName>Piano</longName></Instrument></Part>',
      staves: `<Staff id="1">${measure(`<TimeSig><sigN>3</sigN><sigD>4</sigD></TimeSig>${chord(60, 14)}<location><fractions>1/4</fractions></location>${chord(64, 18)}`)}</Staff><Staff id="2"><Measure/></Staff>`,
    })
    const [part] = await summary(source)
    expect(part.notes.filter((n) => !n.rest).map((n) => [n.midi, n.onset])).toEqual([
      [60, 0],
      [64, 2],
    ])
    expect(part.notes.find((n) => n.rest && n.staff === 2)?.duration).toBe(3)
  })

  it('explains files it cannot read, ending with the export instruction', async () => {
    const hint = /File → Export/
    // MuseScore 2 and older use another layout.
    await expect(museScoreToMusicXml(encode(mscx({ version: '2.06' })))).rejects.toThrow(/MuseScore 2.*re-save/)
    await expect(museScoreToMusicXml(encode(mscx({ version: '2.06' })))).rejects.toThrow(hint)
    // Not a score at all, damaged XML, an empty score, a zip without a score.
    await expect(museScoreToMusicXml(encode('<?xml version="1.0"?><html/>'))).rejects.toThrow(MuseScoreImportError)
    await expect(museScoreToMusicXml(encode('<museScore version="4.20"><Score>'))).rejects.toThrow(/damaged/)
    await expect(museScoreToMusicXml(encode(mscx({ staves: `<Staff id="1">${measure('<Rest><durationType>measure</durationType><duration>4/4</duration></Rest>')}</Staff>` })))).rejects.toThrow(/no notes/)
    const zip = new JSZip()
    zip.file('readme.txt', 'hello')
    await expect(museScoreToMusicXml(await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow(/no score/)
    await expect(museScoreToMusicXml(new Uint8Array([0x50, 0x4b, 1, 2, 3]).buffer)).rejects.toThrow(hint)
  })
})

describe('loadNotation opens MuseScore files', () => {
  it('advertises .mscz and .mscx and detects them', () => {
    expect(NOTATION_ACCEPT).toContain('.mscz')
    expect(NOTATION_ACCEPT).toContain('.mscx')
    expect(detectNotationFormat('Song.MSCZ', new ArrayBuffer(0))).toBe('musescore')
    expect(detectNotationFormat('song.mscx', new ArrayBuffer(0))).toBe('musescore')
  })

  it('turns a .mscz into MusicXML with lyrics, keeping the original bytes', async () => {
    const source = bytes('amazing-grace.mscz')
    const loaded = await loadNotation(source, 'amazing-grace.mscz')
    expect(loaded.format).toBe('musescore')
    expect(loaded.title).toBe('Amazing Grace')
    expect(loaded.sourceBytes).toBe(source)
    expect(loaded.content).toContain('<score-partwise')
    expect(loaded.content).toContain('<lyric')
  })

  it('recognises MuseScore files under other names', async () => {
    expect((await loadNotation(bytes('amazing-grace.mscz'), 'amazing-grace.zip')).format).toBe('musescore')
    expect((await loadNotation(bytes('ode-to-joy.mscx'), 'ode.xml')).format).toBe('musescore')
  })

  it('still opens what MuseScore exports', async () => {
    for (const name of ['amazing-grace.mxl', 'amazing-grace.mid']) {
      const loaded = await loadNotation(bytes(name), name)
      expect(loaded.content).toContain('<lyric')
    }
  })
})
