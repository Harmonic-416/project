import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import GuitarFeedback from '../practice/GuitarFeedback.jsx'
import { getProgressSyncStatus, onProgressSyncStatus, progressSaved } from './progressEvents.js'
import { readLocalProgress } from './learnProgress.js'
import StrumDrill from '../exercises/StrumDrill.jsx'
import { STRUM_STEPS } from '../exercises/strumTiming.js'
import PracticeScreen from '../practice/PracticeScreen.jsx'
import { CHORDS } from '../practice/chords.js'
import { unlockedCount } from '../practice/unlocks.js'
import ChordUnits from './ChordUnits.jsx'
import '../../../auth/authTheme.css'
import './Learn.css'

export default function LearnTab({ auth, progressVersion = 0 }) {
  const [opened, setOpened] = useState(null)
  const [unlockedFor, setUnlockedFor] = useState(null)
  const page = useRef(null)
  const heading = useRef(null)
  const confirmation = useRef(null)
  const cancelUnlock = useRef(null)
  const resume = useRef(null)
  const unlockKey = `harmonic.guitar.unlock-all.${auth?.user?.id ?? 'guest'}`
  let allUnlocked = unlockedFor === unlockKey
  try {
    allUnlocked ||= localStorage.getItem(unlockKey) === 'true'
  } catch {
    // The override still works while Learn is open if storage is unavailable.
  }

  useEffect(() => {
    page.current?.closest('.guitar-tab__body')?.scrollTo?.({ top: 0 })
    heading.current?.focus({ preventScroll: true })
  }, [opened])

  const sync = useSyncExternalStore(onProgressSyncStatus, getProgressSyncStatus)
  const accountStatus = sync.userId === auth?.user?.id ? sync.state : 'saving'
  const progress = readLocalProgress()
  const cleared = progress.cleared ?? {}
  const done = CHORDS.filter((chord) => ['passed', 'skipped'].includes(cleared[chord.id])).length
  const next = CHORDS[unlockedCount(cleared) - 1]
  const strumDone = STRUM_STEPS.filter((step) => progress.strumPassed?.[step.id]).length
  const openChord = (chordId = next.id, mode = 'guided') => setOpened({ id: 'lessons', chordId, mode })
  const where = !auth?.configured ? 'Your progress is saved in this browser.' : !auth.user ? 'Saved on this device. Sign in on Home to sync your progress.' : accountStatus === 'error' ? 'Your progress is safe on this device. Account sync needs another try.' : accountStatus === 'saved' ? 'Your progress is saved to your account.' : 'Saving your progress to your account...'

  function unlockAll() {
    try {
      localStorage.setItem(unlockKey, 'true')
    } catch {
      // Keep the current session usable when storage is blocked.
    }
    confirmation.current.close()
    setUnlockedFor(unlockKey)
    resume.current.focus()
  }

  return (
    <div ref={page} className={`learn ${opened ? 'learn--in-lesson' : ''}`}>
      {opened ? (
        <div className="learn__activity">
          <div className="learn__activity-top">
            <button type="button" className="learn__back" onClick={() => setOpened(null)}>&larr; Learn</button>
            <h2 ref={heading} tabIndex={-1}>{opened.id === 'lessons' ? 'Chord lessons' : 'Strum on the beat'}</h2>
          </div>
          {opened.id === 'lessons' ? (
            <PracticeScreen key={`${unlockKey}:${progressVersion}`} initialChord={opened.chordId} initialMode={opened.mode} allUnlocked={allUnlocked} />
          ) : <StrumDrill />}
        </div>
      ) : (
        <section aria-labelledby="learn-title">
          <header className="learn__course-heading">
            <h1 ref={heading} id="learn-title" tabIndex={-1}>Chord lessons</h1>
            {allUnlocked ? <span className="learn__unlocked" role="status">All lessons unlocked</span> : (
              <button type="button" className="learn__browse" onClick={() => {
                confirmation.current.showModal()
                cancelUnlock.current.focus()
              }}>Unlock all</button>
            )}
          </header>
          <div className="learn__quick">
            <button ref={resume} type="button" className="learn__browse learn__resume" onClick={() => openChord()}>
              {done === CHORDS.length ? 'Review' : 'Continue'} {next.name} <span aria-hidden="true">&rarr;</span>
            </button>
            <button type="button" className="learn__browse" onClick={() => setOpened({ id: 'strum' })}>
              Strum on the beat <small>{strumDone}/{STRUM_STEPS.length} steps passed</small>
            </button>
            <button type="button" className="learn__browse" onClick={() => openChord(next.id, 'play')}>Play it through</button>
          </div>
          <div className="learn__course-progress">
            <span>{done} of {CHORDS.length} chords cleared</span>
            <progress max={CHORDS.length} value={done} aria-label="Chord lessons progress" />
          </div>
          <ChordUnits cleared={cleared} onOpen={openChord} allUnlocked={allUnlocked} nextChord={next} />
          <div className="learn__where">
            {auth?.user && accountStatus !== 'saved' ? (
              <GuitarFeedback kind={accountStatus === 'error' ? 'error' : 'loading'} onRetry={accountStatus === 'error' ? progressSaved : undefined} retryLabel="Retry sync">{where}</GuitarFeedback>
            ) : <p role="status">{where}</p>}
          </div>
          <dialog ref={confirmation} className="learn__confirmation" aria-labelledby="learn-unlock-title" aria-describedby="learn-unlock-warning">
            <h2 id="learn-unlock-title">Are you sure you want to unlock all chord lessons?</h2>
            <p id="learn-unlock-warning">It’s more rewarding to work through each lesson and unlock chords as you go.</p>
            <div className="learn__confirmation-actions">
              <button type="button" className="learn__confirm-yes" onClick={unlockAll}>Yes</button>
              <button ref={cancelUnlock} type="button" className="learn__confirm-no" onClick={() => confirmation.current.close()}>No</button>
            </div>
          </dialog>
        </section>
      )}
    </div>
  )
}
