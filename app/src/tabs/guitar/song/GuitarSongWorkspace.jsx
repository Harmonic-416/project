import TipAnchor from '../../../ui/onboarding/Tip.jsx'
import SongHeading from './SongHeading.jsx'
import SongSectionPicker from './SongSectionPicker.jsx'
import LocalBackingTrack from './LocalBackingTrack.jsx'
import { TransposeSteps } from '../../vocal/components/TransposeControl.jsx'
import { signed } from '../../vocal/transpose/keyFit.js'
import GuitarFeedback from '../practice/GuitarFeedback.jsx'
import AccompanimentToggle from '../../vocal/components/AccompanimentToggle.jsx'
import PartTabs from '../../vocal/components/PartTabs.jsx'
import PlaybackControls from './follow/GuitarPlaybackControls.jsx'
import ModeCards from '../../vocal/ui/ModeCards.jsx'
import GuitarScore from './GuitarScore.jsx'
import SessionAttempts from '../../vocal/components/SessionAttempts.jsx'
import EasyToggle from './follow/EasyToggle.jsx'
import GuitarSharedPanel from './follow/GuitarSharedPanel.jsx'
import GuitarTroubleMode from './follow/GuitarTroubleMode.jsx'
import GuitarWaitMode from './follow/GuitarWaitMode.jsx'
import SongTransportExtras from './follow/SongTransportExtras.jsx'
import { Settings } from 'lucide-react'
import { lastAndBestLine } from './follow/runHistory.js'
import { GUITAR_ACCOMPANIMENTS } from './follow/modes.js'
import { seekToTick } from './follow/playerControls.js'
import { secondsToTicks, ticksToSeconds } from './follow/songTimeline.js'

