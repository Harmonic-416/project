import { isScored } from './songTimeline.js'

export const RESULT_LABELS = {
  trouble: { hit: 'Hit', close: 'Close', miss: 'Missed', skipped: 'Not scored' },
  wait: { hit: 'First try', close: 'After retry', miss: 'Manually skipped', skipped: 'Not scored' },
}

/** Review uses the judge's verdicts verbatim. It never infers timing grades. */
export function reviewRows(entries, verdicts, mode) {
  const labels = RESULT_LABELS[mode] ?? RESULT_LABELS.trouble
  return entries.filter((entry) => verdicts[entry.index] != null).map((entry) => {
    const verdict = verdicts[entry.index]
    const excluded = !isScored(entry)
    const reason = excluded ? entry.optional ? 'Left out of the Easy version' : `Technique not judged: ${entry.technique}` : null
    return { entry, verdict, label: excluded ? 'Not scored' : labels[verdict] ?? 'Not heard', reason }
  })
}

