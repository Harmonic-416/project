import './NotationUploader.css'
import { NOTATION_ACCEPT } from '../notation/loadNotation.js'

function NotationUploader({ onFileSelected, disabled }) {
  return (
    <label className={`notation-uploader ${disabled ? 'notation-uploader--disabled' : ''}`}>
      <input
        type="file"
        accept={NOTATION_ACCEPT}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFileSelected(file)
          event.target.value = ''
        }}
      />
      <span>Upload MIDI or MusicXML file</span>
    </label>
  )
}

export default NotationUploader
