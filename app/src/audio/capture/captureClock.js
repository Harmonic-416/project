/** Project a sample frame into page time without counting the message queue delay. */
export function captureWallTime(frame, sampleRate, contextTime, wallNow) {
  return wallNow + (frame / sampleRate - contextTime) * 1000
}
