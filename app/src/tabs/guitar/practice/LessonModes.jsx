const MODES = [
  ['guided', 'Guided', 'Shape & sound'],
  ['practice', 'Practice', '3 clean strums'],
  ['play', 'Play', 'Steady play-through'],
  ['changes', 'Changes', 'One-minute drill'],
]

export default function LessonModes({ mode, onChange }) {
  return <div className="practice__modes lesson-modes" role="group" aria-label="Practice mode">{MODES.map(([id, title, text]) => <button key={id} type="button" className={`practice__mode ${mode === id ? 'is-active' : ''}`} aria-pressed={mode === id} onClick={() => onChange(id)}><strong>{title}</strong><small>{text}</small></button>)}</div>
}
