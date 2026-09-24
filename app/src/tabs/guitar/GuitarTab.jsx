import { lazy, Suspense, useState } from 'react'
import './GuitarTab.css'
import Tuner from './tuner/Tuner.jsx'

// alphaTab is ~1 MB: only download it when the song view is opened.
const GuitarSong = lazy(() => import('./song/GuitarSong.jsx'))

const VIEWS = [
  { id: 'tuner', label: 'Tuner' },
  { id: 'song', label: 'Songs' },
]

/** Guitar: tune first (sound check, F39), then open a song as tab + notation. */
function GuitarTab() {
  const [view, setView] = useState('tuner')

  return (
    <div className="guitar-tab">
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
      <div className="guitar-tab__body">
        {view === 'tuner' ? (
          <Tuner />
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
