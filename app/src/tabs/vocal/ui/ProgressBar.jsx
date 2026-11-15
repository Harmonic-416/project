import './ui.css'

/** A thick rounded bar, `value` of `max`, in the section's accent colour. */
export default function ProgressBar({ value, max, label }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      className="v-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className="v-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
