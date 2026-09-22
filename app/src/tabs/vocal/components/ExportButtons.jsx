import './ExportButtons.css'
import { exportMidi, exportMusicXml } from '../notation/exportNotation.js'

function ExportButtons({ notation, scoreModel, disabled }) {
  return (
    <div className="export-buttons" role="group" aria-label="Export">
      <button type="button" disabled={disabled} onClick={() => exportMusicXml(notation)}>
        Export {notation.format === 'mxl' ? 'MXL' : 'MusicXML'}
      </button>
      <button type="button" disabled={disabled} onClick={() => exportMidi(notation, scoreModel)}>
        Export MIDI
      </button>
    </div>
  )
}

export default ExportButtons
