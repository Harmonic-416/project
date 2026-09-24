import * as alphaTab from '@coderline/alphatab'
import { midiToMusicXml } from '../../vocal/midi/midiToMusicXml.js'
import { parseMidiFile } from '../../vocal/midi/parseMidi.js'
import { titleFromFilename, unzipMxl } from '../../vocal/notation/loadNotation.js'

/**
 * Guitar notation import. Everything the Guitar tab opens comes out as
 * `{ format, title, score, sourceBytes, hasTab }`, where `score` is an
 * alphaTab Score — what GuitarScore renders and exportGuitarNotation writes.
 *
 *   Guitar Pro 3–8, alphaTex, MusicXML → alphaTab's ScoreLoader
 *   MXL   → unzipped (Vocal's unzipMxl) → ScoreLoader
 *   MIDI  → Vocal's midiToMusicXml → ScoreLoader. alphaTab can't read MIDI
 *           or derive frets from pitch, so MIDI songs have notation but no
 *           tab until fret assignment lands (hasTab: false).
 *
 * alphaTab shows tab only when the file carries string/fret data; `hasTab`
 * says whether this one does.
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

function loadBytes(bytes, settings) {
  return showTabAndNotation(alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(bytes), settings))
}

export async function loadGuitarNotation(arrayBuffer, filename, { title, settings = new alphaTab.Settings() } = {}) {
  const format = detectGuitarFormat(filename, arrayBuffer)
  let score
  if (format === 'midi') {
    const { musicXml } = midiToMusicXml(await parseMidiFile(arrayBuffer))
    score = loadBytes(new TextEncoder().encode(musicXml), settings)
  } else if (format === 'mxl') {
    score = loadBytes(new TextEncoder().encode(await unzipMxl(arrayBuffer)), settings)
  } else {
    try {
      score = loadBytes(arrayBuffer, settings)
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
  }
}
