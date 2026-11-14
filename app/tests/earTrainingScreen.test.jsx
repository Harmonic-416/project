// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import EarTraining from '../src/tabs/guitar/exercises/EarTraining.jsx'
import { saveSongChords } from '../src/tabs/guitar/practice/chordNames.js'
const audio = vi.hoisted(() => ({ strum: vi.fn(async () => {}), arpeggiate: vi.fn(async () => {}), stop: vi.fn() }))
vi.mock('../src/tabs/guitar/practice/useChordPlayer.js', () => ({ useChordPlayer: () => audio }))
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); audio.strum.mockImplementation(async () => {}) })
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

it('completes ten questions without microphone access and replays missed chords', async () => {
  const microphone = vi.fn(() => { throw new Error('Microphone must not be requested') })
  vi.stubGlobal('navigator', {mediaDevices: {getUserMedia: microphone}})
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  render(<EarTraining />)
  await act(async () => fireEvent.click(screen.getByRole('button', {name: /Start/})))
  let correct = 0
  const missed = new Map()
  for (let index = 0; index < 10; index += 1) {
    const chord = audio.strum.mock.calls.at(-1)[0]
    if (chord.quality === 'major') correct += 1
    else missed.set(chord.name, (missed.get(chord.name) ?? 0) + 1)
    fireEvent.click(screen.getByRole('button', {name: 'Major', exact: true}))
    await act(async () => fireEvent.click(screen.getByRole('button', {name: index === 9 ? 'See results' : 'Next', exact: true})))
  }
  const summary = screen.getByRole('heading', {name: `${correct} of 10 correct`})
  expect(document.activeElement).toBe(summary)
  for (const [name, count] of missed) {
    const button = screen.getByRole('button', {name: new RegExp(name + ' missed ' + (count === 1 ? 'once' : count + ' times'))})
    await act(async () => fireEvent.click(button))
    expect(audio.strum.mock.calls.at(-1)[0].name).toBe(name)
  }
  expect(microphone).not.toHaveBeenCalled()
  expect(writes).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(screen.getByRole('button', {name: 'Play again', exact: true})))
  expect(screen.getByText('Question 1 of 10')).toBeTruthy()
  vi.unstubAllGlobals()
})

it('offers exactly the two specified levels with no seventh-chord option', () => {
  render(<EarTraining />)
  const levels = within(screen.getByRole('group', {name:'Level'})).getAllByRole('button')
  expect(levels).toHaveLength(2)
  expect(levels[0].textContent).toContain('Major or minor?')
  expect(levels[1].textContent).toContain('Which chord?')
  expect(screen.queryByRole('checkbox', {name:/seventh/})).toBeNull()
})
it('asks four distinct chosen chord names, never saves results, and clears them on remount', async () => {
  localStorage.setItem('harmonic.guitar.earStats', JSON.stringify({C:{right:99,wrong:0}}))
  const writes = vi.spyOn(Storage.prototype,'setItem')
  const view = render(<EarTraining />)
  expect(localStorage.getItem('harmonic.guitar.earStats')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:/Which chord\?/}))
  const picks = within(screen.getByRole('group',{name:'Chords to train'}))
  expect(picks.queryAllByText(/%$/)).toHaveLength(0)
  fireEvent.click(picks.getByRole('button',{name:'Am',exact:true}))
  fireEvent.click(picks.getByRole('button',{name:'E',exact:true}))
  await act(async () => fireEvent.click(screen.getByRole('button',{name:/Start/})))
  const selected = ['Em','C','G','D']
  for (let index=0;index<10;index++) {
    expect(selected).toContain(audio.strum.mock.calls.at(-1)[0].id)
    const answers = within(screen.getByRole('group',{name:'Answers'})).getAllByRole('button')
    expect(answers).toHaveLength(4)
    expect(new Set(answers.map((button) => button.textContent)).size).toBe(4)
    fireEvent.click(answers[0])
    await act(async () => fireEvent.click(screen.getByRole('button',{name:index===9?'See results':'Next',exact:true})))
  }
  expect(writes).not.toHaveBeenCalled()
  expect(localStorage.getItem('harmonic.guitar.earStats')).toBeNull()
  view.unmount()
  render(<EarTraining />)
  fireEvent.click(screen.getByRole('button',{name:/Which chord\?/}))
  expect(within(screen.getByRole('group',{name:'Chords to train'})).queryAllByText(/%$/)).toHaveLength(0)
})

it('keeps song-based practice inside Which chord with four song-only choices', async () => {
  saveSongChords('Four chord song',['Em','C','G','D'])
  render(<EarTraining />)
  fireEvent.click(screen.getByRole('button',{name:/Which chord\?/}))
  fireEvent.click(screen.getByRole('button',{name:'Last song',exact:true}))
  expect(screen.getByText(/Beginner chords from Four chord song/)).toBeTruthy()
  await act(async () => fireEvent.click(screen.getByRole('button',{name:/Start/})))
  expect(['Em','C','G','D']).toContain(audio.strum.mock.calls.at(-1)[0].id)
  expect(within(screen.getByRole('group',{name:'Answers'})).getAllByRole('button').map((button) => button.textContent).sort()).toEqual(['C major','D major','E minor','G major'])
})
