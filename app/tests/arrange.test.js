import { describe, expect, it } from 'vitest'
import { VOICINGS, arrangeSong, bestShift, blockChord, estimateKey, harmonySegments, heardWithTune, leadLine, reach, songChords, songScale, sungByBeat, tidy } from '../src/tabs/vocal/arrange/arrange.js'
import { chordId } from '../src/tabs/guitar/song/transcribe/chords.js'
import { partXml } from '../src/tabs/guitar/song/transcribe/scoreXml.js'
import { listParts } from '../src/tabs/vocal/notation/partFilter.js'

const note = (start, duration, pitch, amplitude = 0.6) => ({ startTimeSeconds: start, durationSeconds: duration, pitchMidi: pitch, amplitude })
const chord = (root, kind = 'major') => ({ root, kind, id: chordId(root, kind) })
const C = chord(0)
const F = chord(5)
const G = chord(7)
const TONES = { major: [0, 4, 7], minor: [0, 3, 7], 7: [0, 4, 7, 10] }

// "Twinkle, Twinkle" in C, a beat (0.5 s at 120 BPM) a note, the last of each phrase held two beats.
const TWINKLE = [60, 60, 67, 67, 69, 69, 67, null, 65, 65, 64, 64, 62, 62, 60, null]
const TWINKLE_CHORDS = [C, C, C, C, F, F, C, C, F, F, C, C, G, G, C, C]

function twinkle({ transpose = 0 } = {}) {
  const notes = []
  TWINKLE.forEach((pitch, i) => {
    if (pitch === null) return
    const held = TWINKLE[i + 1] === null
    notes.push(note(1 + i * 0.5, held ? 0.95 : 0.45, pitch + transpose))
  })
  // Two bars of intro, then the tune; the chords run on beats 0 … from the first beat.
  const beats = Array.from({ length: 28 }, (_, i) => -1 + i * 0.5)
  const chords = [C, C, C, C, ...TWINKLE_CHORDS, C, C, C, C, C, C, C, C].map((c) => (c ? chord((c.root + transpose + 12) % 12, c.kind) : null))
  return { notes, chords, bars: { beats, beatsPerBar: 4, firstDownbeat: 0 } }
}

describe('the lead line', () => {
  it('keeps one note at a time: no overtones, the stronger of two voices', () => {
    const line = leadLine([
      note(0, 0.5, 60, 0.7),
      note(0.01, 0.5, 72, 0.3), // its octave, weaker: an overtone
      note(0.5, 0.5, 64, 0.6),
      note(0.6, 0.3, 55, 0.2), // a quieter voice under it
      note(1, 0.05, 66, 0.9), // too short to be a sung note
      note(1.1, 0.5, 67, 0.6),
    ])
    expect(line.map((n) => n.midi)).toEqual([60, 64, 67])
  })

  it('lets a stronger note cut the one before it short', () => {
    const line = leadLine([note(0, 1, 60, 0.3), note(0.5, 0.5, 62, 0.8)])
    expect(line.map((n) => [n.midi, n.start, n.end])).toEqual([
      [60, 0, 0.5],
      [62, 0.5, 1],
    ])
  })
})

describe('fitting the tune to a part', () => {
  const events = (pitches) => pitches.map((midi, i) => ({ start: i * 4, end: i * 4 + 4, midi }))
  const tenor1 = VOICINGS.ttbb.voices[0]

  it('leaves a tune that fits where it is', () => {
    expect(bestShift(events([57, 60, 62, 64, 65, 67]), tenor1)).toBe(0)
  })

  it('moves a high (a woman’s) tune down an octave, keeping the key', () => {
    expect(bestShift(events([69, 72, 74, 76, 77, 79]), tenor1)).toBe(-12)
  })

  it('moves to a nearby key when no octave fits, unless asked to keep it', () => {
    // A tune spanning C3 … C5 is three semitones too wide for Tenor 1 either way.
    const wide = events([48, 52, 55, 60, 64, 67, 72])
    const shift = bestShift(wide, tenor1)
    expect(Math.abs(shift)).toBeLessThanOrEqual(3)
    expect(bestShift(wide, tenor1, { octavesOnly: true }) % 12).toBe(0)
  })
})

