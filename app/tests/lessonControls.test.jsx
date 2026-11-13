// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PracticeScreen from '../src/tabs/guitar/practice/PracticeScreen.jsx'
import StringStates from '../src/tabs/guitar/practice/StringStates.jsx'
import { CHORDS } from '../src/tabs/guitar/practice/chords.js'
const mic = vi.hoisted(() => ({ start: vi.fn(async () => false), stop: vi.fn(), restart: vi.fn(), muteFor: vi.fn() }))
vi.mock('../src/tabs/guitar/practice/useLessonListening.js', () => ({ useLessonListening: () => ({ ...mic, status: 'error', error: 'Microphone unavailable' }) }))
vi.mock('../src/tabs/guitar/practice/useChordPlayer.js', () => ({ useChordPlayer: () => ({ strum: async () => {}, arpeggiate: async () => {} }) }))
vi.mock('../src/tabs/guitar/practice/useLessonCountIn.js', () => ({ useLessonCountIn: () => null }))
vi.mock('../src/tabs/guitar/practice/ChangesRun.jsx', () => ({ default: () => null }))
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks() })
describe('lesson controls and microphone fallback', () => {
  it('does not run the timed checkpoint after microphone denial; manual start remains available', async () => {
    render(<PracticeScreen initialMode="practice" />)
    for (const name of ['Hint', 'Skip', 'Retry']) expect(screen.getByRole('button', { name })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start', exact: true })))
    await waitFor(() => expect(mic.start).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Get ready…')).toBe(null)
    fireEvent.click(screen.getByRole('button', { name: 'Start without microphone' }))
    expect(screen.getByText('Get ready…')).toBeTruthy()
  })
  it('distinguishes unused, unheard, clean and wrong strings accessibly', () => {
    render(<StringStates chord={CHORDS.find((c) => c.id === 'Am')} strings={['good', 'good', 'bad']} />)
    expect(screen.getByLabelText("String 6 (E): don't play")).toBeTruthy()
    expect(screen.getByLabelText('String 5 (A): rang clean')).toBeTruthy()
    expect(screen.getByLabelText('String 4 (D): buzzed or wrong')).toBeTruthy()
    expect(screen.getByLabelText('String 1 (E): not heard yet')).toBeTruthy()
  })
})

it('relabels the same chord diagram and remembers the choice', () => {
  const first = render(<PracticeScreen />)
  const dots = () => [...screen.getByRole('img', {name: 'E minor chord diagram'}).querySelectorAll('.chord-diagram__dot text')].map((dot) => dot.textContent)
  expect(dots()).toEqual(['2', '2'])
  fireEvent.click(screen.getByRole('button', {name: 'Notes', exact: true}))
  expect(dots()).toEqual(['B', 'E'])
  fireEvent.click(screen.getByRole('button', {name: 'Fingers', exact: true}))
  expect(dots()).toEqual(['2', '3'])
  first.unmount()
  render(<PracticeScreen />)
  expect(screen.getByRole('button', {name: 'Fingers', exact: true}).getAttribute('aria-pressed')).toBe('true')
  expect(dots()).toEqual(['2', '3'])
})
