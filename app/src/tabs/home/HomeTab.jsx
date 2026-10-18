import { useEffect, useState } from 'react'
import './HomeTab.css'
import './HomePage.css'
import AccountCard from '../../auth/AccountCard.jsx'
import AuthPanel from '../../auth/AuthPanel.jsx'
import Avatar from '../../auth/Avatar.jsx'
import { firstNameFor, friendlyAuthError, readOAuthError } from '../../auth/authHelpers.js'
import { GuitarIcon, MicIcon } from '../../nav/TabIcons.jsx'
import { timeAgo } from './homeFormat.js'
import { BackIcon, BoltIcon, ChevronIcon, FileIcon, PeopleIcon, PracticeIcon, TargetIcon } from './homeIcons.jsx'
import MyFilesSection, { FilesSummary } from './MyFilesSection.jsx'
import { ContinuePractice, WorkingOnCards } from './ProgressSection.jsx'
import { InboxSection, SentSection } from './SharedSection.jsx'
import { useHomeData } from './useHomeData.js'

const PARTS = ['friends', 'inbox', 'sent', 'recent', 'latest']
const ACTIVITY_SHOWN = 2
const SONGS_SHOWN = 2

/**
 * Home: your practice at a glance. Continue practice (your latest attempt),
 * the songs you're working on, quick ways into Guitar and Vocal, recent
 * activity (attempts friends sent you and ones you sent, with comments), and
 * the song files kept on this device. "View all" opens a full page for a
 * section, and the chip at the top opens the account page. Friends are in
 * the Social tab.
 *
 * `onOpenAttempt` / `onOpenFile` open an attempt or a file in its
 * instrument's tab.
 */
function HomeTab({ auth, onNavigate, onOpenAttempt, onOpenFile }) {
  const { user, configured, ready } = auth

  // A failed sign-in or "Connect" comes back to the app with the reason in
  // the address bar. Read it once, then tidy the address so a refresh
  // doesn't show the same message again.
  const [notice] = useState(() => {
    const raw = readOAuthError(window.location.href)
    return raw ? friendlyAuthError(raw) : null
  })
  useEffect(() => {
    if (notice) window.history.replaceState(null, '', window.location.pathname)
  }, [notice])

  const signedIn = Boolean(configured && ready && user)
  const [accountOpen, setAccountOpen] = useState(Boolean(notice))

  // The account chip opens a page of its own (back goes to Home).
  if (signedIn && accountOpen) {
    return (
      <div className="home-page">
        <div className="home-tab hp">
          <SubPage title="Account" onBack={() => setAccountOpen(false)}>
            <AccountCard user={user} onSignOut={auth.signOut} notice={notice} />
          </SubPage>
        </div>
      </div>
    )
  }

  return (
    <div className="home-page">
      <div className="home-tab hp">
        <header className="hp-header">
          <div>
            <h1 className="hp-title">
              {user ? (
                <>
                  Welcome back, <span className="hp-accent">{firstNameFor(user)}</span>
                </>
              ) : (
                <>
                  Welcome to <span className="hp-accent">Harmonic</span>
                </>
              )}
            </h1>
            <p className="hp-subtitle">Keep learning guitar and vocal. Small steps make great music.</p>
          </div>
          {signedIn && (
            <button
              type="button"
              className="hp-account"
              aria-label={`Account: ${user.email}`}
              onClick={() => setAccountOpen(true)}
            >
              <Avatar user={user} size={34} />
              <span className="hp-account__name">{firstNameFor(user)}</span>
              <ChevronIcon />
            </button>
          )}
        </header>

        {signedIn ? (
          <SignedInHome user={user} onNavigate={onNavigate} onOpenAttempt={onOpenAttempt} onOpenFile={onOpenFile} />
        ) : (
          <SignedOutHome auth={auth} notice={notice} onNavigate={onNavigate} onOpenFile={onOpenFile} />
        )}
      </div>
    </div>
  )
}

