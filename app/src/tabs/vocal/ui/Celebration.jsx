import { useEffect, useMemo } from 'react'
import { sfx } from '../feedback/sfx.js'
import { starsFor } from '../feedback/stars.js'
import { recordActivity, recordStars } from '../feedback/progress.js'
import './ui.css'

const CONFETTI_COLORS = [
  'var(--v-primary)',
  'var(--v-gold)',
  'var(--v-learn)',
  'var(--v-warmup)',
  'var(--v-sky)',
  'var(--v-good)',
]

const HEADLINES = ['Keep going!', 'Good start!', 'Great job!', 'Perfect!']

/**
 * The end-of-activity moment: stars, a headline, the score line, a burst of
 * confetti for two stars or more, and the matching sound. `right` of `total`;
 * `children` are the actions (Try again, Next…). `id`
 * names the activity whose best stars are kept (feedback/progress.js).
 */
export default function Celebration({ id, right, total, detail, headline, children }) {
  // Without a score (a warm-up) it's simply finished: full marks, a trophy instead of stars.
  const scored = total != null
  const ratio = !scored ? 1 : total > 0 ? right / total : 0
  const stars = starsFor(ratio)

  useEffect(() => {
    if (stars === 3) sfx.perfect()
    else sfx.complete()
    // `id` keeps the best stars for that activity; either way it counts towards the streak.
    if (id) recordStars(id, stars)
    else recordActivity()
  }, [id, stars])

  const confetti = useMemo(
    () =>
      stars < 2
        ? []
        : Array.from({ length: 36 }, (_, i) => ({
            left: `${(i * 37) % 100}%`,
            color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            dx: `${((i * 53) % 120) - 60}px`,
            dy: `${180 + ((i * 29) % 140)}px`,
            rot: `${360 + ((i * 71) % 540)}deg`,
            delay: `${(i % 9) * 30}ms`,
          })),
    [stars],
  )

  return (
    <div className={`v-celebrate v-celebrate--${stars}`} role="status">
      <div className="v-celebrate__confetti" aria-hidden="true">
        {confetti.map((c, i) => (
          <span
            key={i}
            style={{
              left: c.left,
              background: c.color,
              '--dx': c.dx,
              '--dy': c.dy,
              '--rot': c.rot,
              animationDelay: c.delay,
            }}
          />
        ))}
      </div>
      {scored ? (
        <div className="v-celebrate__stars" aria-label={`${stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`v-star${i < stars ? ' v-star--on' : ''}`}
              style={{ animationDelay: `${150 + i * 140}ms` }}
            >
              ★
            </span>
          ))}
        </div>
      ) : (
        <div className="v-celebrate__trophy" aria-hidden="true">
          🏆
        </div>
      )}
      <p className="v-celebrate__headline">{headline ?? HEADLINES[stars]}</p>
      <p className="v-celebrate__score">
        {scored ? (
          <>
            <strong>{right}</strong> of {total} right{detail ? ` · ${detail}` : ''}
          </>
        ) : (
          detail
        )}
      </p>
      {children && <div className="v-celebrate__actions">{children}</div>}
    </div>
  )
}
