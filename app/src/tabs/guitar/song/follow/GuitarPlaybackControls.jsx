import { createPortal } from 'react-dom'
import PlaybackControls from '../../../vocal/components/PlaybackControls.jsx'

/** Keep mode-owned transport actions on the one toolbar above the score. */
export default function GuitarPlaybackControls({ transportHost, onTransportStart, ...props }) {
  const controls = <PlaybackControls {...props} onPlay={() => { onTransportStart?.(); props.onPlay?.() }} />
  return transportHost ? createPortal(controls, transportHost) : controls
}
