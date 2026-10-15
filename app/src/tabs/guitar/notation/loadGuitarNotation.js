import * as alphaTab from '@coderline/alphatab'
import { midiToMusicXml } from '../../vocal/midi/midiToMusicXml.js'
import { readLyricStreams } from '../../vocal/midi/lyrics.js'
import { parseMidiFile } from '../../vocal/midi/parseMidi.js'
import { titleFromFilename, unzipMxl } from '../../vocal/notation/loadNotation.js'
import { addGuitarTab } from './fretAssign.js'
import { tidyMidiForTab } from './tidyMidi.js'

/**
 * Guitar notation import. Everything the Guitar tab opens comes out as
 * `{ format, title, score, sourceBytes, hasTab, tab }`, where `score` is an
 * alphaTab Score — what GuitarScore renders and exportGuitarNotation writes.
 *
 *   Guitar Pro 3–8, alphaTex → alphaTab's ScoreLoader (they carry tab)
 *   MusicXML → fretAssign's addGuitarTab → ScoreLoader
 *   MXL   → unzipped (Vocal's unzipMxl) → addGuitarTab → ScoreLoader
 *   MIDI  → tidyMidi (one note at a time per track, single written lengths)
 *           → Vocal's midiToMusicXml → addGuitarTab → ScoreLoader
 *
 * alphaTab shows tab only when the file carries string/fret data and can't
 * derive frets from pitch, so every pitched part without tab gets strings
 * and frets chosen for it, fitted to the guitar where it doesn't fit as
 * written. A part's own tab, percussion and MIDI drum tracks are left alone.
 * `tab` says what was done ({ generated, parts }, see addGuitarTab);
 * `hasTab` whether every note now has a string and fret.
 */

const EXTENSION_FORMATS = {
  gp: 'guitar-pro',
  gp3: 'guitar-pro',
  gp4: 'guitar-pro',
  gp5: 'guitar-pro',
  gpx: 'guitar-pro',
  alphatex: 'alphatex',
  atex: 'alphatex',
  musicxml: 'musicxml',
  xml: 'musicxml',
  mxl: 'mxl',
  mid: 'midi',
  midi: 'midi',
}

export const GUITAR_NOTATION_EXTENSIONS = Object.keys(EXTENSION_FORMATS)
export const GUITAR_NOTATION_ACCEPT = GUITAR_NOTATION_EXTENSIONS.map((ext) => `.${ext}`).join(',')

export function detectGuitarFormat(filename, bytes) {
  const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
  if (EXTENSION_FORMATS[ext]) return EXTENSION_FORMATS[ext]
  const head = String.fromCharCode(...new Uint8Array(bytes).subarray(0, 5))
  if (head.startsWith('MThd')) return 'midi'
  if (head.startsWith('<')) return 'musicxml'
  return 'guitar-pro' // ScoreLoader sniffs the Guitar Pro version itself
}

/** Every note in the score, in track → staff → bar → voice → beat order. */
export function scoreNotes(score) {
  const notes = []
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) notes.push(...beat.notes)
        }
      }
    }
  }
  return notes
}

export function hasTablature(score) {
  const notes = scoreNotes(score)
  return notes.length > 0 && notes.every((note) => note.isStringed || note.isPercussion)
}

/**
 * F5: tab and standard notation side by side. alphaTab's MusicXML importer
 * turns standard notation off on any staff with a tuning, so switch both on
 * for every stringed staff.
 */
function showTabAndNotation(score) {
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      if (staff.isStringed) {
        staff.showTablature = true
        staff.showStandardNotation = true
      }
    }
  }
  return score
}

/** Part ids midiToMusicXml gives drum tracks (P1, P2… over the tracks with notes), so they're never fretted. */
function drumParts(midi) {
  return midi.tracks
    .filter((track) => track.notes.length > 0)
    .flatMap((track, i) => (track.instrument?.percussion ? [`P${i + 1}`] : []))
}

/** MusicXML with tab added where it has none: { musicXml, tab }. Timewise scores are passed through. */
function withTab(musicXml, options) {
  if (!/<score-partwise[\s>]/.test(musicXml)) return { musicXml, tab: { generated: false, parts: [] } }
  const { musicXml: tabbed, tabbedParts, parts } = addGuitarTab(musicXml, options)
  return { musicXml: tabbed, tab: { generated: tabbedParts > 0, parts } }
}

/** MusicXML bytes as text: UTF-8, or UTF-16 when the file starts with a byte-order mark. */
function decodeXml(bytes) {
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength))
  const encoding = head[0] === 0xff && head[1] === 0xfe ? 'utf-16le' : head[0] === 0xfe && head[1] === 0xff ? 'utf-16be' : 'utf-8'
  return new TextDecoder(encoding).decode(bytes)
}

function loadBytes(bytes, settings) {
  return showTabAndNotation(alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(bytes), settings))
}

export async function loadGuitarNotation(arrayBuffer, filename, { title, settings = new alphaTab.Settings() } = {}) {
  const format = detectGuitarFormat(filename, arrayBuffer)
  let score
  let tab = { generated: false, parts: [] }
  const loadXml = (xml, options) => {
    const converted = withTab(xml, options)
    tab = converted.tab
    return loadBytes(new TextEncoder().encode(converted.musicXml), settings)
  }
  if (format === 'midi') {
    const midi = tidyMidiForTab(await parseMidiFile(arrayBuffer))
    const { musicXml } = midiToMusicXml(midi, { lyricStreams: readLyricStreams(arrayBuffer) })
    score = loadXml(musicXml, { skipParts: drumParts(midi) })
  } else if (format === 'mxl') {
    score = loadXml(await unzipMxl(arrayBuffer))
  } else {
    try {
      score = format === 'musicxml' ? loadXml(decodeXml(arrayBuffer)) : loadBytes(arrayBuffer, settings)
    } catch (err) {
      throw new Error(`Could not read this file as guitar notation (${err.message}).`)
    }
  }
  // alphaTab turns spaces in titles into no-break spaces; keep ours plain.
  const scoreTitle = score.title?.replace(/ /g, ' ').trim()
  return {
    format,
    title: title ?? (scoreTitle || titleFromFilename(filename)),
    score,
    sourceBytes: arrayBuffer,
    hasTab: hasTablature(score),
    tab,
  }
}
