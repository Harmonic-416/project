import { finishGuitarPractice } from '../practice/guitarProgress.js'
import { useEffect, useReducer, useState } from 'react'
import { sfx } from '../../vocal/feedback/sfx.js'
import { CHORDS, STRING_NAMES } from '../practice/chords.js'
import { loadCleared, unlockedCount } from '../practice/unlocks.js'
import ChordDiagram from '../practice/ChordDiagram.jsx'
import { useChordPlayer } from '../practice/useChordPlayer.js'
import { missWeights } from './earTraining.js'
import { initialWorkout, matchingStrings, shapeRound, workoutReducer, WORKOUT_QUESTIONS } from './chordWorkouts.js'

export default function ChordWorkout({ kind }) {
  const builder = kind === 'build'
  const [picks, setPicks] = useState(() => CHORDS.slice(0,unlockedCount(loadCleared())).map((chord) => chord.id))
  const [state, dispatch] = useReducer(workoutReducer, undefined, initialWorkout)
  const [soundError, setSoundError] = useState(null)
  const {strum,stop} = useChordPlayer()
  const send = (action) => {setSoundError(null); dispatch(action)}
  const question = state.questions[state.index]
  const asking = state.phase === 'asking'
  const roundDone = state.phase === 'done'
  const playedRound = state.results.some((result) => !result.skipped)
  useEffect(() => {stop()}, [state.index,state.phase,stop])
  useEffect(() => {
    if (state.feedback === 'correct') void sfx.correct()
    if (state.feedback === 'wrong') void sfx.wrong()
  }, [state.feedback, state.attempts])
  useEffect(() => {
    if (roundDone && playedRound) finishGuitarPractice()
  }, [roundDone, playedRound])
  const hear = async () => {try {setSoundError(null); await strum(question.answer)} catch {setSoundError('Sound could not start. You can still finish the visual exercise. Try Hear it again.')}}
  const start = () => send({type:'start',questions:shapeRound(picks,missWeights(state.stats))})
  const currentName = CHORDS.find((chord) => chord.id === question?.answer.id)?.name
  const matches = question ? matchingStrings(state.frets,question.answer) : []

  return <section className={`workout chord-workout chord-workout--${kind}`} aria-label={builder ? 'Build a chord' : 'Name that shape'} data-phase={state.phase}>
    <header className="workout__intro"><span className="workout__eyebrow">{builder ? 'REMEMBER THE SHAPE' : 'SEE IT. KNOW IT.'}</span><h2>{builder ? 'Build a chord' : 'Name that shape'}</h2><p>{builder ? 'Place each string and fret from memory. Open and muted strings count too.' : 'Read the diagram and choose its name. Look at the open and muted strings for clues.'}</p></header>
    {state.phase === 'setup' ? <>
      <div className="workout__setup-note"><strong>Your material, your choice.</strong><p>{WORKOUT_QUESTIONS} questions · no timer · no microphone. Hints and retries are always available.</p><span>{picks.map((id) => id).join(' · ') || 'Choose some chords below.'}</span></div>
      <details className="workout__pool"><summary>Choose your chords · {picks.length} selected</summary><div className="workout__presets"><button type="button" onClick={() => setPicks(CHORDS.slice(0,unlockedCount(loadCleared())).map((c)=>c.id))}>My open lessons</button><button type="button" onClick={() => setPicks(CHORDS.slice(0,6).map((c)=>c.id))}>Beginner six</button></div><div className="workout__chord-picks" role="group" aria-label="Chords to practise">{CHORDS.map((chord) => <button type="button" key={chord.id} aria-pressed={picks.includes(chord.id)} onClick={() => setPicks((current) => current.includes(chord.id) ? current.filter((id)=>id!==chord.id) : [...current,chord.id])}>{chord.name}</button>)}</div></details>
      {picks.length < (builder ? 1 : 2) && <p role="status">Choose at least {builder ? 'one chord' : 'two chords'} to begin. You can add shapes you want to learn.</p>}
      <button type="button" className="workout__primary" disabled={picks.length < (builder ? 1 : 2)} onClick={start}>Start round</button>
    </> : state.phase === 'done' ? <div className="workout__complete"><span className="workout__eyebrow">ROUND COMPLETE</span><h3>{state.results.filter((result)=>result.firstTry).length} of {state.results.length} first try</h3><p>Hints and retries help you learn. Revisit a shape below or start another round; missed shapes get more practice during this visit.</p><div className="workout__review">{[...new Set(state.results.filter((result)=>!result.firstTry).map((result)=>result.id))].map((id)=><details key={id}><summary>Review {CHORDS.find((chord)=>chord.id===id).name}</summary><ChordDiagram chord={CHORDS.find((chord)=>chord.id===id)} labelMode="finger" /></details>)}</div><div className="workout__actions"><button type="button" className="workout__primary" onClick={start}>Another round</button><button type="button" onClick={()=>send({type:'reset'})}>Change chords</button></div></div> : <>
      <div className="workout__progress"><span>Question {state.index+1} of {state.questions.length}</span><progress value={state.index} max={state.questions.length} aria-label="Round progress" /><span>{state.results.filter((result)=>result.firstTry).length} first try</span></div>
      <div className="chord-workout__challenge">
      {builder ? <div className="chord-builder"><div className="chord-builder__heading"><h3>Build {currentName}</h3><p>Low E on the left · choose one position for every string.</p></div><div className="chord-builder__board">{STRING_NAMES.map((name,index)=><fieldset key={index} className={state.feedback==='wrong' ? matches[index] ? 'is-correct' : 'is-wrong' : ''}><legend>{6-index} · {name}</legend>{[-1,0,1,2,3].map((fret)=><button key={fret} type="button" aria-label={`String ${6-index} (${name}): ${fret===-1?'mute':fret===0?'open':`fret ${fret}`}`} aria-pressed={state.frets[index]===fret} disabled={!asking} onClick={()=>send({type:'edit',string:index,fret})}>{fret===-1?'×':fret===0?'○':fret}</button>)}</fieldset>)}</div><div className="workout__actions"><button type="button" className="workout__primary" disabled={!asking||state.frets.includes(null)} onClick={()=>send({type:'check'})}>Check shape</button><button type="button" disabled={!asking} onClick={()=>send({type:'clear'})}>Clear shape</button></div></div> : <div className="chord-quiz"><ChordDiagram chord={question.answer} labelMode="finger" accessibleName={asking&&!state.hinted?'Identify this chord shape':undefined} /><div className="chord-quiz__answers" role="group" aria-label="Chord answers">{question.choices.map((chord)=><button key={chord.id} type="button" disabled={!asking} onClick={()=>send({type:'answer',choice:chord.id})}>{chord.name}</button>)}</div></div>}
      {(state.hinted || !asking) && <div className="chord-workout__hint"><strong>{currentName}</strong>{builder && <ChordDiagram chord={question.answer} labelMode="finger" />}<button type="button" onClick={hear}>Hear it</button><small>{state.hinted&&asking?'Hint used · this one is for learning, not a first-try point.':'Shape recognised. Try it on your guitar too.'}</small></div>}
      </div>
      <p className={`workout__feedback workout__feedback--${state.feedback}`} role="status">{state.feedback==='correct' ? `That’s ${currentName}. Nice work.` : state.feedback==='wrong' ? builder ? 'Not quite. Check the marked strings, then try again.' : 'Not that shape. Take another look or use a hint.' : 'Take your time. Look closely at the strings.'}</p>
      <div className="workout__actions"><button type="button" disabled={!asking} onClick={()=>send({type:'hint'})}>Show hint</button><button type="button" disabled={!asking} onClick={()=>send({type:'skip'})}>Skip</button>{!asking&&<button type="button" className="workout__primary" onClick={()=>send({type:'next'})}>{state.index+1===state.questions.length?'See results':'Next shape'}</button>}<button type="button" onClick={()=>send({type:'reset'})}>End round</button></div>
    </>}
    {soundError && <p role="alert">{soundError}</p>}
  </section>
}
