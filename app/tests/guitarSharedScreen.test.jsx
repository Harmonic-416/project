// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import GuitarSharedPanel from '../src/tabs/guitar/song/follow/GuitarSharedPanel.jsx'
import { addAttemptComment, canViewAttempt, getSharedRecordingUrl, listAttemptComments } from '@backend/attempts'
vi.mock('@backend/attempts', () => ({
  MAX_COMMENT_LENGTH: 1000,
  getSharedRecordingUrl: vi.fn(),
  canViewAttempt: vi.fn(),
  listAttemptComments: vi.fn(),
  addAttemptComment: vi.fn(),
  deleteAttemptComment: vi.fn(),
}))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const attempt = { id: 'first', recording_path: 'player/first.webm', created_at: '2026-11-13T12:00:00Z', sharer_name: 'Player', verdicts: [], mode: 'wait' }
const props = () => ({ attempt, entries: [], overlay: { mark: vi.fn(), clear: vi.fn() }, supabase: {} })
describe('shared guitar recordings', () => {
  it('posts feedback from a selected beat and seeks the recording from the saved comment', async () => {
    let selectBeat
    const beat = {}
    const api = { beatMouseDown: { on: (fn) => { selectBeat = fn; return () => {} } }, scrollToCursor: vi.fn() }
    const view = props()
    view.overlay.markComment = vi.fn()
    getSharedRecordingUrl.mockResolvedValue('https://example.test/audio.webm')
    canViewAttempt.mockResolvedValue(true)
    listAttemptComments.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 'comment', author_id: 'friend', tag: 'friend', body: 'Try a lighter grip.', anchor_index: 1, created_at: attempt.created_at },
    ])
    addAttemptComment.mockResolvedValue(undefined)
    const { container } = render(<GuitarSharedPanel {...view}
      attempt={{ ...attempt, verdicts: ['hit', 'close'], timing: [[0, 0], [4.999, 0], [5, 2]], song_fingerprint: 'score' }}
      entries={[{ index: 0, bar: 0, time: 0, tick: 0, beats: [], notes: [] }, { index: 1, bar: 1, time: 2, tick: 1920, beats: [beat], notes: [] }]}
      api={api} ready userId="friend" scoreFingerprint="score" />)
    await screen.findByText('No comments yet. Say how it went!')
    act(() => selectBeat(beat))
    expect(screen.getByText(/Commenting on bar 2/)).toBeTruthy()
    const audio = container.querySelector('audio')
    Object.defineProperties(audio, { readyState: { value: 1 }, duration: { value: 8 } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), { target: { value: 'Try a lighter grip.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect(addAttemptComment).toHaveBeenCalledWith(view.supabase, attempt.id, 'Try a lighter grip.', 1)
    fireEvent.click(await screen.findByRole('button', { name: 'Go to bar 2 · note 2' }))
    expect(audio.currentTime).toBe(5)
    expect(api.tickPosition).toBe(1920)
    await waitFor(() => expect(view.overlay.markComment).toHaveBeenCalledWith(1))
  })

  it('keeps link-only playback available without exposing the comment form', async () => {
    canViewAttempt.mockResolvedValue(false)
    getSharedRecordingUrl.mockResolvedValue('https://example.test/audio.webm')
    render(<GuitarSharedPanel {...props()} userId="link-viewer" />)
    await screen.findByText('Listen to Player play')
    expect(screen.queryByRole('textbox', { name: 'Comment' })).toBeNull()
    expect(listAttemptComments).not.toHaveBeenCalled()
  })
  it('offers recovery when the recording URL cannot load', async () => {
    getSharedRecordingUrl.mockRejectedValueOnce(new Error('offline')).mockResolvedValue('https://example.test/audio.webm')
    const { container } = render(<GuitarSharedPanel {...props()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry recording' }))
    await waitFor(() => expect(container.querySelector('audio')?.getAttribute('src')).toBe('https://example.test/audio.webm'))
    expect(screen.getByText(/older recording has no cursor timing/)).toBeTruthy()
  })
  it('never leaves the previous recording visible while a different attempt loads', async () => {
    getSharedRecordingUrl.mockResolvedValueOnce('https://example.test/first.webm').mockReturnValue(new Promise(() => {}))
    const held = props()
    const { container, rerender } = render(<GuitarSharedPanel {...held} />)
    await waitFor(() => expect(container.querySelector('audio')).not.toBe(null))
    rerender(<GuitarSharedPanel {...held} attempt={{ ...attempt, id: 'second' }} />)
    expect(container.querySelector('audio')).toBe(null)
  })
})
