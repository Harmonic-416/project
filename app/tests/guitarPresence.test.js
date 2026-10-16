import { describe, expect, it } from 'vitest'
import { GUITAR_CLASSES, curveOf, frameLevels, guitarFrames, screenRecording } from '../src/tabs/guitar/song/transcribe/guitarPresence.js'

const CLASSES = 521
const GUITAR = 136 // Electric guitar
const SINGING = 24
const DRUM_KIT = 157
const SYNTH = 153

/** YAMNet-style scores: `frames` frames, each with the given class → score (everything else 0.01). */
function yamnet(frames, scoreAt) {
  const scores = new Float32Array(frames * CLASSES).fill(0.01)
  for (let f = 0; f < frames; f += 1) for (const [c, v] of Object.entries(scoreAt(f))) scores[f * CLASSES + Number(c)] = v
  return { frames, scores }
}

describe('is there a guitar in this song?', () => {
  it('takes the strongest of the guitar classes in each frame', () => {
    const scores = yamnet(3, (f) => ({ 135: 0.1 * f, 141: 0.5 }))
    expect([...curveOf(scores, GUITAR_CLASSES)].map((v) => +v.toFixed(2))).toEqual([0.5, 0.5, 0.5])
  })

  it('says solo for a guitar on its own, and band for a guitar with singing and drums', () => {
    expect(screenRecording(yamnet(200, () => ({ [GUITAR]: 0.7 }))).kind).toBe('solo')
    expect(screenRecording(yamnet(200, (f) => ({ [GUITAR]: f % 3 ? 0.3 : 0.05, [SINGING]: 0.5, [DRUM_KIT]: 0.5 }))).kind).toBe('band')
  })
})

describe('where the separated guitar really plays', () => {
  const frames = 40
  const song = new Array(frames).fill(-20)

  it('counts frames where the stem is loud against the song, even when YAMNet can’t name the guitar', () => {
    // Guitar in frames 10–29 (YAMNet hears only "Music" in it, as in "Caution"); elsewhere the stem is quiet leakage.
    const stemYamnet = yamnet(frames, () => ({ 132: 0.8 }))
    const stemLevels = Array.from({ length: frames }, (_, f) => (f >= 10 && f < 30 ? -36 : -60))
    const { active, presence, enough } = guitarFrames({ stemYamnet, stemLevels, songLevels: song })
    expect([...active].map((v, f) => (v ? f : null)).filter((f) => f !== null)).toEqual(Array.from({ length: 20 }, (_, i) => i + 10))
    expect(presence).toBeCloseTo(0.5)
    expect(enough).toBe(true)
  })

  it('isn’t fooled by a vocal or a synth leaking into the stem (rap, techno)', () => {
    const rap = yamnet(frames, () => ({ [SINGING]: 0.5, 31: 0.6 }))
    const techno = yamnet(frames, () => ({ [SYNTH]: 0.5, 236: 0.4 }))
    for (const stemYamnet of [rap, techno]) {
      expect(guitarFrames({ stemYamnet, stemLevels: new Array(frames).fill(-30), songLevels: song }).enough).toBe(false)
    }
  })

  it('isn’t fooled by a stem that’s only quiet leakage', () => {
    const stemYamnet = yamnet(frames, () => ({ 132: 0.8 }))
    expect(guitarFrames({ stemYamnet, stemLevels: new Array(frames).fill(-52), songLevels: song }).enough).toBe(false)
  })

  it('keeps a frame where guitar is heard over a little leakage', () => {
    const stemYamnet = yamnet(frames, () => ({ [GUITAR]: 0.5, [SINGING]: 0.2 }))
    expect(guitarFrames({ stemYamnet, stemLevels: new Array(frames).fill(-30), songLevels: song }).enough).toBe(true)
  })

  it('smooths over a single frame either way', () => {
    const levels = Array.from({ length: frames }, (_, f) => ((f >= 5 && f < 15 && f !== 9) || f === 30 ? -30 : -60))
    const { active } = guitarFrames({ stemYamnet: yamnet(frames, () => ({ 132: 0.8 })), stemLevels: levels, songLevels: song })
    expect(active[9]).toBe(1) // the gap filled
    expect(active[30]).toBe(0) // the stray dropped
  })

  it('measures each frame’s level', () => {
    const tone = Float32Array.from({ length: 16000 * 2 }, (_, i) => 0.5 * Math.sin(i / 3))
    const levels = frameLevels(tone, 3)
    expect(levels[0]).toBeCloseTo(10 * Math.log10(0.125), 0)
  })
})
