// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import EarTraining from '../src/tabs/guitar/exercises/EarTraining.jsx'
const audio = vi.hoisted(() => ({ strum: vi.fn(async () => {}), arpeggiate: vi.fn(async () => {}), stop: vi.fn() }))
vi.mock('../src/tabs/guitar/practice/useChordPlayer.js', () => ({ useChordPlayer: () => audio }))
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.clearAllMocks(); audio.strum.mockImplementation(async () => {}) })
it('starts with major/minor choices and advances once after an answer', async () => {
  render(<EarTraining />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Start/ })))
  const choices = within(screen.getByRole('group', { name: 'Answers' })).getAllByRole('button')
  expect(choices.map((button) => button.textContent)).toEqual(['Major', 'Minor'])
  fireEvent.click(choices[0]); fireEvent.click(choices[1])
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true })))
  expect(screen.getByText('Question 2 of 10')).toBeTruthy()
})
it('requires sound recovery before accepting answers', async () => {
  audio.strum.mockRejectedValueOnce(new Error('No output'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<EarTraining />)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Start/ })))
  expect(screen.getByRole('alert').textContent).toContain('try Play again')
  expect(screen.getByRole('button', { name: 'Major', exact: true }).disabled).toBe(true)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Play again/ })))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('button', { name: 'Major', exact: true }).disabled).toBe(false)
})
it('ignores late audio errors after ending a round', async () => {
  let reject; audio.strum.mockImplementation(() => new Promise((_, fail) => { reject = fail }))
  render(<EarTraining />)
  fireEvent.click(screen.getByRole('button', { name: /Start/ }))
  fireEvent.click(screen.getByRole('button', { name: 'End round' }))
  await act(async () => reject(new Error('Late failure')))
  expect(screen.queryByRole('alert')).toBeNull()
})
