import { finishGuitarPractice } from '../practice/guitarProgress.js'
import { useOnboardingBusy, usePracticeOnboarding } from '../../../ui/onboarding/useOnboarding.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { createClick } from '../../../audio/metronome/click.js'
import { useGuitarListener } from '../song/follow/useGuitarListener.js'
import { loadLatency } from '../song/follow/songClock.js'
import { soundsLikeAStrum } from './strumHearing.js'
import { COUNT_IN_BEATS, ON_TIME_MS, tendency } from './strumTiming.js'
import { RHYTHM_BARS, RHYTHM_PATTERNS, rhythmResult, rhythmTargets } from './rhythmPatterns.js'

function scheduleClicks(click,bpm) {
  const first=Tone.now()+.2, beatSeconds=60/bpm
  for(let i=0;i<COUNT_IN_BEATS+RHYTHM_BARS*4;i++) click.trigger(first+i*beatSeconds,i%4===0)
  return performance.now()+(first-Tone.getContext().rawContext.currentTime)*1000
}

export default function RhythmStudio() {
  const [patternId,setPatternId]=useState(RHYTHM_PATTERNS[0].id)
  const [bpm,setBpm]=useState(70)
  const [input,setInput]=useState('tap')
  const [status,setStatus]=useState('idle')
  const [elapsed,setElapsed]=useState(-1)
  const [strikes,setStrikes]=useState(0)
  const [score,setScore]=useState(null)
  const [error,setError]=useState(null)
  const run=useRef(null), generation=useRef(0), timer=useRef(null), click=useRef(null)
  const tapButton=useRef(null)
  const pattern=RHYTHM_PATTERNS.find((item)=>item.id===patternId)
  const addStrike=useCallback((wall,source)=>{
    const active=run.current
    if (!active || active.input!==source) return
    const at=wall-active.wall0
    const start=COUNT_IN_BEATS*60000/active.bpm
    const end=(COUNT_IN_BEATS+RHYTHM_BARS*4)*60000/active.bpm
    if (at<start-ON_TIME_MS || at>end+ON_TIME_MS) return
    active.strikes.push(at)
    setStrikes(active.strikes.length)
  },[])
  const onWindow=useCallback((window)=>{
    if (run.current?.input==='mic' && soundsLikeAStrum(window)) addStrike(window.wall-run.current.latency,'mic')
  },[addStrike])
  const listener=useGuitarListener({onWindow})
  const {stop:stopListening}=listener
  const stop=useCallback(()=>{
    generation.current++; run.current=null; clearTimeout(timer.current); click.current?.silence(); stopListening(); setStatus('idle'); setElapsed(-1)
  },[stopListening])
  useEffect(()=>()=>{generation.current++; run.current=null; clearTimeout(timer.current); click.current?.dispose(); stopListening()},[stopListening])
  useEffect(()=>{
    if (status!=='running' || input!=='tap') return undefined
    const key=(event)=>{
      if (event.code!=='Space'||event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target?.closest('button,input,select,textarea,a,summary')) return
      event.preventDefault(); addStrike(performance.now(),'tap')
    }
    window.addEventListener('keydown',key)
    return ()=>window.removeEventListener('keydown',key)
  },[status,input,addStrike])
  const { markActive, startWithMicrophone } = usePracticeOnboarding()
  const begin=async()=>{
    if (input !== 'tap' && startWithMicrophone && !(await startWithMicrophone())) return
    markActive?.()
    const version=++generation.current
    setStatus('starting');setError(null);setScore(null);setStrikes(0);setElapsed(-1)
    try {
      if (input==='mic') {
        const ready=await listener.start()
        if (version!==generation.current) return
        if (!ready) {stopListening();setStatus('idle');setError('Microphone unavailable. Choose Tap the rhythm to practise without it, or allow access and try again.');return}
      }
      await Tone.start()
      if (version!==generation.current) return
      click.current??=createClick();click.current.setVolume(.5)
      const wall0=scheduleClicks(click.current,bpm)
      const active={pattern,bpm,input,latency:input==='mic'?loadLatency():0,wall0,strikes:[]}
      run.current=active;setStatus('running')
      const update=()=>{
        if (version!==generation.current || run.current!==active) return
        const at=performance.now()-wall0
        setElapsed(at)
        if (at>=(COUNT_IN_BEATS+RHYTHM_BARS*4)*60000/bpm+250) {
          run.current = null
          click.current?.silence()
          stopListening()
          setScore(rhythmResult(rhythmTargets(active.pattern, active.bpm), active.strikes))
          setStatus('done')
          if (active.strikes.length) finishGuitarPractice({ sound: active.input === 'tap' })
          return
        }
        timer.current=setTimeout(update,40)
      }
      update()
    } catch {
      if(version!==generation.current)return
      run.current=null;clearTimeout(timer.current);click.current?.silence();stopListening();setStatus('idle');setError('The click could not start. Check your sound output, then try again.')
    }
  }
  const busy=status==='starting'||status==='running'
  useOnboardingBusy(busy)
  const countIn=elapsed<COUNT_IN_BEATS*60000/bpm
  const slot=Math.max(0,Math.floor((elapsed-COUNT_IN_BEATS*60000/bpm)/(30000/bpm)))%8
  const bar=Math.min(RHYTHM_BARS,Math.max(1,Math.floor((elapsed-COUNT_IN_BEATS*60000/bpm)/(240000/bpm))+1))
  useEffect(()=>{if(status==='running'&&!countIn&&input==='tap')tapButton.current?.focus()},[status,countIn,input])
  return <section className="workout rhythm-studio" aria-label="Rhythm studio">
    <header className="workout__intro"><span className="workout__eyebrow">FIND YOUR GROOVE</span><h2>Rhythm studio</h2><p>Keep the hand moving. Choose when it meets the strings.</p></header>
    <div className="rhythm-studio__settings"><label>Pattern<select aria-label="Rhythm pattern" value={patternId} disabled={busy} onChange={(e)=>{setPatternId(e.target.value);setScore(null);setStatus('idle')}}>{RHYTHM_PATTERNS.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Tempo<select aria-label="Rhythm tempo" value={bpm} disabled={busy} onChange={(e)=>{setBpm(Number(e.target.value));setScore(null);setStatus('idle')}}>{[50,60,70,80,90,100,120].map((value)=><option key={value} value={value}>{value} BPM</option>)}</select></label><label>How to practise<select aria-label="Rhythm input" value={input} disabled={busy} onChange={(e)=>{setInput(e.target.value);setScore(null);setStatus('idle');setError(null)}}><option value="tap">Tap the rhythm</option><option value="mic">Strum muted strings</option></select></label></div>
    <div className="rhythm-studio__stage"><span className="workout__eyebrow">{pattern.tag}</span><h3>{pattern.name}</h3><p>{pattern.text}</p><ol className="rhythm-studio__lane" aria-label="Strum pattern">{pattern.slots.map((stroke,i)=><li key={i} className={`${stroke?'':'is-rest'} ${status==='running'&&!countIn&&slot===i?'is-current':''}`} aria-current={status==='running'&&!countIn&&slot===i?'step':undefined}><strong>{stroke==='up'?'↑':stroke==='down'?'↓':'·'}</strong><span>{i%2?'&':i/2+1}</span></li>)}</ol><p className="rhythm-studio__cue" role="status">{status==='starting'?'Starting your practice…':status==='running'?countIn?`Count in · ${Math.min(4,Math.max(1,4-Math.floor(elapsed/(60000/bpm))))}`:`Bar ${bar} of ${RHYTHM_BARS} · ${strikes} ${input==='tap'?'taps':'strums'} recorded`:'Four count-in clicks, then four bars. Dots are rests.'}</p>{input==='tap'?<button ref={tapButton} type="button" className="rhythm-studio__tap" onKeyDown={(e)=>{if(e.code==='Space'||e.key==='Enter'){e.preventDefault();if(!e.repeat)addStrike(performance.now(),'tap')}}} disabled={status!=='running'||countIn} onPointerDown={(e)=>{if(e.button===0){e.preventDefault();addStrike(performance.now(),'tap')}}} onClick={(e)=>{if(e.detail===0)addStrike(performance.now(),'tap')}}>Tap on each arrow <small>or use Space · skip the dots</small></button>:<p className="rhythm-studio__mic-note">Rest your fretting hand lightly across the strings. Use headphones. Timing is scored; the arrows guide your down/up motion. Calibrate microphone timing in Learn → Strum on the beat for better accuracy.</p>}</div>
    {score && <div className="workout__complete rhythm-studio__result" role="status"><h3>{Math.round(score.share*100)}% on the pattern</h3><p>{score.onTime} of {score.total} on time · {score.extras} extra {input==='tap'?'taps':'strums'}. {tendency(score) ?? (score.onTime===score.total&&score.extras===0?'Steady and clean. Nice groove.':'Slow it down and aim for an even pulse.')}</p><div className="rhythm-studio__marks" aria-label="Timing results">{score.results.map((result,i)=><span key={i} className={`is-${result.verdict}`} title={`${i+1}: ${result.verdict}`}>{result.verdict==='on'?'✓':result.verdict==='missed'?'–':result.verdict==='early'?'←':'→'}</span>)}</div></div>}
    {error&&<p role="alert">{error}</p>}
    <div className="workout__actions">{busy?<button type="button" onClick={stop}>{status==='starting'?'Cancel start':'Stop'}</button>:<button type="button" className="workout__primary" onClick={begin}>{score?'Try again':'Start practice'}</button>}<span>Timing feedback only · results stay in this visit.</span></div>
  </section>
}
