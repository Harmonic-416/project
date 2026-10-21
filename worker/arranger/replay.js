import { readFileSync, writeFileSync } from 'node:fs'
import { arrangeSong } from '../../app/src/tabs/vocal/arrange/arrange.js'

/**
 * Arrange again from what the models heard, saved by `npm run once` with
 * ANALYSIS=<file.json> — the arranger alone, in a second, to try a change
 * to arrange.js on a real song:
 *   npm run replay -- <analysis.json> [out.musicxml] [solo_ttbb|ttbb|satb|tb]
 */
const [file, out = 'arrangement.musicxml', voicing = 'solo_ttbb'] = process.argv.slice(2)
if (!file) {
  console.error('usage: npm run replay -- <analysis.json> [out.musicxml] [solo_ttbb|ttbb|satb|tb]')
  process.exit(2)
}
const { title, notes, chords, bars, words, profiles } = JSON.parse(readFileSync(file, 'utf8'))
const result = arrangeSong({ notes, chords, bars, words, profiles }, { voicing, title })
if (!result) throw new Error('No singing in this analysis.')
writeFileSync(out, result.musicXml)
console.log(`${out}: ${result.key.name}, moved ${result.shift} semitones, ${Math.round(result.bpm)} BPM, ${result.measures} bars`)
for (const part of result.parts) console.log(`  ${part.name}: ${part.events.length} notes, ${part.events.filter((e) => e.lyric).length} with words`)
