import GuitarFeedback from './practice/GuitarFeedback.jsx'
import { lazy, Suspense, useCallback, useState, useSyncExternalStore } from 'react'
import { BookOpen, Gauge, Music, Zap } from 'lucide-react'
import './GuitarTab.css'
import PracticeHeaderControls from '../shared/PracticeHeaderControls.jsx'
import { guitarProgress } from './practice/guitarProgress.js'
import Tuner from './tuner/Tuner.jsx'
import AccountChip from '../../auth/AccountChip.jsx'
import Exercises from './exercises/Exercises.jsx'
import LearnTab from './learn/LearnTab.jsx'
import TuneUpPrompt from './tuner/TuneUpPrompt.jsx'
import { createTuningWatch, dismissTunePrompt, isTunePromptDismissed, isTunedThisSession } from './tuner/tuneSession.js'
import { TuningReportContext } from './tuner/tuningReport.js'

// alphaTab is ~1 MB: only download it when the song view is opened.
const GuitarSong = lazy(() => import('./song/GuitarSong.jsx'))

// Line icons drawn in the section's own colour, the same set the Vocal tab's
// sections use (VocalTab SECTIONS), so the two instruments' headers match.
const VIEWS = [
  { id: 'song', label: 'Songs', icon: Music },
  { id: 'learn', label: 'Learn', icon: BookOpen }, // chord lessons, strum on the beat (F18); progress on the account
  { id: 'exercises', label: 'Exercises', icon: Zap }, // ear training (F41)
  { id: 'tuner', label: 'Tuner', icon: Gauge }, // also opens the fretboard map (every note on the neck)
]

/**
 * Guitar: Songs (tab + notation, played along and scored), Learn (the chord
 * lessons and strum on the beat, with progress kept on the account when
 * signed in; `learnProgressVersion` from App.jsx), Exercises to practise on
 * your own, and the Tuner (with the fretboard map under it). Opens on Songs; a shared guitar
 * attempt (`sharedAttemptId`, from a share link via App.jsx) opens there too,
 * and so does a song's practice sessions from Home (`sessionsToOpen`).
 * Until the guitar has been tuned this session, Songs shows a "Tune first?"
 * prompt, and the songs' single notes keep an ear out for it drifting
 * (tuneSession.js); Tune now leads back to where you were.
 */
function GuitarTab({
  auth,
  onNavigate,
  sharedAttemptId,
  onSharedAttemptDone,
  fileToOpenId,
  onFileOpened,
  sessionsToOpen,
  onSessionsOpened,
  learnProgressVersion,
  myFilesVersion,
}) {
  const progress = useSyncExternalStore(guitarProgress.subscribe, guitarProgress.loadProgress, guitarProgress.loadProgress)
  const [view, setView] = useState('song')
  const [returnTo, setReturnTo] = useState(null) // the view "Tune now" came from
  const [tuned, setTuned] = useState(isTunedThisSession)
  const [dismissed, setDismissed] = useState(isTunePromptDismissed)
  const [watch] = useState(() => createTuningWatch())
  const [drift, setDrift] = useState(null)

  const report = useCallback((cents) => setDrift(watch.push(cents)), [watch])

  const open = (next) => {
    if (view === 'tuner') {
      // Back from the tuner: a fresh tune-up starts the drift check over.
      setTuned(isTunedThisSession())
      watch.reset()
      setDrift(null)
    }
    if (next !== 'tuner') setReturnTo(null)
    setView(next)
  }

  const tuneNow = () => {
    setReturnTo(view)
    open('tuner')
  }

  const alreadyTuned = () => {
    dismissTunePrompt()
    setDismissed(true)
    watch.reset()
    setDrift(null)
  }

  const showPrompt = view === 'song' && !dismissed && (drift !== null || !tuned)
  const returnLabel = VIEWS.find((v) => v.id === returnTo)?.label

  return (
    <div className={`guitar-tab guitar-tab--${view}`}>
      <div className="guitar-tab__top">
        <nav className="guitar-tab__views" aria-label="Guitar">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`guitar-tab__view ${view === item.id ? 'guitar-tab__view--active' : ''}`}
              data-view={item.id}
              aria-pressed={view === item.id}
              onClick={() => open(item.id)}
            >
              <span className="guitar-tab__view-icon" aria-hidden="true"><item.icon size="1.1em" aria-hidden="true" /></span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="guitar-tab__end">
          <PracticeHeaderControls
            streak={guitarProgress.currentStreak(progress)}
            practisedToday={guitarProgress.practisedToday(progress)}
            startHint="Finish a Guitar lesson, exercise or practice run to start a streak"
          />
          <AccountChip auth={auth} onNavigate={onNavigate} />
        </div>
      </div>
      {showPrompt && <TuneUpPrompt drift={drift} onTune={tuneNow} onDismiss={alreadyTuned} />}
      <div className="guitar-tab__body">
        <TuningReportContext.Provider value={report}>
          {view === 'tuner' ? (
            <>
              {returnLabel && (
                <button type="button" className="guitar-tab__back" onClick={() => open(returnTo)}>
                  ← Back to {returnLabel}
                </button>
              )}
              <Tuner />
            </>
          ) : view === 'learn' ? (
            <LearnTab auth={auth} progressVersion={learnProgressVersion} />
          ) : view === 'exercises' ? (
            <Exercises />
          ) : (
            <Suspense fallback={<GuitarFeedback>Loading songs...</GuitarFeedback>}>
              <GuitarSong
                auth={auth}
                onNavigate={onNavigate}
                sharedAttemptId={sharedAttemptId}
                onSharedAttemptDone={onSharedAttemptDone}
                fileToOpenId={fileToOpenId}
                onFileOpened={onFileOpened}
                sessionsToOpen={sessionsToOpen}
                onSessionsOpened={onSessionsOpened}
                myFilesVersion={myFilesVersion}
              />
            </Suspense>
          )}
        </TuningReportContext.Provider>
      </div>
    </div>
  )
}

export default GuitarTab
