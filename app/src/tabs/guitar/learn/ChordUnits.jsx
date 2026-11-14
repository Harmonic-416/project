import { CHORDS } from '../practice/chords.js'
import { chordStatuses } from '../practice/unlocks.js'

const UNITS = [
  { title: 'Your first chords', text: 'Five shapes that open up a world of songs.', icon: '♪' },
  { title: 'Grow your sound', text: 'New colors, familiar fingers, smoother changes.', icon: '♫' },
  { title: 'Add a little character', text: 'Bring seventh chords into your playing.', icon: '♬' },
  { title: 'Make it your own', text: 'Explore suspended and major seventh shapes.', icon: '✦' },
]

/** Groups are a browseable list; only the existing chord-clear rule locks lessons. */
export default function ChordUnits({ cleared, onOpen }) {
  const statuses = chordStatuses(cleared)
  const currentUnit = Math.floor(Math.max(0, CHORDS.findIndex((chord) => statuses[chord.id] === 'unlocked')) / 5)
  return <div className="learn-units">
    {UNITS.map((unit, index) => {
      const chords = CHORDS.slice(index * 5, index * 5 + 5)
      const done = chords.filter((chord) => ['passed', 'skipped'].includes(statuses[chord.id])).length
      return <details key={unit.title} className="learn-unit" open={index === currentUnit}>
        <summary><span className="learn-unit__icon" aria-hidden="true">{unit.icon}</span><span className="learn-unit__heading"><small>UNIT {index + 1}</small><strong>{unit.title}</strong><span>{unit.text}</span></span><span className="learn-unit__count">{done}/5 <span aria-hidden="true">⌄</span></span></summary>
        <ol className="learn-unit__lessons">
          {chords.map((chord, offset) => {
            const status = statuses[chord.id]
            const label = status === 'passed' ? 'Completed · Review' : status === 'skipped' ? 'Skipped · Revisit' : status === 'locked' ? 'Clear the previous chord to unlock' : 'Ready when you are'
            return <li key={chord.id} className={`learn-lesson learn-lesson--${status}`}>
              <button type="button" disabled={status === 'locked'} onClick={() => onOpen(chord.id)} aria-label={`${chord.name}: ${label}`}>
                <span className="learn-lesson__badge" aria-hidden="true">{status === 'passed' ? '✓' : status === 'locked' ? '🔒' : chord.id}</span>
                <span className="learn-lesson__copy"><strong>{chord.name}</strong><small>Lesson {index * 5 + offset + 1} · {label}</small></span>
                <span aria-hidden="true">{status === 'locked' ? '—' : '→'}</span>
              </button>
            </li>
          })}
        </ol>
      </details>
    })}
  </div>
}
