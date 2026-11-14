// @vitest-environment jsdom
import React, { useReducer } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PlayRun from '../src/tabs/guitar/practice/PlayRun.jsx'
import ChordPicker from '../src/tabs/guitar/practice/ChordPicker.jsx'
import { initialPlay, playReducer, progressionChords } from '../src/tabs/guitar/practice/playState.js'
import { CHORDS } from '../src/tabs/guitar/practice/chords.js'
import { chordStatuses } from '../src/tabs/guitar/practice/unlocks.js'
vi.mock('../src/tabs/guitar/practice/useLessonCountIn.js', () => ({useLessonCountIn: () => null}))
afterEach(() => {cleanup(); vi.useRealTimers()})
function Loop() {
  const [state, dispatch] = useReducer(playReducer, undefined, () => initialPlay(4))
  return <PlayRun chords={progressionChords(['Em','Am','Em','Am'])} state={state} dispatch={dispatch} labelMode="finger" />
}
const advance = async (ms) => act(async () => {vi.advanceTimersByTime(ms)})
it('keeps beat cues and bar changes on the selected tempo through the final bar', async () => {
  vi.useFakeTimers()
  render(<Loop />)
  fireEvent.change(screen.getByRole('combobox', {name:'Loop tempo'}), {target:{value:'120'}})
  fireEvent.click(screen.getByRole('button', {name:'Start',exact:true}))
  for (let i=0;i<3;i++) await advance(1000)
  await advance(1)
  expect(screen.getByRole('list', {name:'Beat 1 of 4'})).toBeTruthy()
  expect(screen.getByRole('combobox', {name:'Loop tempo'}).disabled).toBe(true)
  await advance(500)
  expect(screen.getByRole('list', {name:'Beat 2 of 4'})).toBeTruthy()
  await advance(1500)
  expect(screen.getByRole('img', {name:'A minor chord diagram'})).toBeTruthy()
  for (let i=0;i<3;i++) await advance(2000)
  expect(screen.getByText('bars heard')).toBeTruthy()
  expect(screen.getAllByTitle(/Bar \d+: /)).toHaveLength(4)
  expect(screen.getByRole('combobox', {name:'Loop tempo'}).disabled).toBe(false)
})
it('cancels the transport on Stop and can begin again', async () => {
  vi.useFakeTimers(); render(<Loop />)
  fireEvent.click(screen.getByRole('button',{name:'Start',exact:true}))
  for(let i=0;i<3;i++) await advance(1000)
  fireEvent.click(screen.getByRole('button',{name:'Stop',exact:true}))
  await advance(60000)
  expect(screen.getByRole('button',{name:'Start',exact:true})).toBeTruthy()
  expect(screen.queryByText('bars heard')).toBeNull()
})
it('shows open lessons separately, prevents choosing locked chords, and closes after selection', () => {
  const onSelect=vi.fn()
  render(<ChordPicker chord={CHORDS[0]} statuses={chordStatuses({Em:'passed'})} onSelect={onSelect} />)
  fireEvent.click(screen.getByRole('button',{name:/Choose a chord/}))
  expect(screen.getByRole('dialog',{name:'What would you like to play?'})).toBeTruthy()
  expect(screen.queryByRole('button',{name:'C major, locked'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Coming up'}))
  expect(screen.getByRole('button',{name:'C major, locked'}).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:/Ready to play/}))
  fireEvent.click(screen.getByRole('button',{name:'A minor',exact:true}))
  expect(onSelect).toHaveBeenCalledWith(1)
  expect(screen.queryByRole('dialog')).toBeNull()
})
