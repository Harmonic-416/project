import { useEffect, useRef, useState } from 'react'
import './TranscribePanel.css'

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac,.webm'

// How long it takes, by where the guitar is isolated (pipeline.js's `device`).
const HINT = {
  gpu: 'Using your graphics card, so this takes a minute or two. Keep this tab open.',
  cpu: 'Running on the CPU (this browser has no graphics card it can use), so isolating the guitar takes several minutes. Keep this tab open.',
}

/**
 * Tab the guitar from a song: pick an audio file, watch it go through the
 * stages (transcribe/pipeline.js) — finding the guitar, isolating it from
 * the band, writing down what it plays — and cancel if it's taking too
 * long. A song with no guitar in it stops with a message (and a quiet
 * "Transcribe anyway" for when the listening is wrong). All of it runs on
 * this device; nothing is uploaded. `onTranscribed(file, result)` gets the
 * pipeline's result.
 */
function TranscribePanel({ onTranscribed }) {
  const [job, setJob] = useState(null) // { name, label, value, device } while transcribing
  const [error, setError] = useState(null)
  const [noGuitar, setNoGuitar] = useState(null) // { file, heard } when the song has no guitar part
  const controller = useRef(null)

  // Leaving the screen cancels a transcription in progress.
  useEffect(() => () => controller.current?.abort(), [])

  const start = async (file, { anyway = false } = {}) => {
    const current = new AbortController()
    controller.current = current
    setError(null)
    setNoGuitar(null)
    setJob({ name: file.name, label: 'Getting ready', value: 0 })
    try {
      const { transcribeFile } = await import('./transcribe/pipeline.js')
      const result = await transcribeFile(file, {
        signal: current.signal,
        anyway,
        onProgress: ({ label, value, device }) => setJob({ name: file.name, label, value, device }),
      })
      current.signal.throwIfAborted()
      if (result.status === 'no-guitar') setNoGuitar({ file, heard: result.heard })
      else await onTranscribed(file, result)
    } catch (err) {
      if (!current.signal.aborted) {
        console.error(err)
        setError(err.message || 'This song couldn’t be transcribed.')
      }
    } finally {
      if (controller.current === current) {
        controller.current = null
        setJob(null)
      }
    }
  }

  if (job) {
    const percent = Math.round(job.value * 100)
    return (
      <section className="transcribe" aria-live="polite">
        <p className="transcribe__file">{job.name}</p>
        <div className="transcribe__bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <p className="transcribe__stage">
          {job.label}… {percent}%
        </p>
        <p className="transcribe__hint">{HINT[job.device] ?? 'Keep this tab open.'}</p>
        <button type="button" className="transcribe__cancel" onClick={() => controller.current?.abort()}>
          Cancel
        </button>
      </section>
    )
  }

  if (noGuitar) {
    const share = Math.round(noGuitar.heard * 100)
    return (
      <section className="transcribe" aria-live="polite">
        <h3 className="transcribe__verdict">Guitar doesn’t seem to be part of this song.</h3>
        <p>
          Harmonic listened to <strong>{noGuitar.file.name}</strong> for a guitar
          {share > 0 ? ` and heard one in only about ${share}% of it` : ' and didn’t hear one'}, so there’s no guitar part to
          tab. Try a song with guitar in it.
        </p>
        <div className="transcribe__actions">
          <button type="button" className="transcribe__primary" onClick={() => setNoGuitar(null)}>
            Choose another song
          </button>
          <button type="button" className="transcribe__anyway" onClick={() => start(noGuitar.file, { anyway: true })}>
            Transcribe anyway
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="transcribe">
      <p>
        Pick a song and Harmonic finds <strong>its guitar part</strong>: it isolates the guitar from the rest of the band
        and writes down what it plays, as tab with the chord names over it. Songs without a guitar (rap, techno…) are
        recognised and skipped. A recording of just a guitar works too.
      </p>
      <label className="notation-uploader">
        <input
          type="file"
          accept={AUDIO_ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) start(file)
            event.target.value = ''
          }}
        />
        <span>Choose an MP3, WAV, M4A or OGG (up to 10 minutes)</span>
      </label>
      <p className="transcribe__note">
        Use a song you own, or your own playing. The audio stays on this device: nothing is uploaded. The first time
        downloads about 70 MB of listening models.
      </p>
      {error && <p className="guitar-song__status guitar-song__status--error">{error}</p>}
    </section>
  )
}

export default TranscribePanel
