import './NotationUploader.css'
import { NOTATION_ACCEPT } from '../notation/loadNotation.js'

/** File picker for notation; `accept` and `label` default to the Vocal tab's formats. */
function NotationUploader({ onFileSelected, disabled, accept = NOTATION_ACCEPT, label = 'Upload MIDI or MusicXML file' }) {
  return (
    <label className={`notation-uploader ${disabled ? 'notation-uploader--disabled' : ''}`}>
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFileSelected(file)
          event.target.value = ''
        }}
      />
      <span>{label}</span>
    </label>
  )
}

export default NotationUploader
