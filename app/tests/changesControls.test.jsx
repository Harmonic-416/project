// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ChangesRun from '../src/tabs/guitar/practice/ChangesRun.jsx'
import { isChangeTapKey } from '../src/tabs/guitar/practice/changesKeys.js'
const audio = vi.hoisted(() => ({start:vi.fn(async () => false),stop:vi.fn(),strum:vi.fn(async () => {}),stopSound:vi.fn(),countIn:vi.fn(() => null)}))
vi.mock('../src/tabs/guitar/song/follow/useGuitarListener.js',()=>({useGuitarListener:()=>({start:audio.start,stop:audio.stop,status:'idle'})}))
vi.mock('../src/tabs/guitar/practice/useChordPlayer.js',()=>({useChordPlayer:()=>({strum:audio.strum,stop:audio.stopSound})}))
vi.mock('../src/tabs/guitar/practice/useLessonCountIn.js',()=>({useLessonCountIn:audio.countIn}))
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();audio.strum.mockImplementation(async()=>{})})
it('counts only deliberate, unmodified Space presses outside focused controls',()=>{
  expect(isChangeTapKey({code:'Space',target:document.body})).toBe(true)
  expect(isChangeTapKey({code:'Space',repeat:true,target:document.body})).toBe(false)
  for(const tag of ['button','input','textarea','select','a','summary']) expect(isChangeTapKey({code:'Space',target:document.createElement(tag)})).toBe(false)
  expect(isChangeTapKey({code:'Space',ctrlKey:true,target:document.body})).toBe(false)
  expect(isChangeTapKey({code:'Space',shiftKey:true,target:document.body})).toBe(false)
})
it('uses the audible countdown hook and lets the player cancel before the run',()=>{
  vi.useFakeTimers();render(<ChangesRun unlocked={2}/>)
  fireEvent.click(screen.getByRole('button',{name:'Start',exact:true}))
  expect(audio.countIn).toHaveBeenLastCalledWith('countdown',3)
  fireEvent.click(screen.getByRole('button',{name:'Stop',exact:true}))
  expect(audio.stop).toHaveBeenCalled()
  expect(screen.getByRole('button',{name:'Start',exact:true})).toBeTruthy()
})
it('shows an actionable demo sound error and permits another attempt',async()=>{
  audio.strum.mockRejectedValueOnce(new Error('No sound'))
  render(<ChangesRun unlocked={2}/>)
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Show me the change'})))
  expect(screen.getByRole('alert').textContent).toContain('Try Show me the change again')
  expect(screen.getByRole('button',{name:'Show me the change'}).disabled).toBe(false)
})
it('keeps the microphone optional and guides alternating targets after each counted change',async()=>{
  vi.useFakeTimers(); render(<ChangesRun unlocked={2}/>)
  fireEvent.click(screen.getByRole('button',{name:'Start',exact:true}))
  expect(audio.start).not.toHaveBeenCalled()
  for(let i=0;i<3;i++) await act(async()=>vi.advanceTimersByTime(1000))
  expect(screen.getByText('Form A minor')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:/Changed!/}))
  expect(screen.getByText('Form E minor')).toBeTruthy()
  expect(screen.getByText(/land the whole Em shape/)).toBeTruthy()
  expect(screen.getByText(/Counted 1/)).toBeTruthy()
})
it('starts optional microphone feedback only when selected',()=>{
  render(<ChangesRun unlocked={2}/>)
  fireEvent.click(screen.getByRole('checkbox',{name:/Also listen with the microphone/}))
  fireEvent.click(screen.getByRole('button',{name:'Start',exact:true}))
  expect(audio.start).toHaveBeenCalledOnce()
})
it('does not expose a locked second chord and offers a return to the lesson',()=>{
  const onLearnChord=vi.fn(); render(<ChangesRun unlocked={1} onLearnChord={onLearnChord}/>)
  expect(screen.queryByRole('combobox')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Back to my chord'}))
  expect(onLearnChord).toHaveBeenCalledOnce()
})
