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

/** Activities stay freely selectable; the existing clear-state owns every unlock. */
export default function LearnTab({ auth, progressVersion = 0 }) {
  const [opened, setOpened] = useState(null)
  const page = useRef(null)
  const heading = useRef(null)
  useEffect(() => {
    page.current?.closest('.guitar-tab__body')?.scrollTo?.({top:0})
    heading.current?.focus({preventScroll:true})
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

  return <div ref={page} className={`learn ${opened ? 'learn--in-lesson' : ''}`}>
    {opened ? <div className="learn__activity">
      <div className="learn__activity-top"><button type="button" className="learn__back" onClick={() => setOpened(null)}>&larr; Learn</button><h2 ref={heading} tabIndex={-1}>{opened.id === 'lessons' ? 'Chord lessons' : 'Strum on the beat'}</h2><span className="learn__activity-kind">{opened.id === 'lessons' ? 'YOUR PRACTICE SPACE' : 'FIND YOUR RHYTHM'}</span></div>
      {opened.id === 'lessons' ? <PracticeScreen key={progressVersion} initialChord={opened.chordId} initialMode={opened.mode} /> : <StrumDrill />}
    </div> : <section aria-label="Learn">
      <header className="learn__header"><span className="learn__eyebrow">YOUR GUITAR JOURNEY</span><h1 ref={heading} tabIndex={-1}>Small steps. Real music.</h1><p>A chord, a rhythm, a little more confidence. What will you play today?</p></header>
      <div className="learn__overview">
        <button type="button" className="learn-continue" onClick={() => openChord()} aria-label={`${done === CHORDS.length ? 'Review' : 'Continue'} ${next.name}`}>
          <span className="learn-continue__icon" aria-hidden="true">&#9835;</span><span className="learn-continue__copy"><small>{done === CHORDS.length ? 'MAKE IT SECOND NATURE' : 'YOUR NEXT SMALL WIN'}</small><strong>{done === CHORDS.length ? 'Keep your chords feeling good' : `Make ${next.name} ring`}</strong><span>One shape. One clear sound. You have this.</span><span className="learn-continue__action">{done === CHORDS.length ? 'Review a chord' : 'Let’s play'} <span aria-hidden="true">&rarr;</span></span></span>
        </button>
        <div className="learn-progress"><span className="learn__eyebrow">LOOK HOW FAR YOU’VE COME</span><strong>{done}<small> / {CHORDS.length}</small></strong><span>chords cleared</span><div className="learn-progress__dots" aria-hidden="true">{CHORDS.map((chord) => <span key={chord.id} className={['passed','skipped'].includes(cleared[chord.id]) ? 'is-cleared' : ''} />)}</div><p>{done ? 'Every chord is another song waiting to happen.' : 'Your first small win is waiting.'}</p></div>
      </div>
      <div className="learn__course-heading"><div><span className="learn__eyebrow">BUILD YOUR REPERTOIRE</span><h2>Chord lessons</h2><p>Explore the shape, hear every string, then play it yourself.</p></div><button type="button" className="learn__browse" aria-label="Chord lessons: open practice" onClick={() => openChord()}>Open practice &rarr;</button></div>
      <div className="learn__course-progress"><span>{done} of {CHORDS.length} chords cleared</span><progress max={CHORDS.length} value={done} aria-label="Chord lessons progress" /></div>
      <ChordUnits cleared={cleared} onOpen={openChord} />
      <section className="learn__mix" aria-labelledby="learn-mix-title"><div><span className="learn__eyebrow">MIX UP YOUR PRACTICE</span><h2 id="learn-mix-title">Find your groove</h2><p>Your skills, your choice. Drop into a drill whenever you like.</p></div><ul className="learn__drills">
        <li><button type="button" className="learn-drill" onClick={() => setOpened({id:'strum'})}><span className="learn-drill__icon" aria-hidden="true">&#9833;</span><span><strong>Strum on the beat</strong><small>Find the pulse. Get feedback on your timing.</small><span>{strumDone} of {STRUM_STEPS.length} steps passed</span><progress max={STRUM_STEPS.length} value={strumDone} aria-label="Strum on the beat progress" /></span><span aria-hidden="true">&rarr;</span></button></li>
        <li><button type="button" className="learn-drill" onClick={() => openChord(next.id, 'play')}><span className="learn-drill__icon" aria-hidden="true">&#9654;</span><span><strong>Play it through</strong><small>A steady progression of your learned chords.</small><span>Keep playing. Every chord gets its moment.</span></span><span aria-hidden="true">&rarr;</span></button></li>
      </ul></section>
      <div className="learn__where">{auth?.user && accountStatus !== 'saved' ? <GuitarFeedback kind={accountStatus === 'error' ? 'error' : 'loading'} onRetry={accountStatus === 'error' ? progressSaved : undefined} retryLabel="Retry sync">{where}</GuitarFeedback> : <p role="status">{where}</p>}</div>
    </section>}
  </div>
}
