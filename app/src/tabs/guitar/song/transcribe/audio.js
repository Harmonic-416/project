/**
 * The recording at the rates the models want, with the Web Audio API: the
 * file decoded once, then resampled — 44.1 kHz stereo for the separator,
 * 22.05 kHz mono for Basic Pitch and Beat This!, 16 kHz mono for YAMNet.
 */

/** A compressed recording (MP3, WAV, M4A, OGG…) decoded to an AudioBuffer at its own rate. */
export async function decodeFile(blob) {
  const context = new AudioContext()
  try {
    return await context.decodeAudioData(await blob.arrayBuffer())
  } finally {
    context.close().catch(() => {})
  }
}

/** `buffer` resampled to `rate` with `channels` channels (mono mixes the channels down). */
export async function resample(buffer, channels, rate) {
  const offline = new OfflineAudioContext(channels, Math.max(1, Math.ceil(buffer.duration * rate)), rate)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start()
  return offline.startRendering()
}

/** An AudioBuffer of `channels` (Float32Arrays) at `rate`. */
export function bufferOf(channels, rate) {
  const buffer = new AudioBuffer({ length: channels[0].length, numberOfChannels: channels.length, sampleRate: rate })
  channels.forEach((samples, i) => buffer.copyToChannel(samples, i))
  return buffer
}
