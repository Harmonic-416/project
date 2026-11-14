import GuitarFeedback from '../../practice/GuitarFeedback.jsx'
import { useState } from 'react'
import { fingeringLabel } from './songTimeline.js'
import { reviewRows } from './runReview.js'

export default function RunReview({ entries, verdicts, mode, onSelect }) {
  const [filter, setFilter] = useState('all')
  const [limit, setLimit] = useState(30)
  const rows = reviewRows(entries, verdicts, mode)
  const visible = rows.filter((row) => filter === 'all' || row.verdict === 'miss' || row.verdict === 'close')
  if (!rows.length) return <GuitarFeedback kind="empty">No scored notes were recorded for this run. Start a new run in Wait for me or Trouble spots to build a note-by-note breakdown.</GuitarFeedback>
  return <section className="run-review" aria-label="Run breakdown">
    <div className="run-review__heading"><div><h3>Your run, note by note</h3><p>Select a result to return to that place in the score.</p></div>
      <label>Show <select value={filter} onChange={(e) => { setFilter(e.target.value); setLimit(30) }}><option value="all">All results</option><option value="practice">Needs practice</option></select></label>
    </div>
    {!visible.length && <p>No missed or close notes in this run. Choose All results to see the full breakdown.</p>}
    {visible.length > 0 && <ol className="run-review__list">{visible.slice(0, limit).map(({ entry, verdict, label, reason }) => <li key={entry.index}>
      <button type="button" className={`run-review__item run-review__item--${verdict}`} onClick={() => onSelect(entry)}>
        <span>Bar {entry.bar + 1} · Note {entry.index + 1}<small>{fingeringLabel(entry) || (entry.kind === 'chord' ? 'Chord' : 'Single note')}</small></span>
        <span className="run-review__verdict">{label}{reason && <small>{reason}</small>}</span>
      </button>
    </li>)}</ol>}
    {visible.length > limit && <button type="button" className="practice-status__link" onClick={() => setLimit((n) => n + 30)}>Show more results ({visible.length - limit} remaining)</button>}
  </section>
}
