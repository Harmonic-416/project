/**
 * Learn tab (LearnTab.jsx): the notes, quizzes and rhythm plans behind its
 * Solfège and Rhythm sections. Plain data, so it runs in Node tests too.
 */

// ── Solfège ──────────────────────────────────────────────────────

/** The C major scale, C4 up to C5, one entry per staff step (0 = C4). */
export const SCALE = [
  { syllable: 'do', letter: 'C', midi: 60 },
  { syllable: 're', letter: 'D', midi: 62 },
  { syllable: 'mi', letter: 'E', midi: 64 },
  { syllable: 'fa', letter: 'F', midi: 65 },
  { syllable: 'so', letter: 'G', midi: 67 },
  { syllable: 'la', letter: 'A', midi: 69 },
  { syllable: 'ti', letter: 'B', midi: 71 },
  { syllable: 'do', letter: 'C', midi: 72 },
]

export const SCALE_STEPS = SCALE.map((_, step) => step)

/** Whether two scale steps sing the same syllable (low and high do both count as do). */
export function sameSyllable(a, b) {
  return SCALE[a]?.syllable === SCALE[b]?.syllable
}

const randomInt = (n, random) => Math.floor(random() * n)

/**
 * A melody of `length` scale steps (0–7) starting on `first` (random when
 * null): no note repeats the one before it, and no leap is wider than
 * `maxLeap` steps, so it reads like a tune.
 */
export function randomMelody({ length, first = null, maxLeap = 4, random = Math.random }) {
  const steps = [first ?? randomInt(SCALE.length, random)]
  while (steps.length < length) {
    const prev = steps.at(-1)
    const options = SCALE_STEPS.filter((s) => s !== prev && Math.abs(s - prev) <= maxLeap)
    steps.push(options[randomInt(options.length, random)])
  }
  return steps
}

/** Sight-reading: six notes, the first one named for you. */
export const READING_LENGTH = 6
/** Ear training: four notes, always starting on (low) do. */
export const EAR_LENGTH = 4

export const readingMelody = (random = Math.random) => randomMelody({ length: READING_LENGTH, random })
export const earMelody = (random = Math.random) => randomMelody({ length: EAR_LENGTH, first: 0, random })

/** Per-note verdicts for an ear-training answer: true where the syllable matches. */
export function checkAnswer(melody, answer) {
  return melody.map((step, i) => answer[i] !== undefined && sameSyllable(step, answer[i]))
}

// ── Rhythm ───────────────────────────────────────────────────────

/**
 * Meters, counted in eighth notes. `pulse` is how many eighths make one felt
 * beat (a quarter in 4/4, a dotted quarter in 12/8); `bpm` is in pulses per
 * minute. `counts` labels every eighth of a bar.
 */
export const METERS = {
  '4/4': {
    id: '4/4',
    eighthsPerBar: 8,
    pulse: 2,
    clickEvery: 2, // click quarters
    bpm: { min: 50, max: 120, default: 80 },
    tempoLabel: '♩ =',
    counts: ['1', '&', '2', '&', '3', '&', '4', '&'],
  },
  '12/8': {
    id: '12/8',
    eighthsPerBar: 12,
    pulse: 3,
    clickEvery: 1, // click every eighth, accenting the dotted-quarter beats
    bpm: { min: 40, max: 90, default: 60 },
    tempoLabel: '♩. =',
    counts: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  },
}

export const BARS_PER_PHASE = 2

/** Played in this order, each for two bars. `eighths` is the note's length. */
export const PHASES = [
  { id: 'quarter', label: 'Quarter notes', eighths: 2 },
  { id: 'half', label: 'Half notes', eighths: 4 },
  { id: 'whole', label: 'Whole notes', eighths: 8 },
  { id: 'eighth', label: 'Eighth notes', eighths: 1 },
]

const HINTS = {
  '4/4': {
    quarter: 'Clap on every beat: 1, 2, 3, 4.',
    half: 'Clap on 1 and 3, holding through 2 and 4.',
    whole: 'Clap on 1 and hold for the whole bar.',
    eighth: 'Clap twice per beat: 1 & 2 & 3 & 4 &.',
  },
  '12/8': {
    quarter: 'Clap every 2 eighths: 1, 3, 5, 7, 9, 11.',
    half: 'Clap every 4 eighths: 1, 5, 9.',
    whole: 'Clap every 8 eighths — it crosses the bar line: 1, 9, then 5 of the next bar.',
    eighth: 'Clap on every count, 1 to 12.',
  },
}

export const phaseHint = (meterId, phaseId) => HINTS[meterId]?.[phaseId] ?? ''

/** Seconds per eighth note for a meter at `bpm` pulses per minute. */
export const eighthSeconds = (meter, bpm) => 60 / bpm / meter.pulse

/**
 * Everything the rhythm demo plays, in eighth notes from the start of a
 * one-bar count-in (multiply by eighthSeconds for time):
 *
 *   clicks: [{ at, level }]  level 'down' (bar start), 'beat' or 'sub'
 *   notes:  [{ at, length, phase, index }]  index within its phase
 *   phases: [{ ...phase, start, end }]
 *   total:  eighths from the count-in to the end of the last phase
 */
export function rhythmPlan(meter) {
  const bar = meter.eighthsPerBar
  const phaseLength = bar * BARS_PER_PHASE
  const total = bar + phaseLength * PHASES.length

  const clicks = []
  for (let at = 0; at < total; at += meter.clickEvery) {
    const inBar = at % bar
    const level = inBar === 0 ? 'down' : inBar % meter.pulse === 0 ? 'beat' : 'sub'
    clicks.push({ at, level })
  }

  const notes = []
  const phases = PHASES.map((phase, p) => {
    const start = bar + p * phaseLength
    for (let index = 0; index * phase.eighths < phaseLength; index += 1) {
      notes.push({ at: start + index * phase.eighths, length: phase.eighths, phase: phase.id, index })
    }
    return { ...phase, start, end: start + phaseLength }
  })

  return { clicks, notes, phases, total, bar }
}

/** Where `eighth` (fractional, from the plan's start) falls: { phaseIndex, countIndex } — phaseIndex -1 during the count-in. */
export function rhythmPosition(plan, eighth) {
  const phaseIndex = plan.phases.findIndex((p) => eighth >= p.start && eighth < p.end)
  const whole = Math.floor(eighth)
  return {
    phaseIndex: eighth < plan.bar ? -1 : phaseIndex,
    countIndex: ((whole % plan.bar) + plan.bar) % plan.bar,
  }
}
