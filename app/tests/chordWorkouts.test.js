import { describe, expect, it } from 'vitest'
import { CHORDS } from '../src/tabs/guitar/practice/chords.js'
import { initialWorkout, matchingStrings, shapeRound, workoutReducer } from '../src/tabs/guitar/exercises/chordWorkouts.js'
import { RHYTHM_PATTERNS, rhythmResult, rhythmTargets } from '../src/tabs/guitar/exercises/rhythmPatterns.js'
const em=CHORDS[0]
const start=()=>workoutReducer(initialWorkout(),{type:'start',questions:shapeRound(['Em'],{},()=>0,2)})
describe('selected chord workouts',()=>{
  it('never introduces an unselected shape or duplicate choices and avoids immediate repeats',()=>{
    let seed=123; const random=()=>((seed=seed*16807%2147483647)-1)/2147483646
    const questions=shapeRound(['Em','Am','C','G','unknown'],{},random,100)
    questions.forEach((question,i)=>{
      expect(['Em','Am','C','G']).toContain(question.answer.id)
      expect(new Set(question.choices.map(c=>c.id)).size).toBe(question.choices.length)
      expect(question.choices).toContain(question.answer)
      if(i)expect(question.answer.id).not.toBe(questions[i-1].answer.id)
    })
    expect(shapeRound(['unknown'])).toEqual([])
  })
  it('gives a frequently missed shape more practice opportunities',()=>{
    let seed=123; const random=()=>((seed=seed*16807%2147483647)-1)/2147483646
    const questions=shapeRound(['Em','Am','C'],{Em:3},random,1000)
    expect(questions.filter(q=>q.answer.id==='Em').length).toBeGreaterThan(questions.filter(q=>q.answer.id==='C').length)
  })
  it('requires open and muted strings as well as fretted notes',()=>{
    expect(matchingStrings([0,2,2,0,0,null],em).every(Boolean)).toBe(false)
    expect(matchingStrings(em.frets,em).every(Boolean)).toBe(true)
    let state=start()
    state=workoutReducer(state,{type:'check'})
    expect(state.phase).toBe('asking');expect(state.feedback).toBe('incomplete')
    em.frets.forEach((fret,string)=>{state=workoutReducer(state,{type:'edit',string,fret})})
    state=workoutReducer(state,{type:'check'})
    expect(state.phase).toBe('answered');expect(state.results[0].firstTry).toBe(true)
    expect(workoutReducer(state,{type:'check'}).results).toHaveLength(1)
  })
  it('separates assisted success and retries from first-try points, and records skips once',()=>{
    let state=workoutReducer(start(),{type:'hint'})
    state=workoutReducer(state,{type:'answer',choice:'Em'})
    expect(state.results[0].firstTry).toBe(false)
    state=workoutReducer(state,{type:'next'})
    state=workoutReducer(state,{type:'skip'})
    expect(state.phase).toBe('done');expect(state.results[1].skipped).toBe(true)
    expect(workoutReducer(state,{type:'skip'})).toBe(state)
    state=workoutReducer(state,{type:'reset'})
    expect(state.stats.Em).toEqual({right:1,wrong:1})
  })
})
describe('chosen rhythm patterns',()=>{
  it('places rests and upstrokes on the same count-in clock',()=>{
    expect(rhythmTargets(RHYTHM_PATTERNS[0],60)).toHaveLength(16)
    expect(rhythmTargets(RHYTHM_PATTERNS[1],60)).toHaveLength(8)
    expect(rhythmTargets(RHYTHM_PATTERNS[2],60)).toHaveLength(32)
    expect(rhythmTargets(RHYTHM_PATTERNS[2],60)[1]).toMatchObject({time:4500,up:true})
    expect(rhythmTargets(RHYTHM_PATTERNS[0],0)).toEqual([])
  })
  it('scores accurate strikes and penalizes extra strikes on rests',()=>{
    const targets=rhythmTargets(RHYTHM_PATTERNS[1],60)
    const strikes=targets.map(t=>t.time)
    expect(rhythmResult(targets,strikes)).toMatchObject({onTime:8,total:8,extras:0,share:1})
    expect(rhythmResult(targets,[...strikes,5000])).toMatchObject({extras:1,share:7/8})
    expect(rhythmResult(targets,[])).toMatchObject({onTime:0,share:0})
  })
})
