import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { compare, describeComparison, describeOnsets, draftOf, guitarTracks, loadCache, onsetsOf } from './realSongs.js'

/**
 * The transcription benchmark on a real song (realSongs.js): the draft the
 * app makes from a song's cached model outputs, scored against a reference
 * tab of it. Off by default; it needs a cache folder (made by a browser run)
 * and, for the scores, the reference (Guitar Pro or MusicXML):
 *   REAL_SONG_CACHE=<folder> REAL_SONG_REF=<tab file> npx vitest run tests/realSongBenchmark.test.js
 * REAL_SONG_TRACKS picks the reference's tracks (indexes, comma-separated;
 * default every guitar track, since the separated guitar holds them all).
 *
 * Each run writes the draft to <folder>/draft.musicxml. A
 * <folder>/baseline.musicxml (an earlier draft, copied there by hand) is
 * scored too, for before and after.
 */

const cacheDir = process.env.REAL_SONG_CACHE
const refPath = process.env.REAL_SONG_REF

describe.skipIf(!cacheDir)('a real song against its reference tab', () => {
  it('transcribes it and scores the draft', async () => {
    const cache = loadCache(cacheDir)
    const draft = draftOf(cache)
    writeFileSync(join(cacheDir, 'draft.musicxml'), draft.musicXml)
    const load = async (xml) => (await loadGuitarNotation(new TextEncoder().encode(xml).buffer, 'draft.musicxml')).score
    const ours = onsetsOf(await load(draft.musicXml))
    console.log(`draft: ${describeOnsets(ours, { beats: cache.bars.beats.length })}`)
    expect(ours.length).toBeGreaterThan(0)

    if (!refPath) return
    const reference = await loadGuitarNotation(readFileSync(refPath).buffer, refPath)
    const tracks = process.env.REAL_SONG_TRACKS?.split(',').map(Number) ?? guitarTracks(reference.score)
    console.log(`reference: ${reference.title}, tracks ${tracks.map((i) => `${i} ${reference.score.tracks[i].name}`).join(', ')}`)
    const ref = onsetsOf(reference.score, tracks)
    const baseline = join(cacheDir, 'baseline.musicxml')
    if (existsSync(baseline)) console.log(describeComparison('baseline', compare(ref, onsetsOf(await load(readFileSync(baseline, 'utf8'))))))
    console.log(describeComparison('draft', compare(ref, ours)))
  }, 600000)
})
