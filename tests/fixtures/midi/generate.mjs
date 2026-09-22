// Regenerates the synth_*.mid stress fixtures. Run from the repo root:
//   node tests/fixtures/midi/generate.mjs
import pkg from '@tonejs/midi'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { Midi } = pkg
const outDir = fileURLToPath(new URL('./', import.meta.url))
const save = (name, midi) => writeFileSync(`${outDir}${name}`, Buffer.from(midi.toArray()))

{
  // Two tracks, 3/4, G major, tempo change mid-piece (default ppq 480).
  const m = new Midi()
  m.header.setTempo(90)
  m.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] })
  m.header.keySignatures.push({ ticks: 0, key: 'G', scale: 'major' })
  m.header.tempos.push({ ticks: 960 * 12, bpm: 140 })
  const melody = m.addTrack(); melody.name = 'Melody'
  const bass = m.addTrack(); bass.name = 'Bass'
  ;[67, 69, 71, 72, 74, 72, 71, 69, 67, 66, 64, 62].forEach((n, i) =>
    melody.addNote({ midi: n, ticks: i * 960, durationTicks: 960 }))
  for (let i = 0; i < 4; i++) {
    bass.addNote({ midi: 43, ticks: i * 2880, durationTicks: 2880 })
    bass.addNote({ midi: 50, ticks: i * 2880, durationTicks: 2880 })
  }
  save('synth_two_track_3-4_tempochange.mid', m)
}
{
  // Triplets and 32nd notes (off the 16th grid) in 6/8.
  const m = new Midi(); m.header.setTempo(120)
  m.header.timeSignatures.push({ ticks: 0, timeSignature: [6, 8] })
  const t = m.addTrack(); const ppq = m.header.ppq; let tick = 0
  for (let i = 0; i < 12; i++) { t.addNote({ midi: 60 + (i % 7), ticks: tick, durationTicks: ppq / 3 }); tick += ppq / 3 }
  for (let i = 0; i < 16; i++) { t.addNote({ midi: 72 - (i % 5), ticks: tick, durationTicks: ppq / 8 }); tick += ppq / 8 }
  save('synth_triplets_32nds_6-8.mid', m)
}
{
  // Overlapping notes inside one track (legato + sustained pedal tones).
  const m = new Midi(); const t = m.addTrack(); const ppq = m.header.ppq
  for (let i = 0; i < 8; i++) t.addNote({ midi: 60 + i, ticks: i * ppq, durationTicks: ppq * 1.5 })
  t.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 8 })
  t.addNote({ midi: 55, ticks: ppq * 2, durationTicks: ppq * 5 })
  save('synth_overlapping_polyphony.mid', m)
}
{
  // Long piece: 800 melody notes, bass, and a channel-10 drum track.
  const m = new Midi(); m.header.setTempo(160); const ppq = m.header.ppq
  const a = m.addTrack(), b = m.addTrack(), d = m.addTrack(); d.channel = 9; d.name = 'Drums'
  for (let i = 0; i < 800; i++) {
    a.addNote({ midi: 60 + (i * 5) % 24, ticks: i * ppq, durationTicks: ppq })
    if (i % 2 === 0) b.addNote({ midi: 40 + (i * 7) % 12, ticks: i * ppq, durationTicks: ppq * 2 })
    d.addNote({ midi: 36, ticks: i * ppq, durationTicks: ppq / 4 })
    d.addNote({ midi: 42, ticks: i * ppq + ppq / 2, durationTicks: ppq / 4 })
  }
  save('synth_long_800notes_drums.mid', m)
}
{
  // Extreme pitches, a 1-tick note, and a zero-length note.
  const m = new Midi(); const t = m.addTrack(); const ppq = m.header.ppq
  t.addNote({ midi: 21, ticks: 0, durationTicks: ppq })
  t.addNote({ midi: 108, ticks: ppq, durationTicks: ppq })
  t.addNote({ midi: 0, ticks: 2 * ppq, durationTicks: 1 })
  t.addNote({ midi: 127, ticks: 3 * ppq, durationTicks: 0 })
  save('synth_extreme_pitch_zero_dur.mid', m)
}
{
  // An empty track plus a melody that only starts after 20 beats, in 5/4.
  const m = new Midi(); m.header.timeSignatures.push({ ticks: 0, timeSignature: [5, 4] })
  m.addTrack().name = 'Empty'
  const t = m.addTrack(); const ppq = m.header.ppq
  for (let i = 0; i < 5; i++) t.addNote({ midi: 64 + i, ticks: ppq * 20 + i * ppq, durationTicks: ppq })
  save('synth_leading_silence_5-4.mid', m)
}
{
  // Flat key signature (Eb major) — accidental spelling.
  const m = new Midi(); m.header.keySignatures.push({ ticks: 0, key: 'Eb', scale: 'major' })
  const t = m.addTrack(); const ppq = m.header.ppq
  ;[63, 65, 67, 68, 70, 72, 74, 75].forEach((n, i) => t.addNote({ midi: n, ticks: i * ppq / 2, durationTicks: ppq / 2 }))
  save('synth_eb_major_flats.mid', m)
}
console.log('fixtures written to', outDir)
