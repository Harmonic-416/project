// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import GuitarSharedPanel from '../src/tabs/guitar/song/follow/GuitarSharedPanel.jsx'
import { getSharedRecordingUrl } from '@backend/attempts'
vi.mock('@backend/attempts', () => ({ getSharedRecordingUrl: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const attempt = { id: 'first', recording_path: 'player/first.webm', created_at: '2026-11-13T12:00:00Z', sharer_name: 'Player', verdicts: [], mode: 'wait' }
const props = () => ({ attempt, entries: [], overlay: { mark: vi.fn(), clear: vi.fn() }, supabase: {} })
describe('shared guitar recordings', () => {
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
