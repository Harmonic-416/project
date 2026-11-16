// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import GuitarTab from '../src/tabs/guitar/GuitarTab.jsx'
vi.mock('../src/auth/AccountChip.jsx', () => ({ default: () => null }))
vi.mock('../src/tabs/guitar/song/GuitarSong.jsx', () => ({ default: () => null }))
vi.mock('../src/tabs/guitar/tuner/Tuner.jsx', () => ({ default: () => null }))
vi.mock('../src/tabs/guitar/fretboard/Fretboard.jsx', () => ({ default: () => null }))
vi.mock('../src/tabs/guitar/learn/LearnTab.jsx', () => ({ default: () => null }))
vi.mock('../src/tabs/guitar/exercises/Exercises.jsx', () => ({ default: () => null }))
afterEach(() => { cleanup(); sessionStorage.clear() })
it('dismisses for navigation and remounts, and returns in a fresh session', () => {
  const first = render(<GuitarTab />)
  fireEvent.click(screen.getByRole('button', { name: 'Already tuned' }))
  fireEvent.click(screen.getByRole('button', { name: 'Learn' }))
  fireEvent.click(screen.getByRole('button', { name: 'Songs' }))
  expect(screen.queryByRole('button', { name: 'Already tuned' })).toBeNull()
  first.unmount()
  const second = render(<GuitarTab />)
  expect(screen.queryByRole('button', { name: 'Already tuned' })).toBeNull()
  second.unmount()
  sessionStorage.clear()
  render(<GuitarTab />)
  expect(screen.getByRole('button', { name: 'Already tuned' })).toBeTruthy()
})
