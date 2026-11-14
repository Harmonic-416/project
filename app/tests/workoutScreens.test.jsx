// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ChordWorkout from '../src/tabs/guitar/exercises/ChordWorkout.jsx'
import Exercises from '../src/tabs/guitar/exercises/Exercises.jsx'
const audio=vi.hoisted(()=>({strum:vi.fn(async()=>{}),stop:vi.fn()}))
vi.mock('../src/tabs/guitar/practice/useChordPlayer.js',()=>({useChordPlayer:()=>audio}))
vi.mock('../src/tabs/guitar/exercises/RhythmStudio.jsx',()=>({default:()=> <p>Rhythm studio opened</p>}))
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks()})
it('offers three new workouts and keeps ear training directly accessible',()=>{
  render(<Exercises />)
  for(const title of ['Name that shape','Build a chord','Rhythm studio','Ear training'])expect(screen.getByRole('button',{name:new RegExp(title)})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:/KEEP THE PULSE Rhythm studio/}))
  expect(screen.getByText('Rhythm studio opened')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'← Exercises'}))
  expect(screen.getByRole('button',{name:/LISTEN CLOSELY Ear training/})).toBeTruthy()
})
it('checks all six string positions, keeps retries available, and never changes lesson unlocks',()=>{
  render(<ChordWorkout kind="build" />)
  fireEvent.click(screen.getByRole('button',{name:'Start round'}))
  expect(screen.getByRole('button',{name:'Check shape'}).disabled).toBe(true)
  for(const [i,name] of ['E','A','D','G','B','E'].entries())fireEvent.click(screen.getByRole('button',{name:`String ${6-i} (${name}): open`,exact:true}))
  fireEvent.click(screen.getByRole('button',{name:'Check shape'}))
  expect(screen.getByText(/Not quite. Check the marked strings/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'String 5 (A): fret 2'}))
  fireEvent.click(screen.getByRole('button',{name:'String 4 (D): fret 2'}))
  fireEvent.click(screen.getByRole('button',{name:'Check shape'}))
  expect(screen.getByText('That’s E minor. Nice work.')).toBeTruthy()
  expect(screen.getByRole('button',{name:'Next shape'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Next shape'}))
  expect(screen.getByText('Question 2 of 8')).toBeTruthy()
  expect(localStorage.getItem('harmonic.guitar.cleared')).toBeNull()
})
it('does not reveal the quiz answer to screen readers or start sound before a deliberate request',async()=>{
  render(<ChordWorkout kind="identify" />)
  expect(screen.getByRole('button',{name:'Start round'}).disabled).toBe(true)
  fireEvent.click(screen.getByText(/Choose your chords/))
  fireEvent.click(screen.getByRole('button',{name:'Beginner six'}))
  fireEvent.click(screen.getByRole('button',{name:'Start round'}))
  expect(screen.getByRole('img',{name:'Identify this chord shape'})).toBeTruthy()
  expect(audio.strum).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Show hint'}))
  expect(screen.queryByRole('img',{name:'Identify this chord shape'})).toBeNull()
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Hear it'})))
  expect(audio.strum).toHaveBeenCalledOnce()
})
