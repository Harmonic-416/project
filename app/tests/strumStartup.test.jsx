// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import StrumDrill from '../src/tabs/guitar/exercises/StrumDrill.jsx'
const audio = vi.hoisted(() => ({ start: vi.fn(async () => true), stop: vi.fn(), unlock: vi.fn(async () => {}), trigger: vi.fn() }))
vi.mock('tone', () => ({ start: audio.unlock, now: () => 1, getContext: () => ({rawContext: {currentTime: 1}}) }))
vi.mock('../src/tabs/guitar/song/follow/useGuitarListener.js', () => ({ useGuitarListener: () => ({start: audio.start, stop: audio.stop}) }))
vi.mock('../src/audio/metronome/click.js', () => ({ createClick: () => ({trigger: audio.trigger, silence: vi.fn(), dispose: vi.fn(), setVolume: vi.fn()}) }))
afterEach(() => { cleanup(); vi.clearAllMocks(); audio.start.mockImplementation(async () => true); audio.unlock.mockImplementation(async () => {}) })
it('returns to Start after audio fails and stops listening', async () => {
  audio.unlock.mockRejectedValueOnce(new Error('No output'))
  render(<StrumDrill />)
  await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Start', exact: true})))
  expect(screen.getByRole('status').textContent).toContain('could not start')
  expect(audio.stop).toHaveBeenCalled()
  expect(screen.getByRole('button', {name: 'Start', exact: true})).toBeTruthy()
})
it('cancels a pending startup without scheduling clicks', async () => {
  let resolve; audio.start.mockImplementation(() => new Promise((done) => { resolve = done }))
  render(<StrumDrill />)
  fireEvent.click(screen.getByRole('button', {name: 'Start', exact: true}))
  fireEvent.click(screen.getByRole('button', {name: 'Stop', exact: true}))
  await act(async () => resolve(true))
  expect(audio.trigger).not.toHaveBeenCalled()
  expect(screen.getByRole('button', {name: 'Start', exact: true})).toBeTruthy()
})
