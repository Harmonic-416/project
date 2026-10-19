import { useEffect, useRef, useState } from 'react'
import '../../guitar/song/TranscribePanel.css'
import './ArrangePanel.css'
import { VOICINGS } from '../arrange/arrange.js'
import { fetchVideoInfo, parseYouTube } from '../arrange/youtube.js'
import { canArrangeFromLinks, deleteArrangementJob, downloadArrangement, listMyArrangementJobs, requestArrangement } from '@backend/arrangements'

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac,.webm'

// How long it takes, by where the singer is isolated (arrange/pipeline.js's `device`).
const HINT = {
  gpu: 'Using your graphics card, so this takes a minute or two. Keep this tab open.',
  cpu: 'Running on the CPU (this browser has no graphics card it can use), so isolating the singer takes several minutes. Keep this tab open.',
}

// Where the tune can go, per voicing (VOICINGS' `melody`), in words.
const MELODY_LABEL = { 'ttbb:0': 'Tenor 1 (choral)', 'ttbb:1': 'Tenor 2 (barbershop lead)' }

const POLL_MS = 3000
const STATUS_LABEL = { queued: 'Waiting for the server', running: 'Arranging', done: 'Ready', failed: 'Failed' }

/**
 * Arrange a song for voices: a YouTube link to say which performance (its
 * title names the arrangement), the ensemble, then either
 *   - the song's audio as a file, arranged on this device (the stages of
 *     arrange/pipeline.js, with a cancel button), or
 *   - for the Harmonic team (arranger_access), the link alone: a job for
 *     the arranger worker on Harmonic's server (@backend/arrangements),
 *     which fetches the audio from YouTube. Its progress shows here, and
 *     recent ones are listed, so the page can be left and come back to.
 * `onArranged(result)` gets the pipeline's result, or a finished job's
 * ({ musicXml, title, voicing, melodyPartName, key, shift }), with
 * `video` (the link's { id, url, title } or null).
 */
