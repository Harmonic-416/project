import { lazy, Suspense, useState } from 'react'
import './GuitarTab.css'
import Tuner from './tuner/Tuner.jsx'
import AccountChip from '../../auth/AccountChip.jsx' // NEW: account button
import PracticeScreen from './practice/PracticeScreen.jsx' // NEW: practice screen

// alphaTab is ~1 MB: only download it when the song view is opened.
const GuitarSong = lazy(() => import('./song/GuitarSong.jsx'))

const VIEWS = [
  { id: 'tuner', label: 'Tuner' },
  { id: 'practice', label: 'Practice' }, // NEW
  { id: 'song', label: 'Songs' },
]

/** Guitar: tune first (sound check, F39), then open a song as tab + notation. */
// NEW: takes auth + onNavigate (App.jsx already passes them) for the account button
function GuitarTab({ auth, onNavigate }) {
  const [view, setView] = useState('tuner')

  return (
    <div className="guitar-tab">
      {/* NEW: row holding the Tuner | Songs switch and the account button */}
      <div className="guitar-tab__top">
        <nav className="guitar-tab__views" aria-label="Guitar">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`guitar-tab__view ${view === item.id ? 'guitar-tab__view--active' : ''}`}
              aria-pressed={view === item.id}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {/* NEW: account button */}
        <AccountChip auth={auth} onNavigate={onNavigate} />
      </div>
      <div className="guitar-tab__body">
        {view === 'tuner' ? (
          <Tuner />
        ) : view === 'practice' ? (
          <PracticeScreen /> // NEW
        ) : (
          <Suspense fallback={<p className="guitar-tab__loading">Loading songs…</p>}>
            <GuitarSong />
          </Suspense>
        )}
      </div>
    </div>
  )
}

export default GuitarTab