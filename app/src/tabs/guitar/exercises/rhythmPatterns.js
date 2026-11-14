import { COUNT_IN_BEATS, ON_TIME_MS, scoreStrums } from './strumTiming.js'

/** A chosen bar, written in eighth-note positions. Null means keep moving, don't strike. */
export const RHYTHM_PATTERNS = [
  {id:'quarters',name:'Find the pulse',tag:'FOUNDATION',text:'Down on every numbered beat.',slots:['down',null,'down',null,'down',null,'down',null]},
  {id:'halves',name:'Leave some space',tag:'HALF NOTES',text:'Strum on 1 and 3. Let the sound ring between them.',slots:['down',null,null,null,'down',null,null,null]},
  {id:'eighths',name:'Down and up',tag:'EIGHTH NOTES',text:'Down on the numbers, up on every &.',slots:['down','up','down','up','down','up','down','up']},
  {id:'offbeat',name:'Catch the offbeat',tag:'SYNCOPATION',text:'Down on 1 and 2; up on the & after 2, 3 and 4.',slots:['down',null,'down','up',null,'up',null,'up']},
]
export const RHYTHM_BARS = 4
export function rhythmTargets(pattern, bpm, bars = RHYTHM_BARS) {
  if (!pattern?.slots?.length || !Number.isFinite(bpm) || bpm < 40 || bpm > 160) return []
  const beatMs=60000/bpm
  return Array.from({length:bars},(_,bar)=>pattern.slots.flatMap((stroke,i)=>stroke?[{time:(COUNT_IN_BEATS+bar*4+i/2)*beatMs,beat:bar*4+i/2,up:stroke==='up'}]:[])).flat()
}
export function rhythmResult(targets, strikes) {
  const score=scoreStrums(targets,strikes)
  const extras=strikes.length-score.results.filter((result)=>result.strum!==null).length
  return {...score,extras,share:score.total?Math.max(0,score.onTime-extras)/score.total:0,tolerance:ON_TIME_MS}
}
