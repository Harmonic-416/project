import './DynamicsMeter.css'
import { meterFraction } from '../audio/dynamics.js'

const TRENDS = {
  rising: { arrow: '↗', word: 'louder' },
  falling: { arrow: '↘', word: 'softer' },
  steady: { arrow: '→', word: 'steady' },
}

/**
 * How loud you're singing while the mic listens (F19): a level bar and
 * whether it is getting louder or softer. `dynamics` is useMicPitch's
 * { db, trend }, or null between notes.
 */
function DynamicsMeter({ dynamics }) {
  const trend = TRENDS[dynamics?.trend] ?? null
  const fill = dynamics ? meterFraction(dynamics.db) : 0
  return (
    <span className={`dynamics-meter dynamics-meter--${dynamics?.trend ?? 'quiet'}`} title="Your volume">
      <span className="dynamics-meter__bar" aria-hidden="true">
        <span className="dynamics-meter__fill" style={{ width: `${Math.round(fill * 100)}%` }} />
      </span>
      <span className="dynamics-meter__trend">{trend ? `${trend.arrow} ${trend.word}` : '—'}</span>
    </span>
  )
}

export default DynamicsMeter
