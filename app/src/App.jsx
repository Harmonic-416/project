import { useState } from 'react'
import './App.css'
import HomeTab from './tabs/home/HomeTab.jsx'
import GuitarTab from './tabs/guitar/GuitarTab.jsx'
import VocalTab from './tabs/vocal/VocalTab.jsx'
import { useSession } from './auth/useSession.js'
import { GuitarIcon, HomeIcon, MicIcon } from './nav/TabIcons.jsx'

const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon, Component: HomeTab },
  { id: 'guitar', label: 'Guitar', Icon: GuitarIcon, Component: GuitarTab },
  { id: 'vocal', label: 'Vocal', Icon: MicIcon, Component: VocalTab },
]

function App() {
  const [activeTab, setActiveTab] = useState('home')
  // One session for the whole app: Home owns the sign-in UI, the instrument
  // tabs only read `auth.user` to decide what they may save.
  const auth = useSession()
  const ActiveComponent = TABS.find((tab) => tab.id === activeTab).Component

  return (
    <div className="app">
      <main className="content">
        <ActiveComponent auth={auth} onNavigate={setActiveTab} />
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