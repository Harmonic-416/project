// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import GuitarTab from '../src/tabs/guitar/GuitarTab.jsx'
import { guitarProgress } from '../src/tabs/guitar/practice/guitarProgress.js'

afterEach(() => { cleanup(); localStorage.clear(); guitarProgress.resetProgressCache() })

// One app, not two: Guitar's section buttons draw the same kind of line icon
// as Vocal's (lucide SVGs in the section colour), not emoji.
it('gives each Guitar section a line icon like the Vocal sections', () => {
  render(<GuitarTab />)
  for (const name of ['Songs', 'Learn', 'Exercises', 'Tuner']) {
    const icon = screen.getByRole('button', { name }).querySelector('.guitar-tab__view-icon')
    expect(icon.querySelector('svg.lucide')).toBeTruthy()
    expect(icon.textContent).toBe('')
  }
})
