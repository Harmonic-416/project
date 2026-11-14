// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useGuitarTempo } from '../src/tabs/guitar/song/useGuitarTempo.js'
import { readAccountTempo, writeAccountTempo } from '../src/tabs/guitar/song/tempoPreferences.js'
vi.mock('../src/tabs/guitar/song/tempoPreferences.js', () => ({ readAccountTempo: vi.fn(), writeAccountTempo: vi.fn() }))
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks() })
const client = {}
const props = { fingerprint: 'song', userId: 'player', client }
describe('Guitar tempo synchronization', () => {
  it('never applies a slow account response over a newer slider choice', async () => {
    let resolve
    readAccountTempo.mockReturnValue(new Promise((done) => { resolve = done }))
    writeAccountTempo.mockResolvedValue()
    const { result } = renderHook(() => useGuitarTempo(props))
    act(() => result.current.change(60))
    await act(async () => resolve(90))
    expect(result.current.tempo).toBe(60)
  })
  it('keeps different accounts separate in the local cache', async () => {
    readAccountTempo.mockResolvedValue(null)
    writeAccountTempo.mockResolvedValue()
    const { result, rerender } = renderHook((p) => useGuitarTempo(p), { initialProps: props })
    await waitFor(() => expect(result.current.message).not.toBe(''))
    act(() => result.current.change(65))
    rerender({ ...props, userId: 'another' })
    await waitFor(() => expect(result.current.tempo).toBe(100))
  })
  it('keeps playback usable when saving fails and supports retry', async () => {
    readAccountTempo.mockResolvedValue(null)
    writeAccountTempo.mockRejectedValueOnce(new Error('offline')).mockResolvedValue()
    const { result } = renderHook(() => useGuitarTempo(props))
    await waitFor(() => expect(result.current.message).not.toBe(''))
    act(() => result.current.change(75))
    await waitFor(() => expect(result.current.message).toContain('sync failed'))
    expect(result.current.tempo).toBe(75)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.message).toBe('Tempo saved to your account.'))
  })
})

it('keeps separate anonymous tempo preferences when switching songs', () => {
  const initial = {fingerprint:'first',userId:null,client:null}
  const {result,rerender} = renderHook((props) => useGuitarTempo(props), {initialProps:initial})
  act(() => result.current.change(60))
  rerender({...initial,fingerprint:'second'})
  expect(result.current.tempo).toBe(100)
  act(() => result.current.change(80))
  rerender(initial)
  expect(result.current.tempo).toBe(60)
  rerender({...initial,fingerprint:'second'})
  expect(result.current.tempo).toBe(80)
})
