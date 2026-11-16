// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, renderHook, waitFor, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useDraftLibrary } from '../src/tabs/guitar/song/useDraftLibrary.js'
import { keepTranscriptionCopy } from '../src/tabs/guitar/song/transcriptionStorage.js'
import MyTranscriptions from '../src/tabs/guitar/song/MyTranscriptions.jsx'
import { draftsAvailable, listDrafts, deleteDraft, saveDraft } from '../src/tabs/guitar/song/drafts.js'
vi.mock('../src/tabs/guitar/song/drafts.js', () => ({ draftsAvailable: vi.fn(() => true), listDrafts: vi.fn(), deleteDraft: vi.fn(), saveDraft: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks(); draftsAvailable.mockReturnValue(true) })
const draft = {id: 'draft', title: 'My song', updated: 0}
it('retries a failed list without reporting that the library is empty', async () => {
  listDrafts.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([draft])
  const {result} = renderHook(() => useDraftLibrary(true))
  await waitFor(() => expect(result.current.phase).toBe('error'))
  expect(result.current.error).toContain('could not be read')
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.drafts).toEqual([draft]))
  expect(result.current.error).toBeNull()
})
it('retains a draft after deletion fails and retries that same deletion once', async () => {
  listDrafts.mockResolvedValue([draft])
  deleteDraft.mockRejectedValueOnce(new Error('blocked')).mockResolvedValueOnce()
  const {result} = renderHook(() => useDraftLibrary(true))
  await waitFor(() => expect(result.current.phase).toBe('ready'))
  await act(async () => result.current.remove(draft))
  expect(result.current.drafts).toEqual([draft])
  expect(result.current.error).toContain('still in your library')
  await act(async () => result.current.retry())
  expect(result.current.drafts).toEqual([])
  expect(deleteDraft.mock.calls).toEqual([['draft'], ['draft']])
})
it('coalesces rapid delete taps and removes only after storage succeeds', async () => {
  let resolve; listDrafts.mockResolvedValue([draft])
  deleteDraft.mockReturnValue(new Promise((done) => {resolve = done}))
  const {result} = renderHook(() => useDraftLibrary(true))
  await waitFor(() => expect(result.current.phase).toBe('ready'))
  let first
  act(() => {first = result.current.remove(draft); result.current.remove(draft)})
  expect(result.current.drafts).toEqual([draft])
  expect(deleteDraft).toHaveBeenCalledTimes(1)
  await act(async () => {resolve(); await first})
  expect(result.current.drafts).toEqual([])
})
it('keeps a score available for export when storage is full or unavailable', async () => {
  saveDraft.mockRejectedValue(new Error('Quota exceeded'))
  const input = {id: 'draft', title: 'My song', musicXml: '<score-partwise/>', about: null}
  const full = await keepTranscriptionCopy(input)
  expect(full.kept).toBe(false)
  expect(new TextDecoder().decode(full.bytes)).toBe(input.musicXml)
  draftsAvailable.mockReturnValue(false)
  expect((await keepTranscriptionCopy(input)).kept).toBe(false)
  expect(saveDraft).toHaveBeenCalledTimes(1)
})
it('does not show an empty-library claim when loading or storage failed', () => {
  const {rerender} = render(<MyTranscriptions drafts={[]} phase="loading" />)
  expect(screen.getByRole('status').textContent).toContain('Loading')
  expect(screen.queryByText(/Guitar tabs you create/)).toBeNull()
  rerender(<MyTranscriptions drafts={[]} phase="error" error="Could not read drafts" onRetry={() => {}} />)
  expect(screen.getByRole('alert').textContent).toContain('Could not read drafts')
  expect(screen.queryByText(/Guitar tabs you create/)).toBeNull()
})
