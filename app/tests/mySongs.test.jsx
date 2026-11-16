// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import MySongs from '../src/ui/MySongs.jsx'
import { fetchSongInfo } from '../src/tabs/vocal/songs/songInfo.js'
import { deleteMyFile, listMyFiles, loadMyFile, rememberMyFile } from '../src/tabs/home/myFiles.js'
import { deleteMyFileRecord, fetchMyFile, listMyFileRecords } from '@backend/myFiles'
import { fingerprintBytes } from '../src/tabs/vocal/share/sharedAttempt.js'

vi.mock('../src/lib/supabaseClient.js', () => ({ supabase: {} }))
vi.mock('../src/tabs/home/myFiles.js', () => ({
  listMyFiles: vi.fn(),
  loadMyFile: vi.fn(),
  rememberMyFile: vi.fn(),
  deleteMyFile: vi.fn(),
  myFilesAvailable: () => true,
  fileKind: (name) => (name.endsWith('.mid') ? 'MIDI' : 'MusicXML'),
}))
vi.mock('@backend/myFiles', async (original) => ({
  // mergeMyFiles is the real one: the list here is the list Home shows.
  mergeMyFiles: (await original()).mergeMyFiles,
  listMyFileRecords: vi.fn(),
  myFileStorageUsed: vi.fn(async () => null),
  fetchMyFile: vi.fn(),
  deleteMyFileRecord: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

const device = (id, name, instrument = 'voice', opened = 10) => ({ id, name, instrument, size: 100, added: 1, opened })
const record = (fingerprint, name, stored = true, instrument = 'voice', opened = 5) => ({ fingerprint, name, instrument, size: 100, added: 1, opened, stored })

describe('My songs on a Songs page', () => {
  it('lists this instrument’s files from the device and the account, and opens one from the device', async () => {
    listMyFiles.mockResolvedValue([device('here', 'my_tune.musicxml'), device('riff', 'riff.gp5', 'guitar')])
    listMyFileRecords.mockResolvedValue([
      record('here', 'my_tune.musicxml'),
      record('cloud', 'From a friend.musicxml'),
      record('elsewhere', 'Not sent yet.mid', false),
    ])
    const bytes = new ArrayBuffer(4)
    loadMyFile.mockResolvedValue({ id: 'here', name: 'my_tune.musicxml', instrument: 'voice', bytes })
    const open = vi.fn()
    render(<MySongs instrument="voice" userId="me" onOpen={open} emptyText="None yet." />)

    const card = await screen.findByRole('button', { name: /^my_tune/ })
    expect(screen.getByRole('button', { name: /^From a friend.*on your account/ })).toBeTruthy()
    // Another instrument's file, and one no device has sent to the account yet, aren't offered here.
    expect(screen.queryByText(/riff/)).toBe(null)
    expect(screen.queryByText(/Not sent yet/)).toBe(null)
    expect(screen.getByText(/private to you/)).toBeTruthy()

    fireEvent.click(card)
    await waitFor(() => expect(open).toHaveBeenCalledWith({ id: 'here', name: 'my_tune.musicxml', instrument: 'voice', bytes }, undefined))
    expect(fetchMyFile).not.toHaveBeenCalled()
  })

  it('fetches a song that is only on the account, checks it, keeps it here, then opens it', async () => {
    const bytes = new TextEncoder().encode('<score-partwise/>').buffer
    const id = await fingerprintBytes(bytes)
    listMyFiles.mockResolvedValue([])
    listMyFileRecords.mockResolvedValue([record(id, 'Cloud song.musicxml'), record('bad', 'Tampered.musicxml')])
    fetchMyFile.mockResolvedValue(bytes)
    const open = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<MySongs instrument="voice" userId="me" onOpen={open} emptyText="None yet." />)

    fireEvent.click(await screen.findByRole('button', { name: /^Cloud song/ }))
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1))
    expect(rememberMyFile).toHaveBeenCalledWith({ id, name: 'Cloud song.musicxml', instrument: 'voice', bytes })
    expect(open.mock.calls[0][0]).toMatchObject({ id, name: 'Cloud song.musicxml', bytes })

    // Bytes that aren't the file the list names never open.
    fireEvent.click(screen.getByRole('button', { name: /^Tampered/ }))
    await screen.findByText(/Could not fetch it from your account/)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('removes a song after asking: a device file through the device list, an account-only one from the account', async () => {
    listMyFiles.mockResolvedValue([device('here', 'Mine.musicxml')])
    listMyFileRecords.mockResolvedValue([record('cloud', 'Kept.musicxml')])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
    render(<MySongs instrument="voice" userId="me" onOpen={vi.fn()} emptyText="None yet." />)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Mine.musicxml' }))
    expect(confirm).toHaveBeenCalledWith('Remove “Mine.musicxml” from this device and your account?')
    expect(deleteMyFile).not.toHaveBeenCalled() // said no

    fireEvent.click(screen.getByRole('button', { name: 'Remove Mine.musicxml' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Mine/ })).toBe(null))
    expect(deleteMyFile).toHaveBeenCalledWith('here')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Kept.musicxml' }))
    await screen.findByText('None yet.')
    expect(deleteMyFileRecord).toHaveBeenCalledWith({}, 'cloud')
  })

  it('signed out, shows the device’s songs and one line when there are none', async () => {
    listMyFiles.mockResolvedValue([])
    const { unmount } = render(<MySongs instrument="voice" onOpen={vi.fn()} emptyText="Add your first with the box below." />)
    await screen.findByText('Add your first with the box below.')
    expect(listMyFileRecords).not.toHaveBeenCalled()
    unmount()

    listMyFiles.mockResolvedValue([device('here', 'Mine.musicxml')])
    render(<MySongs instrument="voice" onOpen={vi.fn()} renderMeta={(song) => <em>meta for {song.title}</em>} emptyText="None yet." />)
    await screen.findByText('meta for Mine')
    expect(screen.getByText(/Sign in on Home to keep them on your account/)).toBeTruthy()
  })
})

describe('a song card’s facts for one of your own files', () => {
  it('reads the file’s bytes instead of fetching a url, once per file', async () => {
    const xml = '<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch></note></measure></part></score-partwise>'
    const load = vi.fn(async () => new TextEncoder().encode(xml).buffer)
    const song = { id: 'f'.repeat(64), title: 'Mine', filename: 'Mine.musicxml', load }
    expect(await fetchSongInfo(song)).toMatchObject({ partCount: 1, bars: 1, range: { label: 'C4–C4' } })
    await fetchSongInfo({ ...song })
    expect(load).toHaveBeenCalledTimes(1)
    expect(await fetchSongInfo({ id: 'e'.repeat(64), filename: 'Gone.musicxml', load: async () => null })).toBeNull()
  })
})
