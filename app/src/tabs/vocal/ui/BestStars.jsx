import { bestStars } from '../feedback/progress.js'
import { useVocalProgress } from '../feedback/useProgress.js'
import './ui.css'

/** ★★☆ beside an activity's name: its best result so far on this device, or nothing before the first go. */
export default function BestStars({ id }) {
  const progress = useVocalProgress()
  const best = bestStars(id, progress)
  if (best === null) return null
  return (
    <span className="v-best" aria-label={`Best: ${best} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < best ? undefined : 'v-best__off'} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}
