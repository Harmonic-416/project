import { BasicPitch, addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch'

/**
 * The after-the-run check's transcription: Spotify's basic-pitch (a ~17k
 * parameter polyphonic model running on TensorFlow.js, entirely in the
 * browser) turns a Trouble spots recording into notes with pitch bends.
 * matchTranscription.js then judges the run against them. It works on
 * multi-second chunks, so it's for after a run, not live.
 *
 * Only ever loaded with import(): TensorFlow.js is large, and stays out of
 * the app bundle and the install-time precache (vite.config.js). The model
 * is copied to public/basic-pitch/ by vite.config.js.
 */

const MODEL_URL = `${import.meta.env.BASE_URL}basic-pitch/model.json`
const SAMPLE_RATE = 22050 // what the model expects (it refuses anything else)

// basic-pitch's own defaults for these: onset / frame thresholds, min length in frames.
const ONSET_THRESHOLD = 0.5
const FRAME_THRESHOLD = 0.3
const MIN_NOTE_FRAMES = 5

let model = null

/** A compressed recording decoded and resampled to the model's 22050 Hz mono. */
async function decodeForModel(blob) {
  const context = new AudioContext()
  let decoded
  try {
    decoded = await context.decodeAudioData(await blob.arrayBuffer())
  } finally {
    context.close().catch(() => {})
  }
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE)), SAMPLE_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  return offline.startRendering()
}

/**
 * The recording's notes: [{ startTimeSeconds, durationSeconds, pitchMidi,
 * amplitude, pitchBends }], times from the start of the recording.
 * `onProgress` gets 0 … 1.
 */
export async function transcribeRecording(blob, { onProgress } = {}) {
  const audio = await decodeForModel(blob)
  model ??= new BasicPitch(MODEL_URL)
  const frames = []
  const onsets = []
  const contours = []
  await model.evaluateModel(
    audio,
    (f, o, c) => {
      frames.push(...f)
      onsets.push(...o)
      contours.push(...c)
    },
    (percent) => onProgress?.(percent),
  )
  return noteFramesToTime(
    addPitchBendsToNoteEvents(contours, outputToNotesPoly(frames, onsets, ONSET_THRESHOLD, FRAME_THRESHOLD, MIN_NOTE_FRAMES)),
  )
}
