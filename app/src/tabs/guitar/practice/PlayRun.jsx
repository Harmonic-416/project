import { useLessonCountIn } from './useLessonCountIn.js'
import { useEffect, useState } from 'react'
import ChordDiagram from './ChordDiagram.jsx'
import { BEATS_PER_BAR, LOOP_BPM, LOOP_ROUNDS, playScore } from './playState.js'
import { useStrummingClock } from './useStrummingClock.js'
import './PlayRun.css'

const RESULT_MARK = { verified: '✓', wrong: '✕', silent: '…' }

/** A short musical loop using open lessons. Detection never stops the pulse. */
export default function PlayRun({ chords, state, dispatch, labelMode, advice }) {
  const { status, count, index, results } = state
  const [bpm, setBpm] = useState(LOOP_BPM)
  const countInError = useLessonCountIn(status, count)
  const beat = useStrummingClock(status, index, bpm, dispatch)
  const busy = status === 'countdown' || status === 'running'
  const shapes = [...new Map(chords.map((chord) => [chord.id, chord])).values()]
  const chord = chords[Math.min(index, chords.length - 1)]
  const next = chords[index + 1]
  const round = Math.floor(index / shapes.length) + 1
  const start = () => dispatch({type:'start'})
  useEffect(() => {
    if (status !== 'countdown') return undefined
    const timer = setTimeout(() => dispatch({type:'tick'}), 1000)
    return () => clearTimeout(timer)
  }, [status, count, dispatch])

  return <div className={`strumming-loop strumming-loop--${status}`}>
    <header className="strumming-loop__heading"><div><small>MAKE A LITTLE MUSIC</small><h2>Mini strumming loop</h2><p>One down-strum on each beat. Four beats, then the next chord.</p></div><label className="strumming-loop__tempo">Tempo <select aria-label="Loop tempo" disabled={busy} value={bpm} onChange={(event) => setBpm(Number(event.target.value))}>{[48,60,70,80,90,100,120].map((value) => <option key={value} value={value}>{value} BPM</option>)}</select></label></header>
    {countInError && <p role="status">{countInError}</p>}
    {busy ? <div className="strumming-loop__playing">
      <div className="strumming-loop__target"><h3>{chord.name}</h3><ChordDiagram chord={chord} labelMode={labelMode} />{status === 'countdown' && <div className="play-run__countdown" aria-live="assertive">{count}</div>}</div>
      <div className="strumming-loop__rhythm"><span className="strumming-loop__eyebrow">ROUND {round} OF {LOOP_ROUNDS} · BAR {index + 1} OF {chords.length}</span><h3>{next ? `Next: ${next.name}` : 'Bring it home'}</h3><ol className="strumming-loop__beats" aria-label={status === 'running' ? `Beat ${beat + 1} of ${BEATS_PER_BAR}` : 'Four beats per bar'}>{Array.from({length:BEATS_PER_BAR}, (_, i) => <li key={i} aria-current={status === 'running' && beat === i ? 'step' : undefined}><span aria-hidden="true">↓</span><strong>{i + 1}</strong></li>)}</ol><p role="status">{status === 'countdown' ? 'Get ready…' : results[index] === 'verified' ? 'Chord heard. Keep your rhythm going.' : 'Keep strumming. The beat keeps moving.'}</p><button type="button" className="play-run__stop" onClick={() => dispatch({type:'reset'})}>Stop</button></div>
    </div> : status === 'done' ? <div className="strumming-loop__summary"><span className="strumming-loop__eyebrow">LOOP COMPLETE</span><h3>You kept the music moving.</h3><p className="play-run__score"><strong>{playScore(results).heard} of {results.length}</strong> bars heard</p><p>A bar counts when its chord is recognized.</p><ul className="strumming-loop__results" aria-label="Bar results">{chords.map((item, i) => <li key={`${item.id}-${i}`} title={`Bar ${i + 1}: ${item.name}, ${results[i] === 'verified' ? 'heard' : 'not verified'}`} className={results[i] === 'verified' ? 'is-heard' : ''}>{item.id}<span>{RESULT_MARK[results[i]] ?? '–'}</span></li>)}</ul><button type="button" className="play-run__primary" onClick={start}>Play again</button></div> : <div className="strumming-loop__intro"><div className="strumming-loop__shapes">{shapes.map((item) => <div key={item.id}><strong>{item.name}</strong><ChordDiagram chord={item} labelMode={labelMode} /></div>)}</div><div className="strumming-loop__invitation"><p>{shapes.length === 1 ? 'Start with one chord. Your loop grows as more lessons open.' : `Your newest ${shapes.length} open chords, made into a little loop.`} Play {LOOP_ROUNDS} rounds at your own pace.</p><button type="button" className="play-run__primary" onClick={start}>Start</button></div></div>}
    {status === 'running' && advice && <p className="play-run__hint" role="status">{advice}</p>}
    <ol className="strumming-loop__sequence" aria-label="Loop chords">{shapes.map((item, i) => <li key={item.id} className={busy && index % shapes.length === i ? 'is-current' : ''}><span>{i + 1}</span><strong>{item.id}</strong><small>4 beats</small></li>)}</ol>
  </div>
}