describe('octave errors', () => {
  const tenor1 = VOICINGS.ttbb.voices[0] // D3 … A4

  it('brings a note far out of the part’s range back by octaves, and leaves the rest', () => {
    expect(reach(79, tenor1)).toBe(67) // G5, an overtone → G4
    expect(reach(72, tenor1)).toBe(72) // C5: a stretch, but sung
    expect(reach(38, tenor1)).toBe(50) // D2 → D3
    expect(reach(60, tenor1)).toBe(60)
  })
})

describe('the key', () => {
  const scale = (tonic) => [0, 2, 4, 5, 7, 9, 11, 12].map((s, i) => ({ start: i * 4, end: i * 4 + 4, midi: 60 + tonic + s }))

  it('finds C major, F major and A minor', () => {
    expect(estimateKey(scale(0), [C, F, G, C])).toMatchObject({ tonic: 0, minor: false, fifths: 0, name: 'C major' })
    expect(estimateKey(scale(5), [F, chord(10), C, F])).toMatchObject({ tonic: 5, minor: false, fifths: -1, name: 'F major' })
    const aMinor = [57, 59, 60, 62, 64, 65, 67, 69, 64, 60, 57].map((midi, i) => ({ start: i * 4, end: i * 4 + 4, midi }))
    expect(estimateKey(aMinor, [chord(9, 'minor'), chord(2, 'minor'), chord(4, 'major'), chord(9, 'minor')])).toMatchObject({ tonic: 9, minor: true, fifths: 0 })
  })

  it('spells a flat key’s black notes as flats', () => {
    const xml = partXml([{ start: 0, end: 16, midi: 58 }], { id: 'P1', beatsPerBar: 4, measures: 1, fifths: -1 })
    expect(xml).toContain('<key><fifths>-1</fifths></key>')
    expect(xml).toContain('<step>B</step><alter>-1</alter>')
  })
})

describe('where the harmony changes', () => {
  it('moves with the tune’s chord tones and the chords, holds under passing notes, and goes on through rests', () => {
    // One bar of C then one of G; the tune: C, then a passing D (a sixteenth) and E off the eighth grid, then rests.
    const melody = [
      { start: 0, end: 4, midi: 60 },
      { start: 4, end: 5, midi: 62 },
      { start: 5, end: 8, midi: 64 },
    ]
    const chordAt = (slot) => (slot < 16 ? C : G)
    const segments = harmonySegments(melody, chordAt, { measures: 3, beatsPerBar: 4 })
    expect(segments.map((s) => [s.start, s.end, s.chord.id, s.melody])).toEqual([
      [0, 8, 'C', 60], // the D and the E are sung over the held chord
      [8, 16, 'C', null], // the tune rests: the chord goes on
      [16, 32, 'G', null],
      [32, 48, 'G', null], // restated in the next bar
    ])
    expect(segments[0]).toMatchObject({ low: 60, high: 64 })
  })
})

