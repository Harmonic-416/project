/**
 * Pure framing + onset logic for the capture worklet (no Web Audio here, so
 * it runs in Node for tests). The worklet feeds it 128-sample render blocks;
 * every `hop` samples it yields the last `frameSize` samples as one analysis
 * frame, plus the hop's RMS level. `position` is the absolute sample index
 * the frame ends at, so `position / sampleRate` is its time on the capture
 * context's clock.
 *
 * Onsets (strums, plucks): a hop whose RMS jumps to `onsetRatio` times the
 * average of the previous `historyHops` hops (and clears `onsetFloor`) is an
 * onset. A refractory period stops one strum from reporting twice.
 */
export class FrameAssembler {
  constructor({
    frameSize = 2048,
    hop = 512,
    onsetRatio = 3,
    onsetFloor = 0.01,
    historyHops = 8,
    refractoryHops = 8,
  } = {}) {
    if (frameSize % hop !== 0) throw new Error('frameSize must be a multiple of hop')
    this.frameSize = frameSize
    this.hop = hop
    this.onsetRatio = onsetRatio
    this.onsetFloor = onsetFloor
    this.historyHops = historyHops
    this.refractoryHops = refractoryHops
    this.ring = new Float32Array(frameSize)
    this.writeIndex = 0
    this.position = 0
    this.sinceHop = 0
    this.hopSquares = 0
    this.history = []
    this.hopsSinceOnset = Infinity
  }

  /** Push one block of samples; returns the events it completed, oldest first. */
  push(block) {
    const events = []
    for (let i = 0; i < block.length; i += 1) {
      const sample = block[i]
      this.ring[this.writeIndex] = sample
      this.writeIndex = (this.writeIndex + 1) % this.frameSize
      this.position += 1
      this.sinceHop += 1
      this.hopSquares += sample * sample
      if (this.sinceHop === this.hop) this.completeHop(events)
    }
    return events
  }

  completeHop(events) {
    const level = Math.sqrt(this.hopSquares / this.hop)
    this.sinceHop = 0
    this.hopSquares = 0

    this.hopsSinceOnset += 1
    if (this.history.length === this.historyHops) {
      const average = this.history.reduce((sum, value) => sum + value, 0) / this.history.length
      const isOnset =
        level >= this.onsetFloor &&
        level >= average * this.onsetRatio &&
        this.hopsSinceOnset > this.refractoryHops
      if (isOnset) {
        this.hopsSinceOnset = 0
        events.push({ type: 'onset', position: this.position - this.hop, level })
      }
    }
    this.history.push(level)
    if (this.history.length > this.historyHops) this.history.shift()

    // Only full frames: the first frame arrives once frameSize samples exist.
    if (this.position < this.frameSize) return
    const samples = new Float32Array(this.frameSize)
    const tail = this.ring.subarray(this.writeIndex)
    samples.set(tail, 0)
    samples.set(this.ring.subarray(0, this.writeIndex), tail.length)
    events.push({ type: 'frame', samples, level, position: this.position })
  }
}
