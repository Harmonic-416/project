import { useEffect, useRef, useState } from 'react'
import { chordFor } from '../practice/chordNames.js'
import { missedChords, roundScore } from './earTraining.js'

/** Keyboard focus returns to the score, then each missed chord can be replayed. */
export default function EarRoundSummary({ results, onListen, onAgain, onChangeLevel }) {
  const heading = useRef(null)
  const [lastPlayed, setLastPlayed] = useState(null)
  const { correct, total } = roundScore(results)
  const missed = missedChords(results).filter(({ id }) => chordFor(id))
  useEffect(() => { heading.current?.focus() }, [])

  return <div className="exercises__done">
    <h2 className="exercises__score" tabIndex={-1} ref={heading}><strong>{correct} of {total}</strong> correct</h2>
    <p className="exercises__lead">{missed.length ? 'Listen to the chords you missed, then try another round.' : 'Every chord right. Play another round or choose a different level.'}</p>
    {missed.length > 0 && <ul className="exercises__chips" aria-label="Chords to revisit">
      {missed.map(({ id, misses }) => <li key={id}><button type="button" className="exercises__chip" onClick={() => { setLastPlayed(chordFor(id).name); onListen(chordFor(id)) }}>
        <strong>{chordFor(id).name}</strong><small>missed {misses === 1 ? 'once' : `${misses} times`} · ▶ play</small>
      </button></li>)}
    </ul>}
    {lastPlayed && <p role="status" className="exercises__hint">Last played: {lastPlayed}</p>}
    <div className="exercises__actions">
      <button type="button" className="exercises__primary" onClick={onAgain}>Play again</button>
      <button type="button" className="exercises__secondary" onClick={onChangeLevel}>Change level</button>
    </div>
  </div>
}
