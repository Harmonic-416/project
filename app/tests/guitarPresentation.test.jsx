// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import MyTranscriptions from '../src/tabs/guitar/song/MyTranscriptions.jsx'
import GuitarFeedback from '../src/tabs/guitar/practice/GuitarFeedback.jsx'
import RunReview from '../src/tabs/guitar/song/follow/RunReview.jsx'
afterEach(cleanup)
it('names the action that fills an empty transcription library', () => {
  const create = vi.fn()
  render(<MyTranscriptions drafts={[]} onCreate={create} />)
  expect(screen.getByText(/Guitar tabs you create/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name: 'Tab a song'}))
  expect(create).toHaveBeenCalledOnce()
  expect(screen.queryByRole('list')).toBeNull()
})
it('shows an actionable empty run instead of disappearing', () => {
  render(<RunReview entries={[]} verdicts={[]} mode="trouble" />)
  expect(screen.getByRole('status').textContent).toContain('Start a new run')
  expect(screen.queryByRole('list')).toBeNull()
})
it('announces waiting and recovery consistently, with a working retry', async () => {
  const retry = vi.fn()
  const view = render(<GuitarFeedback>Loading your score</GuitarFeedback>)
  expect(screen.getByRole('status').textContent).toContain('Loading your score')
  view.rerender(<GuitarFeedback kind="error" onRetry={retry}>The score could not load.</GuitarFeedback>)
  expect(screen.getByRole('alert').textContent).toContain('could not load')
  await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Try again'})))
  expect(retry).toHaveBeenCalledOnce()
})
