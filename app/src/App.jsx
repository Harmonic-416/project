import { useCallback, useState } from 'react'
import './App.css'
import HomeTab from './tabs/home/HomeTab.jsx'
import GuitarTab from './tabs/guitar/GuitarTab.jsx'
import VocalTab from './tabs/vocal/VocalTab.jsx'
import { useSession } from './auth/useSession.js'
import { GuitarIcon, HomeIcon, MicIcon } from './nav/TabIcons.jsx'
import { readSharedAttemptId } from './tabs/vocal/share/sharedAttempt.js'

const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon, Component: HomeTab },
  { id: 'guitar', label: 'Guitar', Icon: GuitarIcon, Component: GuitarTab },
  { id: 'vocal', label: 'Vocal', Icon: MicIcon, Component: VocalTab },
]

// A share link (/?attempt=<id>) is kept in sessionStorage until the attempt
// has been opened, so it survives the Google / GitHub sign-in round trip,
// which comes back to the bare site address.
const PENDING_ATTEMPT_KEY = 'harmonic.pendingSharedAttempt'

function takeSharedAttemptId() {
  const fromLink = readSharedAttemptId(window.location.href)
  try {
    if (fromLink) {
      sessionStorage.setItem(PENDING_ATTEMPT_KEY, fromLink)
      window.history.replaceState(null, '', window.location.pathname)
      return fromLink
    }
    return sessionStorage.getItem(PENDING_ATTEMPT_KEY)
  } catch {
    return fromLink
  }
}

function App() {
  const [sharedAttemptId, setSharedAttemptId] = useState(takeSharedAttemptId)
  const [activeTab, setActiveTab] = useState(sharedAttemptId ? 'vocal' : 'home')
  // One session for the whole app: Home owns the sign-in UI, the instrument
  // tabs only read `auth.user` to decide what they may save.
  const auth = useSession()
  const ActiveComponent = TABS.find((tab) => tab.id === activeTab).Component

  const sharedAttemptDone = useCallback(() => {
    try {
      sessionStorage.removeItem(PENDING_ATTEMPT_KEY)
    } catch {
      // storage blocked: nothing was kept
    }
    setSharedAttemptId(null)
  }, [])

  return (
    <div className="app">
      <main className="content">
        <ActiveComponent
          auth={auth}
          onNavigate={setActiveTab}
          sharedAttemptId={sharedAttemptId}
          onSharedAttemptDone={sharedAttemptDone}
        />
      </main>

      <nav className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon" aria-hidden="true">
              <tab.Icon />
            </span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App