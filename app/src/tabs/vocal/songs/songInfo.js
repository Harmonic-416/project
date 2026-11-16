import { Midi } from '@tonejs/midi'
import { COMFORTABLE_RANGES } from '../transpose/voiceRange.js'
import { midiToNoteName } from '../audio/pitchDetector.js'

/**
 * What a song card can say before the song is opened: how many parts, how
 * long, the tune's range, and which voices can sing it as written. Read from
 * the file itself (the built-ins are a handful of small files), cheaply:
 * MIDI through @tonejs/midi, MusicXML by reading pitches and measures.
 */

const VOICE_NAMES = { soprano: 'Soprano', alto: 'Alto', tenor: 'Tenor', baritone: 'Baritone', bass: 'Bass' }
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Voices whose comfortable range holds [low, high] as written (one semitone of grace each end). */
export function voicesThatFit(low, high) {
  return Object.entries(COMFORTABLE_RANGES)
    .filter(([, range]) => low >= range.low - 1 && high <= range.high + 1)
    .map(([id]) => VOICE_NAMES[id])
}

/**
 * @param {{ partCount: number, tune: number[], seconds?: number|null, bars?: number|null }} input
 *   tune: the MIDI pitches of the top part (the one sung by default).
 */
export function describeSong({ partCount, tune, seconds = null, bars = null }) {
  if (!tune.length) return { partCount, seconds, bars, range: null, fits: [] }
  const low = Math.min(...tune)
  const high = Math.max(...tune)
  return {
    partCount,
    seconds,
    bars,
    range: { low, high, label: `${midiToNoteName(low)}–${midiToNoteName(high)}` },
    fits: voicesThatFit(low, high),
  }
}

/** From a MIDI file: tracks with notes are parts; the first is the tune. */
export function infoFromMidi(arrayBuffer) {
  const midi = new Midi(arrayBuffer)
  const parts = midi.tracks.filter((track) => track.notes.length && track.instrument?.percussion !== true)
  return describeSong({
    partCount: parts.length,
    tune: (parts[0]?.notes ?? []).map((note) => note.midi),
    seconds: midi.duration || null,
  })
}

/** From MusicXML text: <score-part>s are parts; the first <part>'s pitches are the tune. */
export function infoFromMusicXml(text) {
  const partCount = (text.match(/<score-part\b/g) ?? []).length
  const firstPart = text.match(/<part\b[\s\S]*?<\/part>/)?.[0] ?? ''
  const tune = [...firstPart.matchAll(/<pitch>([\s\S]*?)<\/pitch>/g)].map(([, pitch]) => {
    const step = pitch.match(/<step>([A-G])<\/step>/)?.[1] ?? 'C'
    const alter = Number(pitch.match(/<alter>(-?[\d.]+)<\/alter>/)?.[1] ?? 0)
    const octave = Number(pitch.match(/<octave>(-?\d+)<\/octave>/)?.[1] ?? 4)
    return (octave + 1) * 12 + STEP[step] + alter
  })
  const bars = (firstPart.match(/<measure\b/g) ?? []).length || null
  return describeSong({ partCount, tune, bars })
}

/** "1:23" or "24 bars", whichever the file tells us. */
export function lengthLabel(info) {
  if (info.seconds) {
    const total = Math.round(info.seconds)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  }
  return info.bars ? `${info.bars} bars` : null
}

const cache = new Map()

/** Fetch and read one built-in song (cached for the visit); null if it can't be read. */
export async function fetchSongInfo(song) {
  if (cache.has(song.url)) return cache.get(song.url)
  const pending = (async () => {
    try {
      const response = await fetch(song.url)
      if (!response.ok) return null
      if (/\.midi?$/i.test(song.filename)) return infoFromMidi(await response.arrayBuffer())
      if (/\.(musicxml|xml)$/i.test(song.filename)) return infoFromMusicXml(await response.text())
      return null
    } catch {
      return null
    }
  })()
  cache.set(song.url, pending)
  return pending
}