describe('arranging a song', () => {
  const sungAt = (part, slot) => part.events.find((e) => e.start <= slot && e.end > slot)?.midi ?? null

  for (const [voicing, melodyPart] of [['ttbb', 0], ['ttbb', 1], ['satb', 0], ['tb', 0]]) {
    it(`writes ${voicing.toUpperCase()} with the tune in ${VOICINGS[voicing].voices[melodyPart].name}`, () => {
      const song = twinkle()
      const result = arrangeSong(song, { voicing, melodyPart, title: 'Twinkle & Co' })
      const { voices } = VOICINGS[voicing]
      expect(result.parts.map((p) => p.name)).toEqual(voices.map((v) => v.name))
      expect(result.melodyPart).toBe(melodyPart)

      // The tune, whole, in its part's range.
      const tune = result.parts[melodyPart].events
      expect(tune).toHaveLength(14)
      for (const e of tune) expect(e.midi).toBeGreaterThanOrEqual(voices[melodyPart].low - 2)
      expect(tune.map((e) => e.midi - result.shift)).toEqual(TWINKLE.filter((p) => p !== null))

      const perBar = 16
      const bassOnRoot = []
      for (let slot = 0; slot < result.measures * perBar; slot += 2) {
        const sung = result.parts.map((p) => sungAt(p, slot))
        if (sung.every((p) => p === null)) continue
        const chordNow = song.chords[Math.floor(slot / 4)] // bar 1 is a bar before the tune
        expect(chordNow).toBeTruthy()
        const tones = TONES[chordNow.kind].map((i) => (chordNow.root + i + result.shift + 120) % 12)
        result.parts.forEach((part, v) => {
          const p = sung[v]
          if (p === null) return
          expect(p).toBeGreaterThanOrEqual(voices[v].low - (v === melodyPart ? 3 : 0))
          expect(p).toBeLessThanOrEqual(voices[v].high + (v === melodyPart ? 3 : 0))
          if (v !== melodyPart) expect(tones, `${part.name} at ${slot}`).toContain(p % 12)
        })
        // Top to bottom, never crossing.
        const heard = sung.filter((p) => p !== null)
        for (let i = 1; i < heard.length; i += 1) expect(heard[i], `slot ${slot}`).toBeLessThan(heard[i - 1])
        if (sung.at(-1) !== null) bassOnRoot.push(sung.at(-1) % 12 === tones[0])
      }
      // Mostly on the root; an inversion where the third would otherwise be missing.
      expect(bassOnRoot.filter(Boolean).length / bassOnRoot.length).toBeGreaterThanOrEqual(0.7)

      // A score the Vocal tab can open, a part per voice.
      expect(listParts(result.musicXml).map((p) => p.name)).toEqual(voices.map((v) => v.name))
      expect(result.musicXml).toContain('<work-title>Twinkle &amp; Co</work-title>')
      expect(result.musicXml).toContain('<sign>F</sign><line>4</line>')
      expect(result.musicXml).toContain('<harmony>')
    })
  }

  it('writes a soloist with the words over a TTBB backing on "oo" and "ah"', () => {
    const song = twinkle()
    const words = ['Twinkle', 'twinkle', 'little', 'star'].map((text, i) => ({ text, start: 1 + i, end: 1.9 + i }))
    const result = arrangeSong({ ...song, words }, { voicing: 'solo_ttbb' })
    const { voices } = VOICINGS.solo_ttbb
    expect(result.parts.map((p) => p.name)).toEqual(['Solo', 'Tenor 1', 'Tenor 2', 'Baritone', 'Bass'])
    expect(result.melodyPart).toBe(0)

    // The whole tune, with the words, in the solo.
    const solo = result.parts[0].events
    expect(solo).toHaveLength(14)
    expect(solo.map((e) => e.midi - result.shift)).toEqual(TWINKLE.filter((p) => p !== null))
    expect(solo.filter((e) => e.lyric).map((e) => e.lyric.text).slice(0, 2)).toEqual(['Twin', 'kle'])

    // The backing: chord tones in range, top to bottom, on "oo" under the solo and "ah" while it rests.
    const backing = result.parts.slice(1)
    const perBar = 16
    const syllables = new Set()
    for (let slot = 0; slot < result.measures * perBar; slot += 2) {
      const sung = backing.map((p) => sungAt(p, slot))
      if (sung.every((p) => p === null)) continue
      const chordNow = song.chords[Math.floor(slot / 4)]
      const tones = TONES[chordNow.kind].map((i) => (chordNow.root + i + result.shift + 120) % 12)
      backing.forEach((part, v) => {
        const p = sung[v]
        if (p === null) return
        expect(p).toBeGreaterThanOrEqual(voices[v + 1].low)
        expect(p).toBeLessThanOrEqual(voices[v + 1].high)
        expect(tones, `${part.name} at ${slot}`).toContain(p % 12)
      })
      const heard = sung.filter((p) => p !== null)
      for (let i = 1; i < heard.length; i += 1) expect(heard[i], `slot ${slot}`).toBeLessThan(heard[i - 1])
      // A plain chord: the bass on the root, the others close above it, and the solo on top (at the unison at its lowest).
      if (heard.length === 4) {
        expect(heard[3] % 12, `bass at ${slot}`).toBe(tones[0])
        expect(heard[0] - heard[3]).toBeLessThanOrEqual(12 + 7)
        const soloNow = sungAt(result.parts[0], slot)
        if (soloNow !== null) expect(soloNow, `solo at ${slot}`).toBeGreaterThanOrEqual(heard[0])
      }
    }
    for (const part of backing) {
      expect(part.events.length).toBeGreaterThan(0)
      for (const e of part.events) {
        const underSolo = solo.some((n) => n.start < e.end && n.end > e.start)
        if (underSolo && e.lyric) expect(e.lyric.text, `${part.name} at ${e.start}`).toBe('oo')
        else if (e.lyric) expect(e.lyric.text).toBe('ah')
        if (e.lyric) syllables.add(e.lyric.text)
      }
    }
    expect([...syllables].sort()).toEqual(['ah', 'oo'])
    expect(listParts(result.musicXml).map((p) => p.name)).toEqual(voices.map((v) => v.name))
    expect(result.musicXml).toContain('<text>oo</text>')
  })

  it('sings a chord plainly: the bass on the root, the rest stacked close above, in range', () => {
    const backing = VOICINGS.solo_ttbb.voices.slice(1)
    for (const [root, kind] of [[0, 'major'], [2, 'minor'], [7, '7'], [5, 'major'], [9, 'minor'], [4, 'minor'], [2, 'm7']]) {
      const chord = { root, kind }
      const pitches = blockChord(chord, backing)
      expect(pitches).toHaveLength(4)
      expect(pitches[3] % 12).toBe(root)
      for (let v = 0; v < 4; v += 1) {
        expect(pitches[v], `${kind} on ${root}, ${backing[v].name}`).toBeGreaterThanOrEqual(backing[v].low)
        expect(pitches[v]).toBeLessThanOrEqual(backing[v].high)
        if (v) expect(pitches[v]).toBeLessThan(pitches[v - 1])
      }
    }
    expect(blockChord({ root: 0, kind: 'major' }, backing)).toEqual([60, 55, 52, 48]) // C E G C, from C3
    expect(blockChord({ root: 7, kind: '7' }, backing)).toEqual([53, 50, 47, 43]) // G B D F, from G2
  })

  it('backs a soloist on "oo" even without the words', () => {
    const result = arrangeSong(twinkle(), { voicing: 'solo_ttbb' })
    expect(result.parts[0].events.some((e) => e.lyric)).toBe(false)
    expect(result.parts[1].events.some((e) => e.lyric?.text === 'oo')).toBe(true)
  })

  it('fills in every chord: root and third in each full TTBB chord, no doubled thirds', () => {
    const result = arrangeSong(twinkle(), { voicing: 'ttbb' })
    const song = twinkle()
    let full = 0
    for (let slot = 0; slot < result.measures * 16; slot += 4) {
      const sung = result.parts.map((p) => sungAt(p, slot))
      if (sung.some((p) => p === null)) continue
      full += 1
      const c = song.chords[Math.floor(slot / 4)]
      const pcs = sung.map((p) => p % 12)
      const root = (c.root + result.shift + 120) % 12
      const third = (root + 4) % 12
      expect(pcs).toContain(root)
      expect(pcs).toContain(third)
      expect(pcs.filter((pc) => pc === third).length).toBe(1)
    }
    expect(full).toBeGreaterThan(10)
  })

  it('moves a soprano’s tune down to the tenors, and names the key', () => {
    const result = arrangeSong(twinkle({ transpose: 12 }), { voicing: 'ttbb' })
    expect(result.shift).toBe(-12)
    expect(result.key.name).toBe('C major')
  })

  it('keeps a recording in E♭ in E♭ when asked, with flats', () => {
    const result = arrangeSong(twinkle({ transpose: 3 }), { voicing: 'ttbb', keepKey: true })
    expect(Math.abs(result.shift % 12)).toBe(0)
    expect(result.key).toMatchObject({ name: 'Eb major', fifths: -3 })
    expect(result.musicXml).toContain('<alter>-1</alter>')
    expect(result.musicXml).not.toContain('<alter>1</alter>')
  })

  it('writes the words under the tune, and under the parts singing with it', () => {
    // "Twin-kle twin-kle lit-tle star": a syllable a note, from 1 s, half a second each.
    const syll = ['Twinkle', 'twinkle', 'little', 'star']
    const words = syll.map((text, i) => ({ text, start: 1 + i, end: 1.9 + i }))
    const result = arrangeSong({ ...twinkle(), words }, { voicing: 'ttbb' })
    expect(result.lyrics).toBe(true)
    const tune = result.parts[0].events
    expect(tune.slice(0, 7).map((e) => e.lyric && `${e.lyric.text}:${e.lyric.syllabic}`)).toEqual([
      'Twin:begin', 'kle:end', 'twin:begin', 'kle:end', 'lit:begin', 'tle:end', 'star:single',
    ])
    // The bass starts its chords with the tune's syllables; before the tune comes in, it sings "oo".
    const bass = result.parts[3].events
    expect(bass[0].lyric).toEqual({ text: 'oo', syllabic: 'single' })
    expect(bass.find((e) => e.start === tune[0].start).lyric).toEqual({ text: 'Twin', syllabic: 'begin' })
    expect(result.musicXml).toContain('<lyric number="1"><syllabic>begin</syllabic><text>Twin</text></lyric>')
    // No words given: no lyrics, not even "oo".
    expect(arrangeSong(twinkle(), { voicing: 'ttbb' }).musicXml).not.toContain('<lyric')
  })

  it('has nothing to arrange without singing', () => {
    expect(arrangeSong({ notes: [], chords: [], bars: { beats: [], beatsPerBar: 4, firstDownbeat: 0 } })).toBeNull()
  })
})

