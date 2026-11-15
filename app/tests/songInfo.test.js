import { describe, expect, it } from 'vitest'
import { describeSong, infoFromMusicXml, lengthLabel, voicesThatFit } from '../src/tabs/vocal/songs/songInfo.js'

describe('song card facts', () => {
  it('names the voices that can sing a tune as written', () => {
    expect(voicesThatFit(62, 74)).toEqual(['Soprano', 'Alto']) // D4–D5
    expect(voicesThatFit(43, 60)).toEqual(['Bass']) // G2–C4
    expect(voicesThatFit(40, 84)).toEqual([]) // E2–C6: nobody
  })

  it('describes the range in note names', () => {
    const info = describeSong({ partCount: 1, tune: [67, 62, 74, 71] })
    expect(info.range).toMatchObject({ low: 62, high: 74 })
    expect(info.range.label).toMatch(/^D4–D5$/)
  })

  it('reads parts, tune pitches and bars from MusicXML', () => {
    const xml = `<score-partwise><part-list><score-part id="P1"/><score-part id="P2"/></part-list>
      <part id="P1"><measure number="1"><note><pitch><step>G</step><octave>4</octave></pitch></note></measure>
      <measure number="2"><note><pitch><step>F</step><alter>1</alter><octave>5</octave></pitch></note></measure></part>
      <part id="P2"><measure number="1"><note><pitch><step>C</step><octave>2</octave></pitch></note></measure></part></score-partwise>`
    const info = infoFromMusicXml(xml)
    expect(info).toMatchObject({ partCount: 2, bars: 2 })
    expect(info.range).toMatchObject({ low: 67, high: 78 }) // the second part's low C is not the tune
  })

  it('labels length by time when known, else by bars', () => {
    expect(lengthLabel({ seconds: 83.4 })).toBe('1:23')
    expect(lengthLabel({ seconds: null, bars: 24 })).toBe('24 bars')
    expect(lengthLabel({ seconds: null, bars: null })).toBeNull()
  })
})
