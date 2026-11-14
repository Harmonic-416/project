// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useLearnProgressSync } from '../src/tabs/guitar/learn/useLearnProgressSync.js'
import { clearLocalProgress, readLocalProgress, writeLocalProgress } from '../src/tabs/guitar/learn/learnProgress.js'
import { getProgressSyncStatus, progressSaved } from '../src/tabs/guitar/learn/progressEvents.js'
import { getGuitarProgress, saveGuitarProgress } from '@backend/progress'
vi.mock('../src/lib/supabaseClient.js', () => ({ supabase: {} }))
vi.mock('@backend/progress', async () => ({ ...(await vi.importActual('@backend/progress')), getGuitarProgress: vi.fn(), saveGuitarProgress: vi.fn() }))
const empty = () => ({ cleared: {}, changesBest: {}, strumPassed: {} })
afterEach(() => { cleanup(); clearLocalProgress(); vi.resetAllMocks() })
describe('Learn account synchronization', () => {
  it('preserves a lesson completed while account progress is loading', async () => {
    let finish
    getGuitarProgress.mockReturnValueOnce(new Promise((resolve) => { finish = resolve })).mockResolvedValue(empty())
    saveGuitarProgress.mockResolvedValue()
    renderHook(() => useLearnProgressSync('player'))
    await waitFor(() => expect(getGuitarProgress).toHaveBeenCalled())
    act(() => { writeLocalProgress({ ...empty(), cleared: { Em: 'passed' } }); progressSaved() })
    await act(async () => finish(empty()))
    await waitFor(() => expect(saveGuitarProgress).toHaveBeenCalledWith({}, expect.objectContaining({ cleared: { Em: 'passed' } }), 'player'))
    expect(readLocalProgress().cleared.Em).toBe('passed')
  })
  it('clears the previous account on a direct account switch and rejects late responses', async () => {
    let finish
    getGuitarProgress.mockReturnValueOnce(new Promise((resolve) => { finish = resolve })).mockResolvedValue(empty())
    saveGuitarProgress.mockResolvedValue()
    writeLocalProgress({ ...empty(), cleared: { Em: 'passed' } })
    const { rerender } = renderHook(({ user }) => useLearnProgressSync(user), { initialProps: { user: 'first' } })
    await waitFor(() => expect(getGuitarProgress).toHaveBeenCalledTimes(1))
    rerender({ user: 'second' })
    await act(async () => finish({ ...empty(), cleared: { Em: 'passed' } }))
    await waitFor(() => expect(getProgressSyncStatus()).toMatchObject({ userId: 'second', state: 'saved' }))
    expect(readLocalProgress().cleared).toEqual({})
  })
  it('surfaces sync failure and allows retry without losing local progress', async () => {
    writeLocalProgress({ ...empty(), cleared: { Em: 'passed' } })
    getGuitarProgress.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(empty())
    saveGuitarProgress.mockResolvedValue()
    renderHook(() => useLearnProgressSync('retry-player'))
    await waitFor(() => expect(getProgressSyncStatus().state).toBe('error'))
    act(() => progressSaved())
    await waitFor(() => expect(getProgressSyncStatus().state).toBe('saved'))
    expect(readLocalProgress().cleared.Em).toBe('passed')
  })
})
