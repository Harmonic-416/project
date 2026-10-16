import { BasicPitch, addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch'

/**
 * Spotify's basic-pitch (a ~17k parameter polyphonic model running on
 * TensorFlow.js, entirely in the browser): audio in, notes with pitch bends
 * out. Two users:
 *   - the after-the-run check turns a Trouble spots recording into notes,
 *     which matchTranscription.js judges the run against (transcribeRecording);
 *   - transcribing a recording into a draft tab (song/transcribe/), which
 *     also wants the per-frame pitch activations, for the chords
 *     (transcribeAudio with TRANSCRIBE).
 * It works on multi-second chunks, so it's for after the playing, not live.
 *
 * Only ever loaded with import(): TensorFlow.js is large, and stays out of
 * the app bundle and the install-time precache (vite.config.js). The model
 * is copied to public/basic-pitch/ by vite.config.js.
 */

const MODEL_URL = `${import.meta.env.BASE_URL}basic-pitch/model.json`
export const SAMPLE_RATE = 22050 // what the model expects (it refuses anything else)

/** The after-the-run check: basic-pitch's own defaults (onset / frame thresholds, min length in frames). */
export const CHECK = { onset: 0.5, frame: 0.3, minFrames: 5 }

/**
 * Transcribing a recording ("All notes heard"): basic-pitch's own onset and
 * frame thresholds, and only the guitar's range (drop-D low D to a 24th-fret
 * high E). Stricter ones (TabSampler's 0.7 / 0.4, tuned on clean solo
 * guitar) lost most of a full mix: only 4–10% of its frames reach 0.7.
 * Notes start only where the model hears an onset: no onsets inferred from
 * a pitch getting stronger, and no "melodia" notes made of leftover ringing
 * (both only added false notes in tests/transcribeBenchmark.test.js).
 */
export const TRANSCRIBE = { onset: 0.5, frame: 0.3, minFrames: 5, minHz: 70, maxHz: 1400, inferOnsets: false, melodia: false }

// basic-pitch's framing (its toMidi.js): ~86 frames a second, with a small correction per 2 s window.
const FFT_HOP = 256
const ANNOT_N_FRAMES = Math.floor(SAMPLE_RATE / FFT_HOP) * 2
const WINDOW_OFFSET = (FFT_HOP / SAMPLE_RATE) * (ANNOT_N_FRAMES - (SAMPLE_RATE * 2 - FFT_HOP) / FFT_HOP) + 0.0018

/** When activation frame `frame` is, in seconds (basic-pitch's modelFrameToTime). */
export const frameTime = (frame) => (frame * FFT_HOP) / SAMPLE_RATE - WINDOW_OFFSET * Math.floor(frame / ANNOT_N_FRAMES)

let model = null

/** A compressed recording (MP3, WAV, M4A, OGG…) decoded and resampled to the model's 22050 Hz mono. */
export async function decodeForModel(blob) {
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
 * Basic Pitch's output for 22050 Hz mono `audio` (an AudioBuffer from
 * decodeForModel, or the samples as a Float32Array): per-frame activations
 * of the 88 piano pitches (A0 first), timed by frameTime(): `frames` (a
 * pitch sounding), `onsets` (a pitch starting) and `contours` (finer pitch,
 * for bends). `onProgress` gets 0 … 1; `signal` (an AbortSignal) stops it.
 * `basicPitch` is for the tests, which load the model from disk in Node.
 */
export async function evaluateAudio(audio, { onProgress, signal, basicPitch } = {}) {
  model ??= basicPitch ?? new BasicPitch(MODEL_URL)
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
    (percent) => {
      signal?.throwIfAborted()
      onProgress?.(percent)
    },
  )
  return { frames, onsets, contours }
}

/**
 * Notes from evaluateAudio's output: [{ startTimeSeconds, durationSeconds,
 * pitchMidi, amplitude, pitchBends }]. Leaves `output` as it was (basic-pitch
 * edits the arrays it's given).
 */
export function notesFrom({ frames, onsets, contours }, thresholds = CHECK) {
  const { onset, frame, minFrames, minHz = null, maxHz = null, inferOnsets = true, melodia = true } = thresholds
  const copy = (rows) => rows.map((row) => row.slice())
  const events = outputToNotesPoly(copy(frames), copy(onsets), onset, frame, minFrames, inferOnsets, maxHz, minHz, melodia)
  return noteFramesToTime(addPitchBendsToNoteEvents(contours, events))
}

/** evaluateAudio then notesFrom: { notes, frames, onsets }. */
export async function transcribeAudio(audio, { thresholds = CHECK, ...options } = {}) {
  const output = await evaluateAudio(audio, options)
  return { notes: notesFrom(output, thresholds), frames: output.frames, onsets: output.onsets }
}

/**
 * The recording's notes: [{ startTimeSeconds, durationSeconds, pitchMidi,
 * amplitude, pitchBends }], times from the start of the recording.
 * `onProgress` gets 0 … 1.
 */
export async function transcribeRecording(blob, { onProgress } = {}) {
  return (await transcribeAudio(await decodeForModel(blob), { onProgress })).notes
}
