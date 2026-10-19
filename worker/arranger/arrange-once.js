import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { arrangeAudio } from '../../app/src/tabs/vocal/arrange/pipeline.js'
import { decodeFile, downloadAudio, toModelRate, videoInfo } from './audio.js'
import { loadModels } from './models.js'
import { lyricsFor } from './songLyrics.js'

/**
 * Arrange one song without Supabase, to try the worker's pipeline:
 *   npm run once -- <YouTube id | audio file> [out.musicxml] [ttbb|satb|tb]
 */
const [source, out = 'arrangement.musicxml', voicing = 'ttbb'] = process.argv.slice(2)
if (!source) {
  console.error('usage: npm run once -- <YouTube id | audio file> [out.musicxml] [ttbb|satb|tb]')
  process.exit(2)
}
const started = Date.now()
const seconds = () => ((Date.now() - started) / 1000).toFixed(1)
const models = await loadModels({ cacheDir: process.env.CACHE_DIR || join(process.env.HOME, '.cache/harmonic-arranger') })
const work = mkdtempSync(join(tmpdir(), 'arranger-'))
try {
  let file = source
  let title = source.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '')
  let lyrics = null
  if (/^[A-Za-z0-9_-]{11}$/.test(source)) {
    const info = await videoInfo(source)
    title = info.title
    lyrics = lyricsFor(info, { cacheDir: process.env.CACHE_DIR || join(process.env.HOME, '.cache/harmonic-arranger'), log: console.log })
    console.log(`[${seconds()} s] ${title} (${info.duration} s)`)
    file = await downloadAudio(source, work)
  }
  const audio = await decodeFile(file)
  console.log(`[${seconds()} s] decoded ${(audio.song.length / 22050).toFixed(1)} s`)
  let last = ''
  const result = await arrangeAudio(audio, {
    models,
    toModelRate,
    voicing,
    title,
    lyrics: lyrics?.hear,
    onProgress: ({ label, value }) => {
      const line = `${label} ${Math.floor(value * 20) * 5}%`
      if (line !== last) console.log(`[${seconds()} s] ${(last = line)}`)
    },
  })
  writeFileSync(out, result.musicXml)
  console.log(`[${seconds()} s] ${out}: ${result.key.name}, moved ${result.shift} semitones, ${Math.round(result.bpm)} BPM, ${result.measures} bars`)
  for (const part of result.parts) console.log(`  ${part.name}: ${part.events.length} notes, ${part.events.filter((e) => e.lyric).length} with words`)
  if (lyrics) console.log(`  lyrics: ${lyrics.source() ?? 'none'}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
