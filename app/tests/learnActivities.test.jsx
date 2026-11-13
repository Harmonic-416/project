// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import LearnTab from '../src/tabs/guitar/learn/LearnTab.jsx'
vi.mock('../src/tabs/guitar/practice/PracticeScreen.jsx', () => ({ default: () => <p>Chord activity open</p> }))
vi.mock('../src/tabs/guitar/exercises/StrumDrill.jsx', () => ({ default: () => <p>Strum activity open</p> }))
vi.mock('../src/tabs/guitar/learn/learnProgress.js', () => ({ readLocalProgress: () => ({ cleared: { Em: 'passed', staleChord: 'passed' }, strumPassed: { 'muted-60': true } }) }))
afterEach(cleanup)
describe('Guitar Learn activity list', () => {
  it('shows valid progress and opens the chosen activity directly', () => {
    render(<LearnTab auth={{ configured: false }} />)
    expect(screen.getByText('1 of 20 chords cleared')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Chord lessons progress' }).value).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: /Strum on the beat/ }))
    expect(screen.getByText('Strum activity open')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Learn/ }))
    fireEvent.click(screen.getByRole('button', { name: /Chord lessons/ }))
    expect(screen.getByText('Chord activity open')).toBeTruthy()
  })
})
