import { useRef, useState } from 'react'
import { CHORDS } from './chords.js'

const LABELS = {passed:'Completed · Review', skipped:'Skipped · Revisit', unlocked:'Ready to learn', locked:'Not open yet'}

/** Available lessons come first; future lessons are an optional preview. */
export default function ChordPicker({ chord, statuses, onSelect }) {
  const dialog = useRef(null)
  const trigger = useRef(null)
  const [upcoming, setUpcoming] = useState(false)
  const available = CHORDS.filter((item) => statuses[item.id] !== 'locked')
  const close = () => {
    if (dialog.current.close) dialog.current.close()
    else dialog.current.removeAttribute('open')
    trigger.current?.focus()
  }
  const open = () => {
    setUpcoming(false)
    if (dialog.current.showModal) dialog.current.showModal()
    else dialog.current.setAttribute('open', '')
  }
  return <div className="practice__chord-picker">
    <button ref={trigger} type="button" className="chord-picker__trigger" onClick={open}>Choose a chord <span>{chord.id} · {CHORDS.indexOf(chord) + 1} / {CHORDS.length}</span></button>
    <dialog ref={dialog} className="chord-library" aria-labelledby="chord-library-title">
      <header className="chord-library__header"><div><small>YOUR CHORD COLLECTION</small><h2 id="chord-library-title">What would you like to play?</h2><p>{available.length} of {CHORDS.length} lessons open. Review a shape or start your next one.</p></div><button type="button" onClick={close} aria-label="Close chord collection">✕</button></header>
      <div className="chord-library__tabs"><button type="button" aria-pressed={!upcoming} onClick={() => setUpcoming(false)}>Ready to play <span>{available.length}</span></button><button type="button" aria-pressed={upcoming} onClick={() => setUpcoming(true)}>Coming up</button></div>
      <nav aria-label="Chord" className="chord-library__list">{(upcoming ? CHORDS.filter((item) => statuses[item.id] === 'locked') : available).map((item) => {
        const index = CHORDS.indexOf(item)
        const status = statuses[item.id]
        return <button type="button" key={item.id} disabled={status === 'locked'} aria-label={status === 'unlocked' ? item.name : `${item.name}, ${status}`} aria-pressed={item.id === chord.id} onClick={() => {onSelect(index); close()}} className={`chord-library__card chord-library__card--${status}`}>
          <span className="chord-library__badge" aria-hidden="true">{status === 'locked' ? '🔒' : item.id}</span><span><small>LESSON {index + 1}</small><strong>{item.name}</strong><span>{status === 'locked' ? `Clear ${CHORDS[index - 1].name} to open` : LABELS[status]}</span></span><span aria-hidden="true">{item.id === chord.id ? '●' : status === 'locked' ? '' : '→'}</span>
        </button>
      })}{upcoming && available.length === CHORDS.length && <p>Every chord is open. Pick one in Ready to play.</p>}</nav>
      <footer>Passing or skipping a lesson opens the next chord. You can revisit any open lesson.</footer>
    </dialog>
  </div>
}
