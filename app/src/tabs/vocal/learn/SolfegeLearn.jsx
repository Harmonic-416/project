import { useEffect, useState } from 'react'
import Staff from './Staff.jsx'
import { tapNote } from './usePlayback.js'
import { EAR_LENGTH, SCALE, SCALE_STEPS, checkAnswer, earMelody, readingMelody, sameSyllable } from './learnLogic.js'

const SCALE_NOTE_SECONDS = 0.55
const MELODY_NOTE_SECONDS = 0.7
const WRONG_FLASH_MS = 450

/** Index of the note sounding `elapsed` seconds in, for notes every `gap` seconds, or null. */
const noteAt = (elapsed, gap, count) => {
  if (elapsed === null || elapsed < 0) return null
  const i = Math.floor(elapsed / gap)
  return i < count ? i : null
}

/** Book `steps` on `session` from `t0`, one every `gap` seconds. */
const scheduleSteps = (steps, gap) => (session, t0) =>
  steps.forEach((step, i) => session.note(SCALE[step].midi, t0 + i * gap, gap * 0.85))

/** The eight do-re-mi boxes; `onPick(step)` when tapped (display-only without it). */
function SolfegeBoxes({ active = null, wrong = null, onPick, disabled = false }) {
  return (
    <div className="learn-boxes">
      {SCALE.map((note, step) => (
        <button
          key={step}
          type="button"
          className={`learn-box${active === step ? ' learn-box--active' : ''}${wrong === step ? ' learn-box--wrong' : ''}`}
          onClick={() => onPick(step)}
          disabled={disabled}
          aria-label={`${note.syllable} (${note.letter})`}
        >
          <span className="learn-box__syllable">{note.syllable}</span>
          <span className="learn-box__letter">{note.letter}</span>
        </button>
      ))}
    </div>
  )
}

/** Briefly marks a box red after a wrong pick. */
function useWrongFlash() {
  const [wrong, setWrong] = useState(null) // { step, at }
  useEffect(() => {
    if (!wrong) return undefined
    const timer = setTimeout(() => setWrong(null), WRONG_FLASH_MS)
    return () => clearTimeout(timer)
  }, [wrong])
  return [wrong?.step ?? null, (step) => setWrong({ step, at: Date.now() })]
}