function ArrangePanel({ onArranged, auth, supabase }) {
  const [link, setLink] = useState('')
  const [info, setInfo] = useState(null) // the linked video's { id, title, author, thumbnail }, from YouTube
  const [voicing, setVoicing] = useState('ttbb')
  const [melodyPart, setMelodyPart] = useState(0)
  const [keepKey, setKeepKey] = useState(false)
  const [job, setJob] = useState(null) // { name, label, value, device } while arranging
  const [error, setError] = useState(null)
  const controller = useRef(null)
  const [linkAccess, setLinkAccess] = useState(false) // may queue jobs on the server
  const [jobs, setJobs] = useState([]) // the user's recent link arrangements, newest first
  const [waitingFor, setWaitingFor] = useState(null) // the job just queued from here: opened when done
  const [opening, setOpening] = useState(null) // a job id being downloaded
  const userId = auth?.user?.id ?? null

  // Whether this user is on the arranger list, and their recent jobs.
  useEffect(() => {
    if (!userId || !supabase) return undefined
    let cancelled = false
    canArrangeFromLinks(supabase)
      .then((allowed) => {
        if (cancelled) return
        setLinkAccess(allowed)
        if (allowed) return listMyArrangementJobs(supabase).then((list) => !cancelled && setJobs(list))
        return undefined
      })
      .catch((err) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [userId, supabase])

  // While a job is on its way, its progress is fetched every few seconds.
  const pending = jobs.some((j) => j.status === 'queued' || j.status === 'running')
  useEffect(() => {
    if (!pending || !supabase) return undefined
    const timer = setInterval(() => {
      listMyArrangementJobs(supabase)
        .then(setJobs)
        .catch((err) => console.error(err))
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [pending, supabase])

  const openJob = async (job) => {
    setOpening(job.id)
    setError(null)
    try {
      const musicXml = await downloadArrangement(supabase, job)
      const s = job.summary ?? {}
      await onArranged({
        musicXml,
        title: job.title ?? 'Arrangement',
        voicing: job.voicing,
        melodyPartName: s.melodyPartName,
        key: { name: s.key ?? '' },
        shift: s.shift ?? 0,
        lyricsSource: s.lyrics ?? null,
        video: { id: job.youtube_id, url: `https://www.youtube.com/watch?v=${job.youtube_id}`, title: job.title },
      })
    } catch (err) {
      console.error(err)
      setError(err.message || 'That arrangement couldn’t be opened.')
    } finally {
      setOpening(null)
    }
  }

  // The job queued from here opens by itself when it's done.
  const finished = jobs.find((j) => j.id === waitingFor && (j.status === 'done' || j.status === 'failed'))
  useEffect(() => {
    if (!finished) return
    setWaitingFor(null)
    if (finished.status === 'done') openJob(finished)
    else setError(finished.error || 'That arrangement failed.')
    // openJob is recreated every render; the job finishing is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished?.id, finished?.status])

  const queue = async () => {
    setError(null)
    try {
      const job = await requestArrangement(supabase, { youtubeId: parsed.id, voicing, melodyPart, keepKey })
      setJobs((list) => [job, ...list])
      setWaitingFor(job.id)
    } catch (err) {
      setError(err.message || 'That arrangement couldn’t be queued.')
    }
  }

  const forget = async (job) => {
    try {
      await deleteArrangementJob(supabase, job)
      setJobs((list) => list.filter((j) => j.id !== job.id))
    } catch (err) {
      setError(err.message || 'That arrangement couldn’t be removed.')
    }
  }

  // Leaving the screen cancels an arrangement in progress.
  useEffect(() => () => controller.current?.abort(), [])

  const parsed = parseYouTube(link)
  const badLink = link.trim() !== '' && !parsed
  const videoId = parsed?.id ?? null
  // { id, url, title, author, thumbnail }: title null until (or unless) YouTube says.
  const video = parsed ? { title: null, author: '', thumbnail: null, ...(info?.id === parsed.id ? info : {}), ...parsed } : null
  useEffect(() => {
    if (!videoId) return undefined
    const current = new AbortController()
    fetchVideoInfo(parseYouTube(`https://youtu.be/${videoId}`), { signal: current.signal })
      .then((found) => found && setInfo({ id: videoId, ...found }))
      .catch(() => {})
    return () => current.abort()
  }, [videoId])

  const melodyChoices = VOICINGS[voicing].melody

  const start = async (file) => {
    const current = new AbortController()
    controller.current = current
    setError(null)
    setJob({ name: file.name, label: 'Getting ready', value: 0 })
    try {
      const { arrangeFile } = await import('../arrange/pipeline.js')
      const result = await arrangeFile(file, {
        signal: current.signal,
        voicing,
        melodyPart,
        keepKey,
        title: video?.title ?? undefined,
        onProgress: ({ label, value, device }) => setJob({ name: file.name, label, value, device }),
      })
      current.signal.throwIfAborted()
      await onArranged({ ...result, voicing, video: video ? { id: video.id, url: video.url, title: video.title } : null })
    } catch (err) {
      if (!current.signal.aborted) {
        console.error(err)
        setError(err.message || 'This song couldn’t be arranged.')
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
        <p className="transcribe__file">{video?.title ?? job.name}</p>
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

  return (
    <section className="transcribe arrange">
      <p>
        Harmonic listens to a song’s <strong>lead vocal and chords</strong> and writes a new arrangement of it for
        voices: the tune in one part, the others singing the song’s harmony in block chords, moved to a key that suits
        the singers. Open it like any other song to hear, practise and export each part as MIDI or MusicXML.
      </p>

      <label className="arrange__field">
        <span>YouTube link (optional)</span>
        <input
          type="url"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          aria-invalid={badLink}
        />
      </label>
      {badLink && <p className="arrange__warning">That doesn’t look like a YouTube video link.</p>}
      {video && (
        <div className="arrange__video">
          {video.thumbnail && <img src={video.thumbnail} alt="" width="96" height="72" />}
          <div>
            <strong>{video.title ?? 'YouTube video'}</strong>
            {video.author && <small>{video.author}</small>}
            <a href={video.url} target="_blank" rel="noreferrer">
              Open on YouTube
            </a>
          </div>
        </div>
      )}

      <div className="arrange__options">
        <label className="arrange__field">
          <span>Voices</span>
          <select
            value={voicing}
            onChange={(event) => {
              setVoicing(event.target.value)
              setMelodyPart(VOICINGS[event.target.value].melody[0])
            }}
          >
            {Object.entries(VOICINGS).map(([id, v]) => (
              <option key={id} value={id}>
                {v.label} — {v.voices.map((p) => p.name).join(', ')}
              </option>
            ))}
          </select>
        </label>
        {melodyChoices.length > 1 && (
          <label className="arrange__field">
            <span>Melody in</span>
            <select value={melodyPart} onChange={(event) => setMelodyPart(Number(event.target.value))}>
              {melodyChoices.map((v) => (
                <option key={v} value={v}>
                  {MELODY_LABEL[`${voicing}:${v}`] ?? VOICINGS[voicing].voices[v].name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="arrange__check">
          <input type="checkbox" checked={keepKey} onChange={(event) => setKeepKey(event.target.checked)} />
          <span>Keep the song’s key (otherwise it moves to suit the singers)</span>
        </label>
      </div>

      {parsed && linkAccess && (
        <div className="arrange__server">
          <button type="button" className="arrange__primary" onClick={queue} disabled={Boolean(waitingFor)}>
            Arrange from this link
          </button>
          <small>
            Runs on Harmonic’s server, which fetches the audio itself and adds the lyrics. You can leave this page and
            come back.
          </small>
        </div>
      )}
      {parsed && !linkAccess && (
        <p className="transcribe__note">
          {userId
            ? 'Arranging straight from a link is only open to the Harmonic team for now, so choose the song’s audio below.'
            : 'Choose the song’s audio below. (Signed-in members of the Harmonic team can arrange straight from the link.)'}
        </p>
      )}

      {jobs.length > 0 && (
        <div className="arrange__jobs">
          <h3>From links</h3>
          <ul>
            {jobs.map((job) => {
              const busy = job.status === 'queued' || job.status === 'running'
              return (
                <li key={job.id}>
                  <div className="arrange__job-text">
                    <strong>{job.title ?? `youtu.be/${job.youtube_id}`}</strong>
                    <small>
                      {VOICINGS[job.voicing]?.label} · {busy && job.stage ? job.stage : STATUS_LABEL[job.status]}
                      {busy && job.status === 'running' ? ` ${Math.round(job.progress * 100)}%` : ''}
                      {job.status === 'failed' && job.error ? `: ${job.error}` : ''}
                    </small>
                    {busy && (
                      <div className="transcribe__bar" role="progressbar" aria-valuenow={Math.round(job.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                        <span style={{ width: `${Math.round(job.progress * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  {job.status === 'done' && (
                    <button type="button" className="arrange__open" onClick={() => openJob(job)} disabled={opening === job.id}>
                      {opening === job.id ? 'Opening…' : 'Open'}
                    </button>
                  )}
                  {!busy && (
                    <button type="button" className="arrange__forget" onClick={() => forget(job)} aria-label="Remove">
                      ×
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

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
        <span>Choose the song’s audio: MP3, WAV, M4A or OGG (up to 10 minutes)</span>
      </label>
      <p className="transcribe__note">
        On this device, Harmonic can’t take the audio from YouTube, so use a copy of the song you own or a recording of
        your own. It stays on this device: nothing is uploaded. The first time downloads about 70 MB of listening
        models.
      </p>
      {error && <p className="vocal-tab__status vocal-tab__status--error">{error}</p>}
    </section>
  )
}

export default ArrangePanel
