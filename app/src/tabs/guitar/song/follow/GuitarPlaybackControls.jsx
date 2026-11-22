import { createPortal } from 'react-dom'
import PlaybackControls from '../../../vocal/components/PlaybackControls.jsx'

/** Keep mode-owned transport actions on the one toolbar above the score. */
export default function GuitarPlaybackControls({ transportHost, onTransportStart, startTime = 0, ...props }) {
  const controls = <PlaybackControls
    {...props}
    seekOnInput
    position={Math.max(0, props.position - startTime)}
    duration={props.duration - startTime}
    onSeek={props.onSeek && ((time) => props.onSeek(time + startTime))}
    onPlay={() => { onTransportStart?.(); props.onPlay?.() }}
  />
  return transportHost ? createPortal(controls, transportHost) : controls
}
