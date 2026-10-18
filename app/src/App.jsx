import { useCallback, useState } from 'react'
import './App.css'
import HomeTab from './tabs/home/HomeTab.jsx'
import GuitarTab from './tabs/guitar/GuitarTab.jsx'
import VocalTab from './tabs/vocal/VocalTab.jsx'
import { useSession } from './auth/useSession.js'
import { GuitarIcon, HomeIcon, MicIcon } from './nav/TabIcons.jsx'
import { readSharedAttemptId, readSharedAttemptInstrument } from './tabs/vocal/share/sharedAttempt.js'
import { readInviteCode } from '@backend/friends'

const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon, Component: HomeTab },
  { id: 'guitar', label: 'Guitar', Icon: GuitarIcon, Component: GuitarTab },
  { id: 'vocal', label: 'Vocal', Icon: MicIcon, Component: VocalTab },
]

// A share link (/?attempt=<id>, plus &instrument=guitar for a guitar attempt)
// is kept in sessionStorage until the attempt has been opened, so it survives
// the Google / GitHub sign-in round trip, which comes back to the bare site
// address.
const PENDING_ATTEMPT_KEY = 'harmonic.pendingSharedAttempt'
const PENDING_INSTRUMENT_KEY = 'harmonic.pendingSharedAttemptInstrument'

/** { id, tab } for a share link being opened, or null. */
function takeSharedAttempt() {
  const fromLink = readSharedAttemptId(window.location.href)
  const tabFor = (instrument) => (instrument === 'guitar' ? 'guitar' : 'vocal')
  const instrument = readSharedAttemptInstrument(window.location.href)
  try {
    if (fromLink) {
      sessionStorage.setItem(PENDING_ATTEMPT_KEY, fromLink)
      sessionStorage.setItem(PENDING_INSTRUMENT_KEY, instrument)
      window.history.replaceState(null, '', window.location.pathname)
      return { id: fromLink, tab: tabFor(instrument) }
    }
    const pending = sessionStorage.getItem(PENDING_ATTEMPT_KEY)
    return pending ? { id: pending, tab: tabFor(sessionStorage.getItem(PENDING_INSTRUMENT_KEY)) } : null
  } catch {
    return fromLink ? { id: fromLink, tab: tabFor(instrument) } : null
  }
}

// An invite link (/?invite=<code>) is kept the same way until Home has
// signed the visitor in and made them friends with whoever sent it.
const PENDING_INVITE_KEY = 'harmonic.pendingInvite'

/** The invite code being opened, or null. */
function takeInvite() {
  const fromLink = readInviteCode(window.location.href)
  try {
    if (fromLink) {
      sessionStorage.setItem(PENDING_INVITE_KEY, fromLink)
      window.history.replaceState(null, '', window.location.pathname)
      return fromLink
    }
    return sessionStorage.getItem(PENDING_INVITE_KEY)
  } catch {
    return fromLink
  }
}

const tabForInstrument = (instrument) => (instrument === 'guitar' ? 'guitar' : 'vocal')

function App() {
  const [sharedAttempt, setSharedAttempt] = useState(takeSharedAttempt)
  const [invite, setInvite] = useState(takeInvite)
  // A file from Home's "My files" to open in its tab: { id, tab }.
  const [fileToOpen, setFileToOpen] = useState(null)
  const [activeTab, setActiveTab] = useState(invite ? 'home' : (sharedAttempt?.tab ?? 'home'))
  // One session for the whole app: Home owns the sign-in UI, the instrument
  // tabs only read `auth.user` to decide what they may save.
  const auth = useSession()
  const ActiveComponent = TABS.find((tab) => tab.id === activeTab).Component

  const sharedAttemptDone = useCallback(() => {
    try {
      sessionStorage.removeItem(PENDING_ATTEMPT_KEY)
      sessionStorage.removeItem(PENDING_INSTRUMENT_KEY)
    } catch {
      // storage blocked: nothing was kept
    }
    setSharedAttempt(null)
  }, [])

  const inviteDone = useCallback(() => {
    try {
      sessionStorage.removeItem(PENDING_INVITE_KEY)
    } catch {
      // storage blocked: nothing was kept
    }
    setInvite(null)
  }, [])

  // Home: open an attempt a friend sent (or one of yours) in its instrument's tab.
  const openAttempt = useCallback(({ id, instrument }) => {
    const tab = tabForInstrument(instrument)
    setSharedAttempt({ id, tab })
    setActiveTab(tab)
  }, [])

  // Home: open a song file kept on this device.
  const openFile = useCallback(({ id, instrument }) => {
    const tab = tabForInstrument(instrument)
    setFileToOpen({ id, tab })
    setActiveTab(tab)
  }, [])
  const fileOpened = useCallback(() => setFileToOpen(null), [])

  return (
    <div className="app">
      <main className="content">
        <ActiveComponent
          auth={auth}
          onNavigate={setActiveTab}
          sharedAttemptId={sharedAttempt?.tab === activeTab ? sharedAttempt.id : null}
          onSharedAttemptDone={sharedAttemptDone}
          fileToOpenId={fileToOpen?.tab === activeTab ? fileToOpen.id : null}
          onFileOpened={fileOpened}
          inviteCode={invite}
          onInviteDone={inviteDone}
          onOpenAttempt={openAttempt}
          onOpenFile={openFile}
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