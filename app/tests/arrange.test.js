import { describe, expect, it } from 'vitest'
import { VOICINGS, arrangeSong, bestShift, estimateKey, harmonySegments, leadLine, reach } from '../src/tabs/vocal/arrange/arrange.js'
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

  it('has nothing to arrange without singing', () => {
    expect(arrangeSong({ notes: [], chords: [], bars: { beats: [], beatsPerBar: 4, firstDownbeat: 0 } })).toBeNull()
  })
})
