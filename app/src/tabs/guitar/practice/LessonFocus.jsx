import ChordDiagram from './ChordDiagram.jsx'
import ChordTab from './ChordTab.jsx'
import StringStates from './StringStates.jsx'
import { LABEL_MODES, STRING_NAMES } from './chords.js'

const FINGER_NAMES = ['Open', 'Index', 'Middle', 'Ring', 'Pinky']

/** The existing chord task, presented as a playable, one-chord challenge. */
export default function LessonFocus({ chord, labelMode, onLabelMode, hinting, onHint, strings, verdict }) {
  const placements = chord.frets.map((fret, index) => ({ fret, index, finger: chord.fingers[index] })).filter(({ fret }) => fret > 0)
  return <div className="lesson-coach">
    <div className="lesson-coach__prompt"><span className="lesson-coach__spark" aria-hidden="true">♫</span><div><span className="lesson-coach__eyebrow">ONE SMALL WIN</span><h2>{verdict === 'verified' ? 'That’s the sound!' : `Make ${chord.name} ring`}</h2><p>Build the shape, explore its sound, then give it a strum.</p></div></div>
    <div className="lesson-coach__workspace">
      <div className="lesson-coach__diagram"><ChordDiagram chord={chord} labelMode={labelMode} pulse={hinting} /><div className="practice__labels" role="group" aria-label="Dot labels">{LABEL_MODES.map((mode) => <button key={mode.id} type="button" aria-pressed={labelMode === mode.id} className={labelMode === mode.id ? 'is-active' : ''} onClick={() => onLabelMode(mode.id)}>{mode.label}</button>)}</div></div>
      <div className="lesson-coach__fingers"><h3>Build the shape</h3><ol>{placements.map(({ fret, index, finger }) => <li key={index}><span aria-hidden="true">{finger}</span><div><strong>{FINGER_NAMES[finger]} finger</strong><small>String {6 - index} ({STRING_NAMES[index]}) · fret {fret}</small></div></li>)}</ol><p>{chord.frets.filter((fret) => fret >= 0).length} strings together. {chord.frets.some((fret) => fret < 0) ? 'Leave the crossed-out strings quiet.' : 'Let every string ring.'}</p><button type="button" className="lesson-coach__hear" onClick={() => onHint()}>{hinting ? '♫ Hear each string' : '♫ Hear the chord'}</button></div>
    </div>
    <div className="lesson-coach__sound"><div><strong>Tap a string. Hear its note.</strong><span>Low strings on the left, high strings on the right.</span></div><div className="lesson-coach__strings" role="group" aria-label="Hear individual strings">{chord.frets.map((fret, index) => <button key={index} type="button" disabled={fret < 0} onClick={() => onHint(index)} aria-label={`Hear string ${6 - index} (${STRING_NAMES[index]})`}><strong>{STRING_NAMES[index]}</strong><small>{fret < 0 ? 'Mute' : `String ${6 - index}`}</small></button>)}</div></div>
    <StringStates chord={chord} strings={strings} />
    <details className="lesson-coach__tab"><summary>See this chord as tab</summary><ChordTab chord={chord} /></details>
  </div>
}
