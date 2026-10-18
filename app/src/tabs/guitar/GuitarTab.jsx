import { lazy, Suspense, useCallback, useState } from 'react'
import './GuitarTab.css'
import Tuner from './tuner/Tuner.jsx'
import AccountChip from '../../auth/AccountChip.jsx'
import Exercises from './exercises/Exercises.jsx'
import Fretboard from './fretboard/Fretboard.jsx'
import TuneUpPrompt from './tuner/TuneUpPrompt.jsx'
import { createTuningWatch, dismissTunePrompt, isTunePromptDismissed, isTunedThisSession } from './tuner/tuneSession.js'
import { TuningReportContext } from './tuner/tuningReport.js'

// alphaTab is ~1 MB: only download it when the song view is opened.
const GuitarSong = lazy(() => import('./song/GuitarSong.jsx'))

const VIEWS = [
  { id: 'song', label: 'Songs' },
  { id: 'exercises', label: 'Exercises' }, // ear training (F41), strum on the beat (F18)
  { id: 'fretboard', label: 'Fretboard' }, // every note on the neck, per tuning
  { id: 'tuner', label: 'Tuner' },
]

/**
 * Guitar: Songs (tab + notation, played along and scored), Exercises to
 * practise on your own, the Fretboard (every note on the neck), and the Tuner. Opens on Songs; a shared guitar
 * attempt (`sharedAttemptId`, from a share link via App.jsx) opens there too.
 * Until the guitar has been tuned this session, Songs shows a "Tune first?"
 * prompt, and the songs' single notes keep an ear out for it drifting
 * (tuneSession.js); Tune now leads back to where you were.
 */
function GuitarTab({ auth, onNavigate, sharedAttemptId, onSharedAttemptDone, fileToOpenId, onFileOpened }) {
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

  const notNow = () => {
    if (drift !== null) {
      watch.reset()
      setDrift(null)
      return
    }
    dismissTunePrompt()
    setDismissed(true)
  }

  const showPrompt = view === 'song' && (drift !== null || (!tuned && !dismissed))
  const returnLabel = VIEWS.find((v) => v.id === returnTo)?.label

  return (
    <div className="guitar-tab">
      <div className="guitar-tab__top">
        <nav className="guitar-tab__views" aria-label="Guitar">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`guitar-tab__view ${view === item.id ? 'guitar-tab__view--active' : ''}`}
              aria-pressed={view === item.id}
              onClick={() => open(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <AccountChip auth={auth} onNavigate={onNavigate} />
      </div>
      {showPrompt && <TuneUpPrompt drift={drift} onTune={tuneNow} onDismiss={notNow} />}
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
          ) : view === 'exercises' ? (
            <Exercises />
          ) : view === 'fretboard' ? (
            <Fretboard />
          ) : (
            <Suspense fallback={<p className="guitar-tab__loading">Loading songs…</p>}>
              <GuitarSong
                auth={auth}
                onNavigate={onNavigate}
                sharedAttemptId={sharedAttemptId}
                onSharedAttemptDone={onSharedAttemptDone}
                fileToOpenId={fileToOpenId}
                onFileOpened={onFileOpened}
              />
            </Suspense>
          )}
        </TuningReportContext.Provider>
      </div>
    </div>
  )
}

export default GuitarTab