describe('hearing the chords again for the arrangement', () => {
  const pcs = (root, kind) => TONES[kind].map((i) => (root + i) % 12)
  /** A beat's profile (beatChroma's) of a chord: its notes equally, plus a little of `noise` (a pitch class). */
  const profile = (root, kind = 'major', { noise = null, amount = 0.5 } = {}) => {
    const sum = new Array(12).fill(0)
    for (const pc of pcs(root, kind)) sum[pc] = 1
    if (noise !== null) sum[noise] += amount
    const norm = Math.hypot(...sum)
    return { chroma: sum.map((v) => v / norm), bass: root, energy: 1 }
  }
  const BAR = { beatsPerBar: 4, firstDownbeat: 0 }
  const names = (set) => [...set].sort((a, b) => a - b)

  it('counts what was sung on each beat', () => {
    const line = [{ start: 0.5, end: 1.5, midi: 60 }, { start: 1.5, end: 1.75, midi: 64 }]
    const sung = sungByBeat(line, (seconds) => seconds, 3)
    expect(sung[0][0]).toBeCloseTo(0.5)
    expect(sung[1][0]).toBeCloseTo(0.5)
    expect(sung[1][4]).toBeCloseTo(0.25)
    expect(sung[2]).toBeUndefined()
  })

  it('finds the scale a modal song is made of: Fm, B♭, E♭, A♭ are E♭ major’s notes', () => {
    const profiles = [[5, 'minor'], [10, 'major'], [3, 'major'], [8, 'major']].flatMap(([r, k]) => [profile(r, k), profile(r, k)])
    expect(names(songScale(profiles))).toEqual([0, 2, 3, 5, 7, 8, 10])
  })

  it('hears the scale from the singer alone, and from the band alone', () => {
    const sung = [60, 62, 64, 65, 67, 69, 71, 72].map((midi) => { const v = new Array(12).fill(0); v[midi % 12] = 1; return v })
    expect(names(songScale([], sung))).toEqual([0, 2, 4, 5, 7, 9, 11])
    expect(songScale([], [])).toBeNull()
    expect(names(songScale([profile(7), profile(2), profile(9, 'minor')]))).toEqual([0, 2, 4, 6, 7, 9, 11])
  })

  it('spells a chord in the song’s scale: B♭ in E♭ major, not B♭m7, though a stray D♭ is heard', () => {
    const scale = new Set([0, 2, 3, 5, 7, 8, 10])
    const profiles = Array.from({ length: 8 }, () => profile(10, 'major', { noise: 1, amount: 0.6 }))
    const track = songChords(profiles, scale, BAR)
    expect(track.map((c) => c.id)).toEqual(Array(8).fill('Bb'))
  })

  it('changes chord at the bar line or the half-bar, not on the beat the band wobbled', () => {
    const profiles = [...Array(3).fill(profile(0)), ...Array(5).fill(profile(7)), ...Array(8).fill(profile(0))]
    const track = songChords(profiles, new Set([0, 2, 4, 5, 7, 9, 11]), BAR)
    const changes = track.map((c, i) => (i && c.id !== track[i - 1].id ? i : null)).filter((i) => i !== null)
    expect(changes.length).toBe(2)
    for (const at of changes) expect(at % 2).toBe(0)
    expect(track[8].id).toBe('C')
  })

  it('lets the singer’s note tip a beat’s chord', () => {
    const flat = { chroma: new Array(12).fill(1 / Math.sqrt(12)), bass: null, energy: 1 }
    const sungE = new Array(12).fill(0)
    sungE[4] = 1
    const [heard] = heardWithTune([flat], [sungE])
    expect(heard.chroma[4]).toBeGreaterThan(heard.chroma[0])
    expect(Math.hypot(...heard.chroma)).toBeCloseTo(1)
    expect(heardWithTune([flat], [undefined])[0]).toBe(flat)
  })
})