function SignedOutHome({ auth, notice, onNavigate, onOpenFile }) {
  const { configured, ready } = auth
  const [page, setPage] = useState(null)
  if (page === 'files') {
    return (
      <SubPage title="My Files" onBack={() => setPage(null)}>
        <MyFilesSection onOpenFile={onOpenFile} />
      </SubPage>
    )
  }
  return (
    <>
      <div className="hp-card">
        <h2 className="hp-card__title">Sign in</h2>
        {!configured ? (
          <p className="hp-muted">
            Sign-in is off on this copy of the app: copy <code>app/.env.example</code> to <code>app/.env.local</code> and add
            the Supabase key. Everything else works with local files.
          </p>
        ) : !ready ? (
          <p className="hp-muted">Checking your sign-in…</p>
        ) : (
          <>
            <p className="hp-muted">Sign in to keep your results, add friends and get feedback on your attempts.</p>
            <AuthPanel onSignInWith={auth.signInWith} notice={notice} />
          </>
        )}
      </div>
      <QuickPractice onNavigate={onNavigate} />
      <section className="hp-card" aria-labelledby="hp-files">
        <SectionHead id="hp-files" Icon={FileIcon} title="My Files" onViewAll={() => setPage('files')} />
        <FilesSummary onViewAll={() => setPage('files')} />
      </section>
    </>
  )
}

function SignedInHome({ user, onNavigate, onOpenAttempt, onOpenFile }) {
  const { data, errors, reload } = useHomeData(user.id, PARTS)
  const [page, setPage] = useState(null) // null | 'songs' | 'activity' | 'files'
  const [activityTab, setActivityTab] = useState('received')
  const unseen = data.inbox?.filter((item) => !item.seen_at).length ?? 0
  const back = () => setPage(null)

  const activity = (limit) => (
    <Activity
      data={data}
      errors={errors}
      myId={user.id}
      tab={activityTab}
      onTab={setActivityTab}
      unseen={unseen}
      limit={limit}
      onOpenAttempt={onOpenAttempt}
      onChanged={() => reload('inbox')}
    />
  )

  if (page === 'songs') {
    return (
      <SubPage title="Working On" onBack={back}>
        <WorkingOnCards recent={data.recent} error={errors.recent} onOpenAttempt={onOpenAttempt} onNavigate={onNavigate} showAdd />
      </SubPage>
    )
  }
  if (page === 'activity') {
    return (
      <SubPage title="Recent Activity" onBack={back}>
        {activity(null)}
      </SubPage>
    )
  }
  if (page === 'files') {
    return (
      <SubPage title="My Files" onBack={back}>
        <MyFilesSection onOpenFile={onOpenFile} />
      </SubPage>
    )
  }

  return (
    <>
      <section className="hp-card hp-card--glow" aria-labelledby="hp-continue">
        <div className="hp-card__head">
          <h2 id="hp-continue" className="hp-card__title">
            <span className="hp-card__icon">
              <PracticeIcon />
            </span>
            Continue Practice
          </h2>
          {data.latest && <span className="hp-muted hp-small">Latest attempt • {timeAgo(data.latest.created_at)}</span>}
        </div>
        <ContinuePractice
          latest={data.latest}
          recent={data.recent}
          error={errors.latest ?? errors.recent}
          onOpenAttempt={onOpenAttempt}
          onNavigate={onNavigate}
        />
      </section>

      <section aria-labelledby="hp-working">
        <SectionHead id="hp-working" Icon={TargetIcon} title="Working On" pill onViewAll={() => setPage('songs')} />
        <WorkingOnCards
          recent={data.recent}
          error={errors.recent}
          limit={SONGS_SHOWN}
          onOpenAttempt={onOpenAttempt}
          onNavigate={onNavigate}
          showAdd
        />
      </section>

      <QuickPractice onNavigate={onNavigate} />

      <div className="hp-columns">
        <section className="hp-card" aria-labelledby="hp-activity">
          <SectionHead id="hp-activity" Icon={PeopleIcon} title="Recent Activity" onViewAll={() => setPage('activity')} />
          {activity(ACTIVITY_SHOWN)}
        </section>

        <section className="hp-card" aria-labelledby="hp-files">
          <SectionHead id="hp-files" Icon={FileIcon} title="My Files" onViewAll={() => setPage('files')} />
          <FilesSummary onViewAll={() => setPage('files')} />
        </section>
      </div>
    </>
  )
}