export default function GuitarSongWorkspace({ song, workspace, practice, playback, history }) {
  const {
    pageRef, notation, section, viewingShared, score, userId, supabase, shared, auth, shareSong,
  } = song
  const {
    optionsOpen, setOptionsOpen, infoHost, setInfoHost, setTransportHost, setFeedbackHost, setSettingsHost,
    onSessions, onBack, exportScore, exportError, storageNotice,
  } = workspace
  const {
    mode, changeMode, ready, modes, passageKey, changeSection, passageSettings, savedSection, entries,
    practiceTimeline, passageTempo, setPassageTempo, shift, changeShift, shiftDisabled, shiftLimits, shiftError,
    tracks, practised, changeTrack, hasOthers, accompaniment, changeAccompaniment, easy, changeEasy,
    sectionStart, sectionEnd, practiceSession,
  } = practice
  const {
    api, setApi, scoreRef, settingsHost, trackIndexes, setSpeed, stopTrainingRef, referenceOn, setReferenceOn,
    backingActive, timeline, backingError, setBackingError, setBacking, stopBacking, player, enableScoreFollow,
    transportHost, feedbackHost, overlay, scoredTimeline, runSaved, setScoredRunActive, clock, latencyMs,
    setLatencyMs, restoreMix, speed, setTrainingTempo, changePassageLoop, backingStart, backingEnd,
    playSelection, backingTransport,
  } = playback
  const {
    scoresKey, scores, retryHistory, troubleSpots, revealScoreBar,
  } = history
  return (
    <div ref={pageRef} className={`guitar-song guitar-song--open guitar-follow${section && !viewingShared ? ' guitar-song--section' : ''}${optionsOpen ? ' guitar-song--options-open' : ''}`}>
      <header className="song-workspace__heading">
        <SongHeading infoHost={infoHost} notation={notation} viewingShared={viewingShared}
          showSessions={!viewingShared && Boolean(auth?.user && supabase)}
          onSessions={onSessions} onBack={onBack} exportScore={exportScore} exportError={exportError}
          storageNotice={storageNotice} settingsControl={(
            <button type="button" className="song-workspace__options-button" aria-controls="song-practice-options"
              aria-label="Settings" aria-expanded={optionsOpen} onClick={() => setOptionsOpen((open) => !open)}>
              <Settings size="1.15em" aria-hidden="true" />
              <span><strong>Settings</strong>{!viewingShared && <small>{Math.round(speed * 100)}% tempo</small>}</span>
            </button>
          )}
        />
      </header>
      <div className="song-workspace">
        <section className="song-workspace__main" aria-label="Score workspace">
          {!viewingShared && (
            <div className="song-workspace__practice">
              <TipAnchor id="guitar.song.modes" visit={notation.fingerprint}>
                <ModeCards mode={mode} onChange={changeMode} disabled={!ready} modes={modes} playFeedback={false} />
              </TipAnchor>

            </div>
          )}
          <GuitarScore
            key={`${notation.fingerprint}:${shift}`}
            ref={scoreRef}
            settingsHost={settingsHost}
            hideControls={viewingShared}
            sectionFocused={Boolean(section) && !viewingShared}
            score={score}
            songKey={notation.fingerprint}
            userId={userId}
            catalogSongId={notation.catalogSongId}
            client={supabase}
            trackIndexes={trackIndexes}
            onApi={setApi}
            onSpeedChange={setSpeed}
            onManualTempoChange={() => stopTrainingRef.current?.()}
            passageTempo={savedSection ? passageTempo : null}
            onPassageTempoChange={setPassageTempo}
            controlsDisabled={viewingShared || (mode === 'trouble' && player.state === 'playing')}
            backingActive={backingActive}
          />
          {!viewingShared && <div ref={setTransportHost} className="guitar-song__transport-slot" />}
          {!viewingShared && (score.masterBars?.length > 0 || section?.loop) && (
            <div className="song-workspace__section-tools">
              {score.masterBars?.length > 0 && (
                <TipAnchor id="guitar.song.section" visit={notation.fingerprint}>
                  <SongSectionPicker key={passageKey} api={api} barCount={score.masterBars.length} section={section}
                    onChange={changeSection} disabled={!ready || backingActive} storageKey={passageKey} getPassage={passageSettings} />
                </TipAnchor>
              )}
              {section?.loop && !savedSection && !backingActive && <button type="button" className="practice-status__link" onClick={() => changeSection(null)}>Clear trouble spot loop</button>}
            </div>
          )}
        </section>
        <div className="song-workspace__side">
          <div ref={setFeedbackHost} className="song-workspace__feedback" />
          <aside id="song-practice-options" className="song-workspace__sidebar" aria-label="Practice options" hidden={!optionsOpen}>
            <div className="song-workspace__sidebar-heading"><h2>Practice options</h2><button type="button" onClick={() => setOptionsOpen(false)} className="song-workspace__close" aria-label="Close practice options">✕</button></div>
            {!viewingShared && <details className="guitar-song__settings"><summary>Practice settings · part, accompaniment and version</summary><div className="guitar-song__settings-body">
            <PartTabs
              parts={tracks.map((t) => ({ id: t.index, name: t.name }))}
              selected={practised?.index}
              onSelect={changeTrack}
            />

            {mode === 'listen' && !viewingShared && !backingActive && <button type="button" className="guitar-song__reference" aria-pressed={referenceOn} onClick={() => setReferenceOn((on) => !on)} disabled={!ready}>Reference audio {referenceOn ? 'on' : 'off'}</button>}
            {hasOthers && !viewingShared && (
              <AccompanimentToggle
                value={accompaniment}
                mode={mode}
                onChange={changeAccompaniment}
                disabled={!ready}
                options={GUITAR_ACCOMPANIMENTS}
              />
            )}
            {entries.length > 0 && !viewingShared && (
              <EasyToggle easy={easy} onChange={changeEasy} disabled={!ready || (mode === 'trouble' && player.state === 'playing')} />
            )}

            </div></details>}
            {!viewingShared && <div ref={setSettingsHost} className="guitar-song__tempo-slot" />}
            {!viewingShared && <details className="guitar-song__settings">
              <summary>Transpose · {shift ? `${signed(shift)} semitones` : 'As written'}</summary>
              <div className="guitar-song__settings-body">
                <TransposeSteps shift={shift} onChange={changeShift} disabled={shiftDisabled}
                  min={shiftLimits.min} max={shiftLimits.max} label={shift ? `${signed(shift)} semitones` : 'As written'} reset />
                {backingActive && <p>Turn off the backing track to change the tuning shift.</p>}
                {shiftError && <p role="alert">{shiftError}</p>}
              </div>
            </details>}
            {!viewingShared && timeline && <LocalBackingTrack key={notation.fingerprint} api={api} timeline={timeline} ready={ready}
              available={mode === 'listen'} active={backingActive} error={backingError} shifted={shift !== 0}
              onActivate={(track) => { setBackingError(null); setBacking(track) }} onDeactivate={stopBacking} />}

            <div ref={setInfoHost} className="song-workspace__info" />
          </aside>
          <div className="song-workspace__results">
            {!ready && !viewingShared && <GuitarFeedback>Loading guitar sound... {Math.round(player.loaded * 100)}%</GuitarFeedback>}
            {viewingShared && (
              <GuitarSharedPanel
                key={`${shared.attempt.id}:${userId}`}
                onTransportStart={enableScoreFollow}
                attempt={shared.attempt}
                entries={entries}
                overlay={overlay}
                supabase={supabase}
                api={api}
                ready={ready}
                userId={userId}
                scoreFingerprint={notation.fingerprint}
              />
            )}
            {!viewingShared && scoresKey && auth?.user && entries.length > 0 && (
              <section className="guitar-song__history" aria-label="Full run history">
                <strong>Your full runs</strong>
                {scores?.key !== scoresKey ? <GuitarFeedback>Loading your run history...</GuitarFeedback> : scores.error ? <GuitarFeedback kind="error" onRetry={retryHistory} retryLabel="Retry history">{scores.error}</GuitarFeedback> : <p>{lastAndBestLine(scores.stats)}</p>}
                <small>Compared within this mode, part and version. Partial or looped practice does not set a best.</small>
                {scores?.key === scoresKey && (
                  <div className="run-review" aria-label="Recurring trouble spots">
                    <h3>Recurring trouble spots</h3>
                    {!scores.runs ? (
                      <GuitarFeedback kind="error" onRetry={retryHistory} retryLabel="Retry trouble spots">Your trouble spots could not load.</GuitarFeedback>
                    ) : troubleSpots.length === 0 ? (
                      <p>No recurring trouble spots in comparable full runs.</p>
                    ) : (
                      <ul className="run-review__list">
                        {troubleSpots.map(({ bar, difficult, evaluated }) => (
                          <li key={bar}>
                            <button type="button" className="run-review__item" disabled={!ready || player.state === 'playing'}
                              aria-pressed={Boolean(section?.loop && section.first === bar)}
                              onClick={() => {
                                changeSection({ first: bar, last: bar, loop: true })
                                revealScoreBar(bar)
                              }}>
                              <span>Bar {bar + 1}</span>
                              <span>Needed work in {difficult} of {evaluated} runs</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            )}
            {section && !viewingShared && !practiceTimeline ? (
              <GuitarFeedback kind="empty">These bars aren’t played by the score. Choose another section.</GuitarFeedback>
            ) : section && !viewingShared && mode !== 'listen' && !entries.length ? (
              <GuitarFeedback kind="empty">There are no notes for this track in the selected bars.</GuitarFeedback>
            ) : timeline && !viewingShared && mode === 'wait' && entries.length > 0 ? (
              // Keyed by track and version so switching either starts the mode fresh.
              <GuitarWaitMode
                key={`${shift}-${practised.index}-${easy}-${sectionStart}-${sectionEnd}`}
                api={api}
                transportHost={transportHost}
                feedbackHost={feedbackHost}
                onTransportStart={enableScoreFollow}
                onTargetBar={revealScoreBar}
                timeline={scoredTimeline}
                overlay={overlay}
                ready={ready}
                auth={auth}
                supabase={supabase}
                shareSong={shareSong}
                session={practiceSession}
                easy={easy}
                onSaved={runSaved}
                onRunActiveChange={setScoredRunActive}
              />
            ) : timeline && !viewingShared && mode === 'trouble' && entries.length > 0 ? (
              <>
                <GuitarTroubleMode
                  key={`${notation.fingerprint}-${shift}-${practised.index}-${easy}-${sectionStart}-${sectionEnd}`}
                  api={api}
                  transportHost={transportHost}
                  feedbackHost={feedbackHost}
                onTransportStart={enableScoreFollow}
                  score={score}
                  timeline={scoredTimeline}
                  overlay={overlay}
                  player={player}
                  clock={clock}
                  latencyMs={latencyMs}
                  onLatencyChange={setLatencyMs}
                  restoreMix={restoreMix}
                  title={notation.title}
                  auth={auth}
                  supabase={supabase}
                  shareSong={shareSong}
                  session={practiceSession}
                  easy={easy}
                  onSaved={runSaved}
                  onRunActiveChange={setScoredRunActive}
                  speed={speed}
                  setTrainingTempo={setTrainingTempo}
                  stopTrainingRef={stopTrainingRef}
                  onPassageLoopChange={savedSection ? changePassageLoop : undefined}
                  onClearPassage={savedSection ? () => changeSection(null) : undefined}
                />
              </>
            ) : (
              // Someone's shared run plays their recording (GuitarSharedPanel), never the song's MIDI.
              timeline &&
              !viewingShared && (
                <>
                  <PlaybackControls
                    transportHost={transportHost}
                onTransportStart={enableScoreFollow}
                    state={player.state}
                    position={ticksToSeconds(timeline.tempoMap, player.tick)}
                    duration={backingEnd ?? practiceTimeline.duration}
                    startTime={backingStart ?? practiceTimeline.startTime}
                    rate={speed}
                    onPlay={playSelection}
                    onPause={() => api?.pause()}
                    onStop={() => api?.stop()}
                    onSeek={(seconds) => {
                      if (api) seekToTick(api, secondsToTicks(timeline.tempoMap, seconds))
                    }}
                    disabled={!ready}
                  />
                  {(!section || savedSection || backingActive) && <SongTransportExtras api={api} disabled={!ready || (savedSection && player.state === 'playing')}
                    onLoopChange={savedSection && !backingActive ? changePassageLoop : undefined}
                    onClear={backingActive ? () => backingTransport.current?.clearSelection() : savedSection ? () => changeSection(null) : undefined} />}
                </>
              )
            )}
            {!viewingShared && auth?.user && (practiceSession.session || practiceSession.attempts.length > 0 || practiceSession.error) && (practiceSession.session?.user_id === userId || practiceSession.attempts.length === 0) && (
              <section className="guitar-song__session" aria-label="Current practice session">
                {practiceSession.error && <p role="alert">{practiceSession.error} Your playing still works. Reopen the song to retry saving.</p>}
                <SessionAttempts supabase={supabase} session={practiceSession} />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
