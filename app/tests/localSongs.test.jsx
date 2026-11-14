// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import LocalSongs from '../src/tabs/guitar/song/LocalSongs.jsx'
import { listMyFiles, loadMyFile } from '../src/tabs/home/myFiles.js'
vi.mock('../src/tabs/home/myFiles.js', () => ({ listMyFiles: vi.fn(), loadMyFile: vi.fn(), fileKind: () => 'MusicXML' }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
describe('Guitar saved files', () => {
  it('shows only guitar files and loads bytes on selection', async () => {
    listMyFiles.mockResolvedValue([{ id: 'g', name: 'My song.musicxml', instrument: 'guitar' }, { id: 'v', name: 'Voice', instrument: 'voice' }])
    const bytes = new ArrayBuffer(4)
    loadMyFile.mockResolvedValue({ bytes, name: 'My song.musicxml' })
    const open = vi.fn()
    render(<LocalSongs onOpen={open} />)
    fireEvent.click(await screen.findByRole('button', { name: /My song/ }))
    await waitFor(() => expect(open).toHaveBeenCalledWith(bytes, 'My song.musicxml'))
    expect(screen.queryByText('Voice')).toBe(null)
  })
  it('offers recovery when storage fails', async () => {
    listMyFiles.mockRejectedValueOnce(new Error('blocked')).mockResolvedValueOnce([])
    render(<LocalSongs onOpen={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await screen.findByText(/Your music stays on this device/)
  })
})

it('does not reopen a delayed saved file after another source was selected', async () => {
  listMyFiles.mockResolvedValue([{id:'saved',name:'Delayed.musicxml',instrument:'guitar'}])
  let resolve; let current = true
  loadMyFile.mockReturnValue(new Promise((done) => {resolve = done}))
  const open = vi.fn()
  render(<LocalSongs onOpen={open} onBeginOpen={() => ({isCurrent: () => current})} />)
  fireEvent.click(await screen.findByRole('button', {name:/Delayed.musicxml/}))
  current = false
  await act(async () => resolve({bytes:new ArrayBuffer(1),name:'Delayed.musicxml'}))
  expect(open).not.toHaveBeenCalled()
})
