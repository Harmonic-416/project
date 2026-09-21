import './MidiUploader.css'

function MidiUploader({ onFileSelected, disabled }) {
  return (
    <label className={`midi-uploader ${disabled ? 'midi-uploader--disabled' : ''}`}>
      <input
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFileSelected(file)
          event.target.value = ''
        }}
      />
      <span>Upload MIDI file</span>
    </label>
  )
}

export default MidiUploader
