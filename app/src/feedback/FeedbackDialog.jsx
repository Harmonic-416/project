import { useEffect, useId, useRef, useState } from 'react'
import { MAX_CONTACT, MAX_MESSAGE, sendFeedback } from '@backend/feedback'
import { supabase } from '../lib/supabaseClient.js'
import { AREA_LABELS, canSendFeedback, emptyFeedback, feedbackError } from './feedbackForm.js'
import './FeedbackDialog.css'

const RATINGS = [1, 2, 3, 4, 5]

/**
 * "Send feedback", opened from the tab bar on any tab (App.jsx). The area
 * starts as the tab it was opened from; the rating is optional, and so is an
 * email, asked only of someone signed out (a signed-in message carries the
 * account). The team reads the messages in the Supabase dashboard
 * (migration 0020). `send` and `cloud` are replaceable for tests.
 */
function FeedbackDialog({ tab, signedIn, onClose, send = (input) => sendFeedback(supabase, input), cloud = Boolean(supabase) }) {
  const [form, setForm] = useState(() => emptyFeedback(tab))
  const [status, setStatus] = useState({ state: 'editing', error: null }) // editing | sending | sent
  const titleId = useId()
  const messageRef = useRef(null)

  useEffect(() => {
    messageRef.current?.focus()
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))

  const submit = async (event) => {
    event.preventDefault()
    if (!canSendFeedback(form) || status.state === 'sending') return
    setStatus({ state: 'sending', error: null })
    try {
      await send({
        area: form.area,
        rating: form.rating,
        message: form.message,
        contact: signedIn ? null : form.contact,
        page: `${tab} · ${window.location.pathname}`,
        userAgent: navigator.userAgent,
      })
      setStatus({ state: 'sent', error: null })
    } catch (err) {
      console.error(err)
      setStatus({ state: 'editing', error: feedbackError(err) })
    }
  }

  return (
    <div className="feedback-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="feedback-dialog__head">
          <h2 id={titleId}>Send feedback</h2>
          <button type="button" className="feedback-dialog__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {status.state === 'sent' ? (
          <div className="feedback-dialog__sent" role="status">
            <p>Thanks — the team reads every message.</p>
            <button type="button" className="feedback-dialog__send" onClick={onClose}>
              Done
            </button>
          </div>
        ) : !cloud ? (
          <p className="feedback-dialog__hint">Feedback needs the cloud, which this copy of Harmonic isn’t connected to.</p>
        ) : (
          <form onSubmit={submit}>
            <label className="feedback-dialog__field">
              <span>About</span>
              <select value={form.area} onChange={(e) => set('area')(e.target.value)}>
                {Object.entries(AREA_LABELS).map(([area, label]) => (
                  <option key={area} value={area}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="feedback-dialog__field feedback-dialog__rating">
              <legend>How is it going? (optional)</legend>
              <div>
                {RATINGS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={form.rating !== null && n <= form.rating ? 'is-on' : ''}
                    aria-pressed={form.rating === n}
                    aria-label={`${n} of 5`}
                    onClick={() => set('rating')(form.rating === n ? null : n)}
                  >
                    ★
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="feedback-dialog__field">
              <span>Message</span>
              <textarea
                ref={messageRef}
                rows={5}
                maxLength={MAX_MESSAGE}
                placeholder="What worked, what didn’t, what you’d like to see…"
                value={form.message}
                onChange={(e) => set('message')(e.target.value)}
              />
            </label>

            {!signedIn && (
              <label className="feedback-dialog__field">
                <span>Email, if you’d like an answer (optional)</span>
                <input
                  type="email"
                  maxLength={MAX_CONTACT}
                  autoComplete="email"
                  value={form.contact}
                  onChange={(e) => set('contact')(e.target.value)}
                />
              </label>
            )}

            {status.error && (
              <p className="feedback-dialog__error" role="alert">
                {status.error}
              </p>
            )}

            <button type="submit" className="feedback-dialog__send" disabled={!canSendFeedback(form) || status.state === 'sending'}>
              {status.state === 'sending' ? 'Sending…' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default FeedbackDialog
