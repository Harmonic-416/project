import { describe, expect, it } from 'vitest'
import { findDo, tonicOfFifths, withSolfege } from '../src/tabs/vocal/notation/solfege.js'

/** One-part partwise MusicXML: measures of notes like 'C4', 'Eb4', 'F#4', 'r' (rest), each a quarter. */
function score(measures, { fifths = 0, mode = null, extra = {} } = {}) {
  const body = measures
    .map((notes, i) => {
      const key =
        i === 0 || notes.fifths !== undefined
          ? `<attributes>${i === 0 ? '<divisions>1</divisions>' : ''}<key><fifths>${notes.fifths ?? fifths}</fifths>${
              mode ? `<mode>${mode}</mode>` : ''
            }</key></attributes>`
          : ''
      const xml = (notes.notes ?? notes)
        .map((n, j) => {
          if (n === 'r') return '<note><rest/><duration>1</duration></note>'
          const [, step, acc, octave] = n.match(/^([A-G])(#|b)?(\d)$/)
          const alter = acc ? `<alter>${acc === '#' ? 1 : -1}</alter>` : ''
          return `<note>${extra[`${i}.${j}`] ?? ''}<pitch><step>${step}</step>${alter}<octave>${octave}</octave></pitch><duration>1</duration><type>quarter</type>${extra[`${i}.${j}.after`] ?? ''}</note>`
        })
        .join('')
      return `<measure number="${i + 1}">${key}${xml}</measure>`
    })
    .join('')
  return `<score-partwise><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`
}

const syllables = (xml) => [...xml.matchAll(/<note>[\s\S]*?<\/note>/g)].map((m) => m[0].match(/<text>(.*?)<\/text>/)?.[1] ?? '-')

describe('solfège', () => {
  it('names do from the key signature', () => {
    expect(tonicOfFifths(0)).toEqual({ pc: 0, letter: 'C', name: 'C' })
    expect(tonicOfFifths(-3)).toEqual({ pc: 3, letter: 'E', name: 'E♭' })
    expect(tonicOfFifths(6).name).toBe('F♯')
    expect(tonicOfFifths(-7).name).toBe('C♭')
  })

  it('sings a scale from do in any key', () => {
    const c = withSolfege(score([['C4', 'D4', 'E4', 'F4'], ['G4', 'A4', 'B4', 'C5']]))
    expect(syllables(c.content)).toEqual(['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do'])
    expect(c.doName).toBe('C')
    const eFlat = withSolfege(score([['Eb4', 'F4', 'G4', 'Ab4'], ['Bb4', 'C5', 'D5', 'Eb5']], { fifths: -3 }))
    expect(syllables(eFlat.content)).toEqual(['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do'])
    expect(eFlat.doName).toBe('E♭')
  })

  // A tune in C with one chromatic note at the end.
  const colour = (note) => score([['C4', 'D4', 'E4', 'F4'], ['G4', 'A4', 'B4', 'C5'], ['G4', 'E4', 'C4', note]])
  const last = (xml) => syllables(xml).at(-1)

  it('names chromatic notes by their spelling', () => {
    const spelled = { 'C#4': 'di', Db4: 'ra', 'D#4': 'ri', Eb4: 'me', 'F#4': 'fi', Gb4: 'se', 'G#4': 'si', Ab4: 'le', 'A#4': 'li', Bb4: 'te' }
    for (const [note, name] of Object.entries(spelled)) expect(last(withSolfege(colour(note)).content)).toBe(name)
  })

  it('falls back to di me fi le te when the spelling can’t be trusted (MIDI)', () => {
    const heard = { 'C#4': 'di', 'D#4': 'me', 'F#4': 'fi', 'G#4': 'le', 'A#4': 'te' }
    for (const [note, name] of Object.entries(heard)) {
      expect(last(withSolfege(colour(note), { trustSpelling: false }).content)).toBe(name)
    }
  })

  it('sings a minor key from la, with si for its raised seventh', () => {
    const tune = [['A3', 'C4', 'E4', 'A4'], ['G#4', 'A4', 'E4', 'A3']]
    const minor = withSolfege(score(tune, { mode: 'minor' }), { trustSpelling: false })
    expect(syllables(minor.content)).toEqual(['la', 'do', 'mi', 'la', 'si', 'la', 'mi', 'la'])
    expect(minor.doName).toBe('C')
  })

  it('finds do from the notes when the key signature doesn’t fit them', () => {
    // G major written with no key signature, as a MIDI file without one arrives.
    const tune = [['G4', 'A4', 'B4', 'C5'], ['D5', 'E5', 'F#5', 'G5'], ['F#5', 'D5', 'B4', 'G4']]
    expect(findDo(score(tune))).toMatchObject({ fifths: 1, written: false })
    expect(syllables(withSolfege(score(tune)).content).slice(0, 8)).toEqual(['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do'])
  })

  it('follows a key change', () => {
    const tune = [['C4', 'D4', 'E4', 'C4'], { fifths: 1, notes: ['G4', 'A4', 'B4', 'F#4'] }]
    expect(syllables(withSolfege(score(tune)).content)).toEqual(['do', 're', 'mi', 'do', 'do', 're', 'mi', 'ti'])
  })

  it('replaces the lyrics, skipping rests, chord tones and held ties', () => {
    const lyric = '<lyric number="1"><syllabic>single</syllabic><text>word</text></lyric>'
    const xml = score([['C4', 'E4', 'r', 'G4', 'G4']], {
      extra: {
        '0.0.after': lyric,
        '0.1': '<chord/>',
        '0.1.after': lyric,
        '0.3.after': '<tie type="start"/>' + lyric + '<play/>',
        '0.4.after': '<tie type="stop"/>' + lyric,
      },
    })
    const { content } = withSolfege(xml)
    expect(syllables(content)).toEqual(['do', '-', '-', 'so', '-'])
    expect(content).not.toContain('word')
    expect(content).toContain('<text>so</text></lyric><play/>')
  })

  it('leaves a score with nothing to sing alone', () => {
    const xml = score([['r', 'r']])
    expect(withSolfege(xml)).toEqual({ content: xml, doName: null })
  })
})
