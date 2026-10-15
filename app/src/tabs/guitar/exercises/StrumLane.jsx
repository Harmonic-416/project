import './StrumDrill.css'

/**
 * The strumming hand, shown rather than filmed: a marker that swings down
 * and up without stopping, one round trip per beat, and a bar of arrows —
 * the strums to hit lit, the "ghost" ones (the hand passes but misses the
 * strings on purpose) faint. `swing`: { key, delayMs } while a run plays —
 * the first downstroke lands `delayMs` after it starts, on the first click.
 * Without it the marker rests.
 */
function StrumLane({ step, swing = null }) {
  const beatSeconds = 60 / step.bpm
  const arrows = Array.from({ length: 8 }, (_, i) => ({ up: i % 2 === 1, hit: i % 2 === 0 || step.per === 2 }))

  return (
    <div className="strum-lane" aria-hidden="true">
      <div className="strum-lane__track">
        <span
          key={swing?.key ?? 'idle'}
          className={`strum-lane__hand ${swing ? 'strum-lane__hand--moving' : ''}`}
          style={swing ? { animationDuration: `${beatSeconds}s`, animationDelay: `${swing.delayMs}ms` } : undefined}
        />
      </div>
      <ol className="strum-lane__arrows">
        {arrows.map((arrow, i) => (
          <li key={i} className={arrow.hit ? 'strum-lane__arrow--hit' : 'strum-lane__arrow--ghost'}>
            {arrow.up ? '↑' : '↓'}
            <small>{arrow.up ? '&' : i / 2 + 1}</small>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default StrumLane
