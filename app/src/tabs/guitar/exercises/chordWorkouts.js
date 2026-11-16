import { CHORDS } from '../practice/chords.js'
import { recordAnswer } from './earTraining.js'

export const WORKOUT_QUESTIONS = 8
const emptyFrets = () => Array(6).fill(null)
const shuffle = (items, random) => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
/** Sample only the explicitly selected shapes; misses affect the next round. */
export function shapeRound(ids, weights = {}, random = Math.random, count = WORKOUT_QUESTIONS) {
  const pool = CHORDS.filter((chord) => ids.includes(chord.id))
  if (!pool.length || !Number.isInteger(count) || count < 1) return []
  let previous = null
  return Array.from({length: count}, () => {
    const candidates = pool.filter((chord) => pool.length === 1 || chord.id !== previous)
    const weight = (chord) => Number.isFinite(weights[chord.id]) && weights[chord.id] > 0 ? weights[chord.id] : 1
    let remaining = random() * candidates.reduce((sum, chord) => sum + weight(chord), 0)
    const answer = candidates.find((chord) => (remaining -= weight(chord)) < 0) ?? candidates.at(-1)
    previous = answer.id
    const others = shuffle(pool.filter((chord) => chord !== answer), random).slice(0, 3)
    return {answer, choices:shuffle([answer, ...others], random)}
  })
}
export const matchingStrings = (frets, chord) => chord.frets.map((fret, i) => frets[i] === fret)
export function initialWorkout() {
  return {phase:'setup', questions:[], index:0, results:[], stats:{}, attempts:0, hinted:false, feedback:null, frets:emptyFrets()}
}
const next = (state) => state.index + 1 >= state.questions.length ? {...state,phase:'done'} : {...state,phase:'asking',index:state.index+1,attempts:0,hinted:false,feedback:null,frets:emptyFrets()}
export function workoutReducer(state, action) {
  if (action.type === 'start') return action.questions?.length ? {...initialWorkout(),phase:'asking',questions:action.questions,stats:state.stats} : state
  if (action.type === 'reset') return {...initialWorkout(),stats:state.stats}
  if (action.type === 'next') return state.phase === 'answered' ? next(state) : state
  if (state.phase !== 'asking') return state
  const chord = state.questions[state.index].answer
  if (action.type === 'edit') {
    if (!Number.isInteger(action.string) || action.string < 0 || action.string > 5 || ![-1,0,1,2,3,4].includes(action.fret)) return state
    return {...state,frets:state.frets.map((fret,i) => i === action.string ? action.fret : fret),feedback:null}
  }
  if (action.type === 'clear') return {...state,frets:emptyFrets(),feedback:null}
  if (action.type === 'hint') return {...state,hinted:true}
  if (action.type === 'skip') return next({...state,results:[...state.results,{id:chord.id,firstTry:false,skipped:true}],stats:recordAnswer(state.stats,chord.id,false)})
  let correct
  if (action.type === 'answer') {
    if (!state.questions[state.index].choices.some((item) => item.id === action.choice)) return state
    correct = action.choice === chord.id
  } else if (action.type === 'check') {
    if (state.frets.includes(null)) return {...state,feedback:'incomplete'}
    correct = matchingStrings(state.frets,chord).every(Boolean)
  } else return state
  const stats = recordAnswer(state.stats,chord.id,correct)
  return correct ? {...state,phase:'answered',feedback:'correct',stats,results:[...state.results,{id:chord.id,firstTry:state.attempts===0&&!state.hinted,skipped:false}]} : {...state,stats,attempts:state.attempts+1,feedback:'wrong'}
}
