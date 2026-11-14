import GuitarFeedback from '../practice/GuitarFeedback.jsx'
import DraftNotice from './DraftNotice.jsx'
import TabNotice from './TabNotice.jsx'
import { exportGuitarMidi, exportGuitarPro } from '../notation/exportGuitarNotation.js'

const FORMAT_LABEL = {
  'guitar-pro': 'Guitar Pro',
  alphatex: 'alphaTex',
  musicxml: 'MusicXML',
  mxl: 'MXL',
  midi: 'MIDI',
  musescore: 'MuseScore',
}

/** Song identity, provenance and file actions stay together above every mode. */
export default function SongHeading({ notation, viewingShared, showSessions, onSessions, onBack, exportScore, exportError, storageNotice }) {
  return <>
      {exportError && <GuitarFeedback kind="error">{exportError}</GuitarFeedback>}
      {storageNotice && <p role="status" className="guitar-song__notice">{storageNotice}</p>}
      <div className="guitar-song__toolbar">
        <button
          type="button"
          className="guitar-song__back"
          onClick={onBack}
        >
          {viewingShared ? '← Close' : '← Songs'}
        </button>
        <span className="guitar-song__title">{notation.title}</span>
        <span className={`guitar-song__format ${notation.draft ? 'guitar-song__format--draft' : ''}`}>
          {notation.draft ? 'Draft' : FORMAT_LABEL[notation.format]}
        </span>
        <div className="guitar-song__actions" role="group" aria-label="Song actions">
          {showSessions && (
            <button type="button" onClick={onSessions}>
              Sessions
            </button>
          )}
          <button type="button" onClick={() => exportScore(exportGuitarMidi)}>
            Export MIDI
          </button>
          <button type="button" onClick={() => exportScore(exportGuitarPro)}>
            Export Guitar Pro
          </button>
        </div>
      </div>
      {notation.importNotice && <p role="status" className="guitar-song__notice guitar-song__notice--info">{notation.importNotice}</p>}
      {notation.draft ? (
        <DraftNotice about={notation.draft.about} />
      ) : (
        <TabNotice tab={notation.tab} hasTab={notation.hasTab} originalMidi={notation.format === 'midi'} />
      )}
  </>
}
