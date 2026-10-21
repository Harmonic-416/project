import './PracticeSummary.css'
import RunProgress from './RunProgress.jsx'
import { sessionTrend } from '../practice/scoring.js'

/**
 * The end-of-run card shared by Wait for me and Trouble spots: the run's
 * score, what it was made of (`children`), and this session's tries so far
 * (RunProgress). `charted` is false for a run that didn't cover the whole
 * song (started partway), which is shown but not added to the session.
 */
function PracticeSummary({ title, score, runs, charted = true, chartLabel, children }) {
  const trend = sessionTrend(runs)
  const change = trend && trend.runs > 1 ? trend.change : null
  return (
    <section className="practice-summary" aria-label={title}>
      {score !== null && (
        <div className="practice-summary__head">
          <div className="practice-summary__score">
            <span className="practice-summary__number">{score}</span>
            <span className="practice-summary__out-of">/ 100</span>
          </div>
          <div className="practice-summary__headline">
            <strong>{title}</strong>
            {charted && change !== null && (
              <span className="practice-summary__trend">
                {change > 0 ? `▲ ${change} since your first try` : change < 0 ? `▼ ${-change} since your first try` : 'Same as your first try'}
                {trend.best > trend.latest ? ` · best ${trend.best}` : ''}
              </span>
            )}
            {!charted && <span className="practice-summary__trend">Started partway, so this try isn’t charted.</span>}
          </div>
        </div>
      )}
      {children && <div className="practice-summary__details">{children}</div>}
      {runs.length > 0 && <RunProgress runs={runs} label={chartLabel} />}
    </section>
  )
}

export default PracticeSummary
