import workletUrl from './pcm-capture.worklet.js?worker&url'

/**
 * Shared microphone capture: getUserMedia → AudioWorklet → fixed-hop PCM
 * frames, input level and onsets, all client-side (live audio never leaves
 * the device). Frame and onset positions are sample indices on `context`'s
 * clock; divide by `sampleRate` for seconds.
 *
 * Pass `context` to capture on an existing AudioContext (e.g. the one
 * playback runs on, so both share a clock); otherwise one is created and
 * closed again by stop(). Call from a user gesture — iOS only starts audio
 * after a tap.
 */
export async function createCapture({ context, frameSize = 2048, hop = 512, onFrame, onOnset } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone access needs a secure (HTTPS) page in a current browser.')
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  const ownsContext = !context
  const ctx = context ?? new AudioContext()
  try {
    await ctx.resume()
    await ctx.audioWorklet.addModule(workletUrl)
  } catch (err) {
    stream.getTracks().forEach((track) => track.stop())
    if (ownsContext) ctx.close().catch(() => {})
    throw err
  }

  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'pcm-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { frameSize, hop },
  })
  // A muted path to the destination keeps the node in the rendered graph in
  // every browser without making the microphone audible.
  const mute = ctx.createGain()
  mute.gain.value = 0
  source.connect(node)
  node.connect(mute).connect(ctx.destination)

  node.port.onmessage = (event) => {
    const message = event.data
    if (message.type === 'frame') onFrame?.(message)
    else if (message.type === 'onset') onOnset?.(message)
  }

  let stopped = false
  return {
    context: ctx,
    sampleRate: ctx.sampleRate,
    stop() {
      if (stopped) return
      stopped = true
      node.port.postMessage({ type: 'stop' })
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      mute.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      if (ownsContext) ctx.close().catch(() => {})
    },
  }
}
