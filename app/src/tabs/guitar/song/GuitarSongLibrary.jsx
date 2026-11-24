import { AudioLines, CalendarDays, Guitar, Search } from 'lucide-react'
import TipAnchor from '../../../ui/onboarding/Tip.jsx'
import { usePracticeOnboarding } from '../../../ui/onboarding/useOnboarding.js'
import SongQuickAction from '../../../ui/SongQuickAction.jsx'
import NotationUploader from '../../vocal/components/NotationUploader.jsx'
import OnlineSongs from '../../vocal/components/OnlineSongs.jsx'
import SongLibrary from '../../vocal/components/SongLibrary.jsx'
import { GUITAR_NOTATION_ACCEPT } from '../notation/loadGuitarNotation.js'
import GuitarFeedback from '../practice/GuitarFeedback.jsx'
import MyTranscriptions from './MyTranscriptions.jsx'
import LocalSongs, { guitarSongMeta } from './LocalSongs.jsx'
import TranscribePanel from './TranscribePanel.jsx'
import { BUILT_IN_SONGS } from './songSources.js'

export default function GuitarSongLibrary({
  pageRef, browse, onBrowse, onCreateTranscription, onSessions, configured, supabase,
  status, error, userId, myFilesVersion, open, beginOpen, openBuiltIn, openCloud,
  openUpload, finishTranscription, draftLibrary, drafts, openDraft, removeDraft,
}) {
  const { markActive } = usePracticeOnboarding()
  if (browse === 'transcribe') {
    return (
      <div ref={pageRef} className="guitar-song">
        <div className="guitar-song__toolbar">
          <button type="button" className="guitar-song__back" onClick={() => onBrowse('library')}>
            ← Songs
          </button>
          <span className="guitar-song__title">Tab the guitar from a song</span>
        </div>
        <TipAnchor id="guitar.transcribe"><TranscribePanel onTranscribed={finishTranscription} /></TipAnchor>
      </div>
    )
  }
  if (browse === 'search') {
    return (
      <div ref={pageRef} className="guitar-song">
        <div className="guitar-song__toolbar">
          <button type="button" className="guitar-song__back" onClick={() => onBrowse('library')}>
            ← Songs
          </button>
          <span className="guitar-song__title">Search songs</span>
        </div>
        <TipAnchor id="guitar.search"><OnlineSongs configured={configured} supabase={supabase} onSelectSong={openCloud} instrument="guitar" /></TipAnchor>
        {status === 'loading' && <GuitarFeedback>Opening your score...</GuitarFeedback>}
        {status === 'error' && <GuitarFeedback kind="error">{error} Choose another score to try again.</GuitarFeedback>}
      </div>
    )
  }
  return (
    <div ref={pageRef} className="song-library-page">
      <header className="hm-hero">
        <span className="hm-hero__badge" aria-hidden="true"><Guitar /></span>
        <div>
          <h1 className="hm-hero__title">What do you want to play today?</h1>
          <p className="hm-hero__subtitle">Pick a song, or bring your own Guitar Pro, MusicXML, MIDI or MuseScore file.</p>
        </div>
      </header>

      <div className="song-quick">
        {configured && (
          <>
            <SongQuickAction kind="search" icon={Search} label="Search songs" description="Browse the online song catalog" onClick={() => onBrowse('search')} />
            <SongQuickAction kind="sessions" icon={CalendarDays} label="Practice sessions" description="Your previous sittings, attempts and notes" onClick={onSessions} />
          </>
        )}
        <SongQuickAction kind="transcribe" icon={AudioLines} label="Tab the guitar from a song" description="Turn a recording into guitar tab" onClick={() => onBrowse('transcribe')} />
      </div>

      {status === 'loading' && <GuitarFeedback>Opening your score...</GuitarFeedback>}
      {status === 'error' && <GuitarFeedback kind="error">{error} Choose another score to try again.</GuitarFeedback>}
      <TipAnchor id="guitar.songs">
        <LocalSongs onOpen={open} onBeginOpen={() => { markActive?.(); return beginOpen() }} userId={userId} version={myFilesVersion} />
        {BUILT_IN_SONGS.length > 0 && (
          <section aria-labelledby="built-in-guitar-songs">
            <h2 id="built-in-guitar-songs" className="song-library-heading">Built-in songs</h2>
            <SongLibrary songs={BUILT_IN_SONGS} onSelectSong={(song) => { markActive?.(); openBuiltIn(song) }} renderMeta={guitarSongMeta} />
          </section>
        )}
      </TipAnchor>
      <MyTranscriptions phase={draftLibrary.phase} error={draftLibrary.error} deleting={draftLibrary.deleting} onRetry={draftLibrary.retry} onCreate={onCreateTranscription} drafts={drafts} onOpen={openDraft} onDelete={removeDraft} />

      <div className="song-upload">
        <span className="song-upload__plus" aria-hidden="true">＋</span>
        <p>Have your own score? Open it here. {userId ? 'It’s kept under My songs, on your account, private to you.' : 'It’s kept under My songs on this device.'}</p>
        <NotationUploader onFileSelected={(file) => { markActive?.(); openUpload(file) }} accept={GUITAR_NOTATION_ACCEPT} disabled={status === 'loading'} label="Open a score" />
      </div>
    </div>
  )
}