describe('tidying the tune', () => {
  const ev = (start, end, midi) => ({ start, end, midi })
  it('joins a sixteenth to the same note before or after it', () => {
    expect(tidy([ev(0, 4, 60), ev(4, 5, 60), ev(5, 8, 62)])).toEqual([ev(0, 5, 60), ev(5, 8, 62)])
    expect(tidy([ev(0, 3, 60), ev(3, 4, 62), ev(4, 8, 62)])).toEqual([ev(0, 3, 60), ev(3, 8, 62)])
  })
  it('gives an off-beat scoop or wobble to its neighbour, and keeps a sung sixteenth', () => {
    expect(tidy([ev(0, 3, 60), ev(3, 4, 61), ev(4, 8, 64)])).toEqual([ev(0, 4, 60), ev(4, 8, 64)])
    expect(tidy([ev(0, 2, 60), ev(3, 4, 63), ev(4, 8, 64)])).toEqual([ev(0, 2, 60), ev(3, 8, 64)])
    expect(tidy([ev(0, 2, 60), ev(2, 3, 67), ev(3, 8, 64)])).toEqual([ev(0, 2, 60), ev(2, 3, 67), ev(3, 8, 64)]) // on the grid: sung
    expect(tidy([ev(0, 3, 60), ev(3, 4, 67), ev(4, 8, 64)])).toEqual([ev(0, 3, 60), ev(3, 4, 67), ev(4, 8, 64)]) // a leap: sung
  })
})
