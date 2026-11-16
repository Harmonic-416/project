/** One presentation for waiting, recovery and empty panels throughout Guitar. */
export default function GuitarFeedback({ kind = 'loading', children, onRetry, retryLabel = 'Try again' }) {
  return (
    <div className={`guitar-feedback guitar-feedback--${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'}>
      <span className="guitar-feedback__symbol" aria-hidden="true">{kind === 'loading' ? '…' : kind === 'error' ? '!' : '♪'}</span>
      <div className="guitar-feedback__body">{children}</div>
      {onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
    </div>
  )
}
