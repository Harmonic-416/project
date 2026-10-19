import { decodeFile, resample } from '../../guitar/song/transcribe/audio.js'
import { dropBleed } from '../../guitar/song/transcribe/bleed.js'
import { beatChroma, recognizeChords } from '../../guitar/song/transcribe/chords.js'
import { loadRuntime } from '../../guitar/song/transcribe/onnx.js'
import { arrangeSong } from './arrange.js'

/**
 * A song → a new choral arrangement of it, on this device (nothing is
 * uploaded):
 *
 *   decode    the file, then at each model's rate (guitar/…/audio.js)
 *   isolate   the singer pulled out of the band (separate.js, htdemucs_6s's
 *             vocals)
 *   melody    Basic Pitch on the vocals, without what the band bled into
 *             them (bleed.js); arrange.js cuts it to one line
 *   harmony   Basic Pitch on the whole song, for its chord on every beat
 *             (chords.js); the whole song, not the band alone, so an a
 *             cappella recording has chords too
 *   beats     Beat This! on the whole song (beats.js)
 *   arrange   the tune and the chords → the parts (arrange.js)
 *
 * The models are the Guitar tab's transcription models, loaded only when
 * an arrangement starts and cached by the browser after the first time.
 */

// Each stage's share of the progress bar on the CPU (`weight`) and on a graphics card (`gpuWeight`).
export const STAGES = [
  { id: 'decode', label: 'Reading the audio', weight: 0.03, gpuWeight: 0.06 },
  { id: 'isolate', label: 'Isolating the singer', weight: 0.55, gpuWeight: 0.4 },
  { id: 'melody', label: 'Listening to the melody', weight: 0.17, gpuWeight: 0.24 },
  { id: 'harmony', label: 'Listening for the chords', weight: 0.17, gpuWeight: 0.24 },
  { id: 'beats', label: 'Finding the beat', weight: 0.06, gpuWeight: 0.04 },
  { id: 'arrange', label: 'Writing the parts', weight: 0.02, gpuWeight: 0.02 },
]

export const MAX_SECONDS = 10 * 60
export const MAX_BYTES = 100 * 1024 * 1024
const RATE = 22050 // Basic Pitch's and Beat This!'s

/**
 * Basic Pitch on a singer: a man's low E2 to a soprano's high C6; onsets
 * inferred where a pitch gets stronger, since sung notes glide into one
 * another without a fresh attack the way a plucked string has one.
 */
export const SINGING = { onset: 0.5, frame: 0.3, minFrames: 7, minHz: 80, maxHz: 1050, inferOnsets: true, melodia: false }

/** "Weezer - Song (Official Video).mp3" → "Weezer - Song (Official Video)". */
const titleOf = (filename) => filename.replace(/\.[a-z0-9]+$/i, '').trim() || 'Recording'

/**
 * Arrange `file` (a File or Blob with a name). Options are arrangeSong's
 * (`voicing`, `melodyPart`, `keepKey`, `title`, which defaults to the
 * file's name), plus `onProgress({ stage, label, value, device })` (`value`
 * the whole job's 0 … 1) and `signal` (an AbortSignal) to cancel. Returns
 * arrangeSong's result with `title`; throws when no singing is heard.
 */
export async function arrangeFile(file, { onProgress, signal, title, ...options } = {}) {
  if (file.size > MAX_BYTES) throw new Error('That file is over 100 MB. Try a shorter recording.')
  const { gpu } = await loadRuntime()
  let device = gpu ? 'gpu' : 'cpu'
  const share = (s) => (gpu ? s.gpuWeight : s.weight)
  let done = 0
  const stage = (id) => {
    const at = STAGES.findIndex((s) => s.id === id)
    done = STAGES.slice(0, at).reduce((sum, s) => sum + share(s), 0)
    const { label } = STAGES[at]
    const weight = share(STAGES[at])
    onProgress?.({ stage: id, label, value: done, device })
    return (fraction) => onProgress?.({ stage: id, label, value: done + weight * Math.min(1, Math.max(0, fraction)), device })
  }

  stage('decode')
  let decoded
  try {
    decoded = await decodeFile(file)
  } catch {
    throw new Error('This file couldn’t be read as audio. Try an MP3, WAV, M4A or OGG.')
  }
  if (decoded.duration > MAX_SECONDS) throw new Error('That recording is over 10 minutes. Try a shorter one.')
  const song = (await resample(decoded, 1, RATE)).getChannelData(0)
  signal?.throwIfAborted()

  const { separateSource } = await import('../../guitar/song/transcribe/separate.js')
  const stereo = await resample(decoded, 2, 44100)
  const [left, right] = await separateSource([stereo.getChannelData(0), stereo.getChannelData(1)], {
    source: 'vocals',
    onProgress: stage('isolate'),
    onDevice: (where) => {
      device = where
    },
    signal,
  })
  // To mono at Basic Pitch's rate, through Web Audio like the rest.
  const stem = new AudioBuffer({ length: left.length, numberOfChannels: 2, sampleRate: 44100 })
  stem.copyToChannel(left, 0)
  stem.copyToChannel(right, 1)
  const vocals = (await resample(stem, 1, RATE)).getChannelData(0)

  const basicPitch = await import('../../guitar/song/follow/refineWithBasicPitch.js')
  const { notes: heard } = await basicPitch.transcribeAudio(vocals, { thresholds: SINGING, onProgress: stage('melody'), signal })
  const notes = dropBleed(heard, vocals, song)
  if (!notes.length) throw new Error('No singing was heard in this recording.')

  const { frames } = await basicPitch.evaluateAudio(song, { onProgress: stage('harmony'), signal })

  const { trackBeats } = await import('../../guitar/song/transcribe/beats.js')
  const bars = await trackBeats(song, { onProgress: stage('beats'), signal })

  stage('arrange')
  const chords = bars.beats.length ? recognizeChords(beatChroma(frames, basicPitch.frameTime, bars.beats), bars) : []
  const name = title || titleOf(file.name ?? '')
  const result = arrangeSong({ notes, chords, bars }, { ...options, title: name })
  if (!result) throw new Error('No singing was heard in this recording.')
  onProgress?.({ stage: 'arrange', label: STAGES.at(-1).label, value: 1, device })
  return { ...result, title: name }
}
