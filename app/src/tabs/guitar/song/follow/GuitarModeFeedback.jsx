import { createPortal } from 'react-dom'

/** Keep live prompts and recovery controls beside the visible score. */
export default function GuitarModeFeedback({ host, children }) {
  return host ? createPortal(children, host) : children
}
