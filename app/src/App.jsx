import { useState } from 'react'
import './App.css'
import GuitarTab from './tabs/guitar/GuitarTab.jsx'
import VocalTab from './tabs/vocal/VocalTab.jsx'

const TABS = [
  { id: 'guitar', label: 'Guitar', icon: '🎸', Component: GuitarTab },
  { id: 'vocal', label: 'Vocal', icon: '🎤', Component: VocalTab },
]

function App() {
  const [activeTab, setActiveTab] = useState('guitar')
  const ActiveComponent = TABS.find((tab) => tab.id === activeTab).Component

  return (
    <div className="app">
      <main className="content">
        <ActiveComponent />
      </main>

      <nav className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App
