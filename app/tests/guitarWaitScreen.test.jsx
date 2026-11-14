// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GuitarWaitMode from '../src/tabs/guitar/song/follow/GuitarWaitMode.jsx'
const rig = vi.hoisted(() => ({ onWindow: null, quiet: false }))
vi.mock('../src/tabs/guitar/song/follow/useGuitarListener.js', () => ({ useGuitarListener: ({ onWindow }) => {
  rig.onWindow = onWindow
  return { status: 'listening', quiet: rig.quiet, live: null, start: async () => true, stop: vi.fn(async () => null), pause: vi.fn(), muteFor: vi.fn(), recordingSecondsAt: () => 0 }
} }))
vi.mock('../src/tabs/guitar/song/follow/waitListening.js', () => ({ createWaitAttempts: () => ({ reset: vi.fn(), consider: (window) => ({ actions: window.actions ?? [], log: {} }) }) }))
vi.mock('../src/tabs/vocal/components/ShareAttempt.jsx', () => ({ default: () => null }))
const entries = [0, 1].map((index) => ({ index, bar: 0, time: index, tick: index * 960, midi: 64 + index, kind: 'single', technique: 'pick', notes: [{ midi: 64 + index, string: 1, fret: index }] }))
const props = () => ({ api: { stop: vi.fn(), scrollToCursor: vi.fn(), playBeat: vi.fn() }, timeline: { entries, duration: 2 }, overlay: { mark: vi.fn(), clear: vi.fn() }, ready: true })
beforeEach(() => { rig.quiet = false })
afterEach(cleanup)
describe('Wait for me controls and feedback', () => {
  it('always offers Hint, Skip and Retry; wrong attempts never advance', () => {
    render(<GuitarWaitMode {...props()} />)
    for (const name of ['Hint', 'Skip', 'Retry']) expect(screen.getByRole('button', { name }).disabled).toBe(false)
    act(() => { for (let i = 0; i < 5; i++) rig.onWindow({ wall: 100 + i, actions: [{ type: 'judged', result: { verdict: 'miss' } }] }) })
    expect(screen.getByText(/Note 1 of 2/)).toBeTruthy()
    expect(screen.getByText(/Stuck\?/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.queryByText(/Stuck\?/)).toBe(null)
    expect(screen.getByText(/Note 1 of 2/)).toBeTruthy()
  })
  it('ignores windows without a judged gesture and advances only on a hit or manual Skip', async () => {
    render(<GuitarWaitMode {...props()} />)
    act(() => rig.onWindow({ wall: 100 }))
    expect(screen.getByText(/Note 1 of 2/)).toBeTruthy()
    act(() => rig.onWindow({ wall: 200, actions: [{ type: 'judged', result: { verdict: 'hit' } }] }))
    expect(screen.getByText(/Note 2 of 2/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Skip' })))
    expect(screen.getByText('Manually skipped')).toBeTruthy()
    expect(screen.getByText('First try')).toBeTruthy()
  })
  it('offers practical recovery for quiet input without calling it a wrong attempt', () => {
    rig.quiet = true
    render(<GuitarWaitMode {...props()} />)
    expect(screen.getByText(/play a little louder/)).toBeTruthy()
    expect(screen.getByText(/Microphone too quiet/)).toBeTruthy()
    expect(screen.queryByText(/Something else/)).toBe(null)
    expect(screen.getByText(/Note 1 of 2/)).toBeTruthy()
  })
})
