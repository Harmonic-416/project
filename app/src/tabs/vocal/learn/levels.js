import { Ear, Eye, Flame, Hand, ListMusic, Music2, Target } from 'lucide-react'
/**
 * Vocal → Learn, as a course built around songs. Every level is one main
 * song, sung on the song screen (Listen, Wait for me, Trouble spots); the
 * warm-ups, solfège, rhythm and ear tests are there to get the singer ready
 * for that song, not lessons to pass in their own right.
 *
 * Nothing is locked. A singer who can already manage a song should not be
 * made to clear a scale first, so the course only *recommends* the next
 * level: the first one whose song hasn't been sung through yet. Plain data,
 * so it runs in Node tests too.
 */

/** The supporting activities a level can point at, keyed by the id their best stars are kept under. */
export const ACTIVITIES = {
  warmup: { kind: 'warmup', title: 'Warm up', blurb: 'Loosen your range first', icon: Flame, starsId: null },
  'solfege-scale': {
    kind: 'lesson',
    lesson: 'scale',
    title: 'The scale',
    blurb: 'Meet do re mi on the staff',
    icon: ListMusic,
    starsId: 'solfege-scale',
  },
  'solfege-read': {
    kind: 'lesson',
    lesson: 'read',
    title: 'Read it',
    blurb: 'Name the notes you see',
    icon: Eye,
    starsId: 'solfege-read',
  },
  'solfege-ear': {
    kind: 'lesson',
    lesson: 'ear',
    title: 'Hear it',
    blurb: 'Name the notes you hear',
    icon: Ear,
    starsId: 'solfege-ear',
  },
  rhythm: {
    kind: 'lesson',
    lesson: 'rhythm',
    title: 'Clap along',
    blurb: 'Quarter, half, whole and eighth notes',
    icon: Hand,
    starsId: 'rhythm',
  },
  'pitch-test': {
    kind: 'tests',
    test: 'pitch',
    title: 'Pitch test',
    blurb: 'Sing back the notes you hear',
    icon: Target,
    starsId: 'pitch-test',
  },
  'harmony-test': {
    kind: 'tests',
    test: 'harmony',
    title: 'Harmony test',
    blurb: 'Hold your note inside a chord',
    icon: Music2,
    starsId: 'harmony-test',
  },
}

/**
 * The course, easiest song first. `song` is a file in public/midi-files/;
 * a level whose file isn't there is left out rather than shown broken.
 * `focus` says what the song teaches, in a few words.
 */
export const LEVELS = [
  {
    id: 'scale',
    song: 'c-major-scale.mid',
    focus: 'Eight steady notes, up and back down',
    supports: ['warmup', 'solfege-scale'],
  },
  {
    id: 'ode',
    song: 'ode-to-joy.musicxml',
    focus: 'A stepwise tune, read from the staff',
    supports: ['solfege-read', 'rhythm', 'pitch-test'],
  },
  {
    id: 'darling',
    song: 'oh-darling.midi',
    focus: 'One short phrase in a narrow range',
    supports: ['warmup', 'solfege-ear'],
  },
  {
    id: 'paint',
    song: 'paint-it-black.midi',
    focus: 'A low minor phrase on a driving pulse',
    supports: ['rhythm', 'pitch-test'],
  },
  {
    id: 'grace',
    song: 'amazing-grace.musicxml',
    focus: 'Leaps and long notes, up to a high G',
    supports: ['warmup', 'solfege-ear', 'pitch-test'],
  },
  {
    id: 'because',
    song: 'because.mid',
    focus: 'Holding your line in four-part harmony',
    supports: ['warmup', 'harmony-test'],
  },
  {
    id: 'dream',
    song: 'ive-got-a-dream-a-cappella.mid',
    focus: 'A whole song among seven voices',
    supports: ['harmony-test', 'rhythm'],
  },
]

/** Where a sung run's best stars are kept for a song (RecordPanel.jsx, SongCardMeta.jsx). */
export const songStarsId = (song) => `song:${song.title}`

/**
 * The levels that can be shown, each with its song from the library and its
 * supporting activities filled in. `library` is songs/songLibrary.js.
 */
export function courseLevels(library) {
  return LEVELS.flatMap((level) => {
    const song = library.find((s) => s.filename === level.song)
    if (!song) return []
    return [{ ...level, song, supports: level.supports.map((id) => ({ id, ...ACTIVITIES[id] })) }]
  })
}

/**
 * Each level's standing, from the stars kept on this device: 'done' once its
 * song has a sung run, 'next' for the first level that hasn't (the one to
 * suggest), 'open' otherwise. Nothing is ever 'locked'.
 */
export function levelStates(levels, stars) {
  const next = levels.findIndex((level) => stars[songStarsId(level.song)] == null)
  return levels.map((level, i) => (stars[songStarsId(level.song)] != null ? 'done' : i === next ? 'next' : 'open'))
}
