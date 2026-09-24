import { FrameAssembler } from './frameAssembler.js'

/**
 * AudioWorklet processor: sees every 128-sample block of the microphone on
 * the audio thread (no polling gaps), hands it to FrameAssembler, and posts
 * frames and onsets to the main thread. Frame buffers are transferred, not
 * copied. Loaded through a `?worker&url` import, so Vite bundles the
 * assembler into this file.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.assembler = new FrameAssembler(options.processorOptions ?? {})
    this.stopped = false
    this.port.onmessage = (event) => {
      if (event.data?.type === 'stop') this.stopped = true
    }
  }

  process(inputs) {
    if (this.stopped) return false
    const channel = inputs[0]?.[0]
    if (channel) {
      for (const event of this.assembler.push(channel)) {
        if (event.type === 'frame') this.port.postMessage(event, [event.samples.buffer])
        else this.port.postMessage(event)
      }
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)
