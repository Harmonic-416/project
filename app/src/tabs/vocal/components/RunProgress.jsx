import { useId, useState } from 'react'

/** At most this many runs are drawn (the latest); the hidden table lists them all. */
export const MAX_SHOWN = 12

const WIDTH = 320
const HEIGHT = 128
const PLOT = { left: 28, right: 8, top: 18, bottom: 22 }
const BAR_MAX = 24
const CAP = 4

/** A column with a 4px rounded top, square at the baseline. */
function columnPath(x, y, width, base) {
  const r = Math.min(CAP, width / 2, base - y)
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${base}Z`
}

/**
 * The saved practice runs as columns, one per try (score 0–100), so you
 * can see each repetition get better. Single series in the app's teal: the
 * first and latest tries carry their score; hover or focus a column for the
 * rest. A visually hidden table carries every value for screen readers.
 */
function RunProgress({ runs, label }) {
  const [active, setActive] = useState(null)
  const tableId = useId()
  if (!runs.length) return null

  const offset = Math.max(0, runs.length - MAX_SHOWN)
  const shown = runs.slice(offset)
  const plotWidth = WIDTH - PLOT.left - PLOT.right
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom
  const base = PLOT.top + plotHeight
  const slot = plotWidth / Math.max(shown.length, 4)
  const barWidth = Math.min(BAR_MAX, slot - 8)
  const yFor = (score) => base - (Math.max(0, Math.min(100, score)) / 100) * plotHeight
  const latest = shown.length - 1

  return (
    <figure className="run-progress">
      <div className="run-progress__plot">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label} aria-describedby={tableId}>
          {[0, 50, 100].map((tick) => (
            <g key={tick}>
              <line
                className={tick === 0 ? 'run-progress__baseline' : 'run-progress__grid'}
                x1={PLOT.left}
                x2={WIDTH - PLOT.right}
                y1={yFor(tick)}
                y2={yFor(tick)}
              />
              <text className="run-progress__tick" x={PLOT.left - 6} y={yFor(tick) + 3} textAnchor="end">
                {tick}
              </text>
            </g>
          ))}
          {shown.map((run, i) => {
            const x = PLOT.left + slot * i + (slot - barWidth) / 2
            const y = yFor(run.score)
            const tryNumber = offset + i + 1
            const labelled = i === 0 || i === latest || i === active
            return (
              <g
                key={run.at ?? i}
                className={`run-progress__run ${i === active ? 'run-progress__run--active' : ''}`}
                tabIndex={0}
                aria-label={`Try ${tryNumber}: ${run.score}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                {/* The whole column is the hover target, not just the bar. */}
                <rect className="run-progress__hit" x={PLOT.left + slot * i} y={PLOT.top} width={slot} height={plotHeight} />
                <path className="run-progress__bar" d={columnPath(x, Math.min(y, base - 1), barWidth, base)} />
                {labelled && (
                  <text className="run-progress__value" x={x + barWidth / 2} y={Math.min(y, base - 1) - 5} textAnchor="middle">
                    {run.score}
                  </text>
                )}
                <text
                  className={`run-progress__try ${i === latest ? 'run-progress__try--latest' : ''}`}
                  x={x + barWidth / 2}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                >
                  {tryNumber}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <figcaption className="run-progress__caption">
        Score by try{offset > 0 ? ` (last ${MAX_SHOWN})` : ''}
      </figcaption>
      <table id={tableId} className="run-progress__table">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Try</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, i) => (
            <tr key={run.at ?? i}>
              <td>{i + 1}</td>
              <td>{run.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

export default RunProgress
