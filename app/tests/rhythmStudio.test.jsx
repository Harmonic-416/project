// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RhythmStudio from '../src/tabs/guitar/exercises/RhythmStudio.jsx'
const audio=vi.hoisted(()=>({start:vi.fn(async()=>{}),trigger:vi.fn(),silence:vi.fn(),dispose:vi.fn(),mic:vi.fn(async()=>false),stop:vi.fn()}))
vi.mock('tone',()=>({start:audio.start,now:()=>performance.now()/1000,getContext:()=>({rawContext:{currentTime:performance.now()/1000}})}))
vi.mock('../src/audio/metronome/click.js',()=>({createClick:()=>({trigger:audio.trigger,silence:audio.silence,dispose:audio.dispose,setVolume:vi.fn()})}))
vi.mock('../src/tabs/guitar/song/follow/useGuitarListener.js',()=>({useGuitarListener:()=>({start:audio.mic,stop:audio.stop})}))
beforeEach(()=>{vi.useFakeTimers();audio.start.mockResolvedValue();audio.mic.mockResolvedValue(false)})
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks()})
const advance=async(ms)=>act(async()=>{vi.advanceTimersByTime(ms)})
it('scores a complete tapped pattern on the same clock as its clicks without requesting a microphone',async()=>{
  render(<RhythmStudio />)
  fireEvent.change(screen.getByRole('combobox',{name:'Rhythm tempo'}),{target:{value:'60'}})
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Start practice'})))
  expect(audio.mic).not.toHaveBeenCalled();expect(audio.trigger).toHaveBeenCalledTimes(20)
  const tap=screen.getByRole('button',{name:/Tap on each arrow/})
  expect(tap.disabled).toBe(true)
  await advance(4200)
  expect(tap.disabled).toBe(false);expect(document.activeElement).toBe(tap)
  for(let i=0;i<16;i++){
    if(i)await advance(1000)
    fireEvent.keyDown(tap,{code:'Space'})
  }
  await advance(1500)
  expect(screen.getByText('100% on the pattern')).toBeTruthy()
  expect(screen.getByText(/16 of 16 on time · 0 extra taps/)).toBeTruthy()
  expect(audio.silence).toHaveBeenCalled()
  expect(screen.getByRole('combobox',{name:'Rhythm tempo'}).disabled).toBe(false)
})
it('cancels a pending microphone request and ignores its late completion',async()=>{
  let resolve;audio.mic.mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
  render(<RhythmStudio />)
  fireEvent.change(screen.getByRole('combobox',{name:'Rhythm input'}),{target:{value:'mic'}})
  fireEvent.click(screen.getByRole('button',{name:'Start practice'}))
  fireEvent.click(screen.getByRole('button',{name:'Cancel start'}))
  await act(async()=>resolve(true))
  expect(audio.start).not.toHaveBeenCalled()
  expect(screen.getByRole('button',{name:'Start practice'})).toBeTruthy()
})
it('handles unavailable sound and releases all audio on leaving',async()=>{
  audio.start.mockRejectedValueOnce(new Error('Audio blocked'))
  const view=render(<RhythmStudio />)
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Start practice'})))
  expect(screen.getByRole('alert').textContent).toContain('click could not start')
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Start practice'})))
  view.unmount()
  expect(audio.dispose).toHaveBeenCalled();expect(audio.stop).toHaveBeenCalled()
  await advance(30000)
})