/** Solfège: what it is, the C major scale played out, then a reading quiz and an ear quiz. */
export default function SolfegeLearn({ playback }) {
  const { owner, elapsed, play, stop } = playback

  // ── The scale ──
  const scaleNote = owner === 'scale' ? noteAt(elapsed, SCALE_NOTE_SECONDS, SCALE.length) : null
  const [tapped, setTapped] = useState(null)
  const playScale = () =>
    owner === 'scale'
      ? stop()
      : play('scale', SCALE.length * SCALE_NOTE_SECONDS + 0.4, scheduleSteps(SCALE_STEPS, SCALE_NOTE_SECONDS))
  const tapBox = (step) => {
    setTapped(step)
    tapNote(SCALE[step].midi)
  }
  useEffect(() => {
    if (tapped === null) return undefined
    const timer = setTimeout(() => setTapped(null), 400)
    return () => clearTimeout(timer)
  }, [tapped])
  const scaleLit = scaleNote ?? tapped

  // ── Read it: name the notes on the staff ──
  const [reading, setReading] = useState(null) // { melody, next, misses }
  const [readWrong, flashReadWrong] = useWrongFlash()
  const readingDone = reading && reading.next >= reading.melody.length
  const newReading = () => {
    if (owner === 'read') stop()
    setReading({ melody: readingMelody(), next: 1, misses: 0 })
  }
  const pickReading = (step) => {
    if (!reading || readingDone) return
    tapNote(SCALE[step].midi)
    if (sameSyllable(step, reading.melody[reading.next])) {
      setReading({ ...reading, next: reading.next + 1 })
    } else {
      flashReadWrong(step)
      setReading({ ...reading, misses: reading.misses + 1 })
    }
  }
  const readPlaying = owner === 'read' ? noteAt(elapsed, MELODY_NOTE_SECONDS, reading?.melody.length ?? 0) : null
  const hearReading = () =>
    owner === 'read'
      ? stop()
      : play('read', reading.melody.length * MELODY_NOTE_SECONDS + 0.4, scheduleSteps(reading.melody, MELODY_NOTE_SECONDS))

  // ── Hear it: four notes from do, by ear ──
  const [ear, setEar] = useState(null) // { melody, answer }
  const earChecked = ear && ear.answer.length >= EAR_LENGTH
  const earVerdicts = earChecked ? checkAnswer(ear.melody, ear.answer) : []
  const earPlaying = owner === 'ear' ? noteAt(elapsed, MELODY_NOTE_SECONDS, EAR_LENGTH) : null
  const playEar = (melody) =>
    play('ear', melody.length * MELODY_NOTE_SECONDS + 0.4, scheduleSteps(melody, MELODY_NOTE_SECONDS))
  const newEar = () => {
    const melody = earMelody()
    setEar({ melody, answer: [0] })
    playEar(melody)
  }
  const pickEar = (step) => {
    if (!ear || earChecked) return
    setEar({ ...ear, answer: [...ear.answer, step] })
  }
  const undoEar = () => {
    if (ear && !earChecked && ear.answer.length > 1) setEar({ ...ear, answer: ear.answer.slice(0, -1) })
  }

  return (
    <div className="learn-section">
      <p className="learn-intro">
        <strong>Solfège</strong> gives each note of the scale a singable name — do, re, mi, fa, so, la, ti, do — so
        you can hear, sing and read how notes relate to one another in any key.
      </p>

      <section className="learn-card">
        <div className="learn-card__top">
          <h2 className="learn-card__title">The C major scale</h2>
          <button type="button" className="learn-button learn-button--primary" onClick={playScale}>
            {owner === 'scale' ? 'Stop' : '▶ Play the scale'}
          </button>
        </div>
        <Staff
          steps={SCALE_STEPS}
          active={scaleLit}
          labels={SCALE.map((n) => n.letter)}
          label="C major scale on the treble staff, C up to C"
        />
        <SolfegeBoxes active={scaleLit} onPick={tapBox} />
        <p className="learn-hint">Tap a box to hear its note.</p>
      </section>

      <section className="learn-card">
        <div className="learn-card__top">
          <h2 className="learn-card__title">Read it</h2>
          <button type="button" className="learn-button learn-button--primary" onClick={newReading}>
            {reading ? 'New sequence' : 'Generate a sequence'}
          </button>
        </div>
        {!reading ? (
          <p className="learn-hint">
            You’ll get a short melody in C major and the name of its first note. Read the staff and tap the solfège
            for each note after it.
          </p>
        ) : (
          <>
            <p className="learn-prompt" aria-live="polite">
              {readingDone ? (
                <>
                  Nice work! {reading.misses === 0 ? 'No mistakes.' : `${reading.misses} wrong ${reading.misses === 1 ? 'guess' : 'guesses'}.`}
                </>
              ) : (
                <>
                  The first note is <strong>{SCALE[reading.melody[0]].syllable}</strong>. What is note{' '}
                  {reading.next + 1}?
                </>
              )}
            </p>
            <Staff
              steps={reading.melody}
              active={readPlaying}
              marks={reading.melody.map((_, i) => (i === 0 ? null : i < reading.next ? 'good' : i === reading.next ? 'next' : null))}
              labels={reading.melody.map((step, i) => (i < reading.next ? SCALE[step].syllable : i === reading.next ? '?' : null))}
              label="Melody to read"
            />
            <SolfegeBoxes wrong={readWrong} onPick={pickReading} disabled={readingDone} />
            {readingDone && (
              <div className="learn-row">
                <button type="button" className="learn-button" onClick={hearReading}>
                  {owner === 'read' ? 'Stop' : '▶ Hear it'}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="learn-card">
        <div className="learn-card__top">
          <h2 className="learn-card__title">Hear it</h2>
          <button type="button" className="learn-button learn-button--primary" onClick={newEar}>
            {ear ? 'New melody' : 'Play a melody'}
          </button>
        </div>
        {!ear ? (
          <p className="learn-hint">
            Four notes play, starting on do. Listen, then tap the solfège for the notes in order.
          </p>
        ) : (
          <>
            <div className="learn-slots" aria-live="polite">
              {ear.melody.map((step, i) => {
                const picked = ear.answer[i]
                const verdict = earChecked ? (earVerdicts[i] ? ' learn-slot--good' : ' learn-slot--bad') : ''
                return (
                  <div
                    key={i}
                    className={`learn-slot${verdict}${earPlaying === i ? ' learn-slot--playing' : ''}${i === ear.answer.length && !earChecked ? ' learn-slot--next' : ''}`}
                  >
                    <span className="learn-slot__picked">{picked !== undefined ? SCALE[picked].syllable : '?'}</span>
                    {earChecked && !earVerdicts[i] && <span className="learn-slot__answer">{SCALE[step].syllable}</span>}
                  </div>
                )
              })}
            </div>
            {earChecked && (
              <>
                <p className="learn-prompt">
                  {earVerdicts.filter(Boolean).length - 1} of {EAR_LENGTH - 1} right.
                </p>
                <Staff
                  steps={ear.melody}
                  active={earPlaying}
                  labels={ear.melody.map((step) => SCALE[step].syllable)}
                  marks={earVerdicts.map((ok, i) => (i === 0 ? null : ok ? 'good' : 'bad'))}
                  label="The melody you heard"
                />
              </>
            )}
            <SolfegeBoxes onPick={pickEar} disabled={earChecked} />
            <div className="learn-row">
              <button type="button" className="learn-button" onClick={() => (owner === 'ear' ? stop() : playEar(ear.melody))}>
                {owner === 'ear' ? 'Stop' : '▶ Play again'}
              </button>
              {!earChecked && (
                <button type="button" className="learn-button" onClick={undoEar} disabled={ear.answer.length <= 1}>
                  Undo
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