/** Received | Sent, each a list of attempts with Open and Comments. */
function Activity({ data, errors, myId, tab, onTab, unseen, limit = null, onOpenAttempt, onChanged }) {
  return (
    <>
      <div className="hp-tabs" role="tablist" aria-label="Recent activity">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'received'}
          className={`hp-tab ${tab === 'received' ? 'is-on' : ''}`}
          onClick={() => onTab('received')}
        >
          Received{unseen > 0 && <span className="hp-tab__count">{unseen}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sent'}
          className={`hp-tab ${tab === 'sent' ? 'is-on' : ''}`}
          onClick={() => onTab('sent')}
        >
          Sent
        </button>
      </div>
      <div role="tabpanel">
        {tab === 'received' ? (
          <InboxSection inbox={data.inbox} error={errors.inbox} myId={myId} limit={limit} onOpenAttempt={onOpenAttempt} onChanged={onChanged} />
        ) : (
          <SentSection sent={data.sent} error={errors.sent} friends={data.friends} myId={myId} limit={limit} onOpenAttempt={onOpenAttempt} />
        )}
      </div>
    </>
  )
}

function QuickPractice({ onNavigate }) {
  return (
    <section aria-labelledby="hp-quick">
      <div className="hp-section-head">
        <h2 id="hp-quick" className="hp-section-title hp-section-title--pill">
          <span className="hp-card__icon hp-card__icon--bolt">
            <BoltIcon />
          </span>
          Quick Practice
        </h2>
        <span className="hp-pill hp-small">Jump into a focused practice session</span>
      </div>
      <div className="hp-quick">
        <button type="button" className="hp-card hp-quick__card hp-quick__card--guitar" onClick={() => onNavigate('guitar')}>
          <span className="hp-art hp-art--guitar" aria-hidden="true">
            <GuitarIcon />
          </span>
          <span className="hp-quick__text">
            <strong>Guitar</strong>
            <small>Tuner, then songs as tab and notation</small>
          </span>
          <ChevronIcon />
        </button>
        <button type="button" className="hp-card hp-quick__card hp-quick__card--vocal" onClick={() => onNavigate('vocal')}>
          <span className="hp-art hp-art--vocal" aria-hidden="true">
            <MicIcon />
          </span>
          <span className="hp-quick__text">
            <strong>Vocal</strong>
            <small>Sheet music, playback and recording</small>
          </span>
          <ChevronIcon />
        </button>
      </div>
    </section>
  )
}

function SectionHead({ id, Icon, title, pill = false, onViewAll }) {
  return (
    <div className={pill ? 'hp-section-head' : 'hp-card__head'}>
      <h2 id={id} className={pill ? 'hp-section-title hp-section-title--pill' : 'hp-card__title'}>
        <span className="hp-card__icon">
          <Icon />
        </span>
        {title}
      </h2>
      {onViewAll && (
        <button type="button" className={pill ? 'hp-pill hp-pill--button' : 'hp-link'} onClick={onViewAll}>
          View all
        </button>
      )}
    </div>
  )
}

/** A "View all" page: back to Home, a title, the full list. */
function SubPage({ title, onBack, children }) {
  return (
    <div className="hp-subpage">
      <button type="button" className="hp-back" onClick={onBack}>
        <BackIcon /> Home
      </button>
      <h2 className="hp-subpage__title">{title}</h2>
      {children}
    </div>
  )
}

export default HomeTab