/**
 * The Guitar Songs view's practice modes and "who plays along" choices —
 * the same controls as the Vocal tab (vocal/components/PracticeModeToggle,
 * AccompanimentToggle), worded for guitar — and the playback mix each
 * combination needs.
 */

export const GUITAR_MODES = [
  { id: 'listen', label: 'Listen', hint: 'Plain playback, with tempo, metronome, count-in and loop.' },
  { id: 'wait', label: 'Wait for me', hint: 'The next note is highlighted and the song waits until you play it.' },
  { id: 'trouble', label: 'Trouble spots', hint: 'Play along in time; every note is marked, misses in red.' },
]

export const GUITAR_ACCOMPANIMENTS = [
  {
    id: 'solo',
    label: 'By myself',
    hint: {
      listen: 'Only your part plays.',
      wait: 'Nothing plays while the app listens.',
      trouble: 'Nothing plays but the metronome, if it’s on, so the mic hears just you.',
    },
  },
  {
    id: 'all',
    label: 'With all parts',
    hint: {
      listen: 'Every part plays; yours is on top.',
      wait: 'The other parts are shown; nothing plays while the app listens.',
      trouble: 'The other parts play; yours is left for you. Headphones help.',
    },
  },
]

/**
 * Set alphaTab's track mute/solo for a mode. While the mic judges you
 * (Trouble spots) your own part never plays — the mic would hear the app
 * playing exactly the right notes and score them as yours. The metronome is
 * left to its own control (GuitarScore's, F40).
 */
export function applyMix(api, score, { mode, accompaniment, trackIndex }) {
  const tracks = score.tracks
  const mine = tracks.filter((t) => t.index === trackIndex)
  const others = tracks.filter((t) => t.index !== trackIndex)
  api.changeTrackSolo(tracks, false)
  api.changeTrackMute(tracks, false)

  const alone = accompaniment === 'solo' || !others.length
  if (mode === 'trouble') api.changeTrackMute(alone ? tracks : mine, true)
  else if (alone) api.changeTrackSolo(mine, true)
}
