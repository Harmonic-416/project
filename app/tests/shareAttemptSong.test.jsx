// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ShareAttempt from '../src/tabs/vocal/components/ShareAttempt.jsx'
import SharedAttemptGate from '../src/tabs/vocal/components/SharedAttemptGate.jsx'
import { saveAttempt, sendAttemptToFriends } from '@backend/attempts'
import { listFriends } from '@backend/friends'
import { keepSongOnAccount } from '../src/tabs/home/songSharing.js'

vi.mock('@backend/attempts', () => ({
  attachRecording: vi.fn(),
  saveAttempt: vi.fn(),
  sendAttemptToFriends: vi.fn(),
  shareAttempt: vi.fn(),
  shareAttemptLink: vi.fn(),
  updateAttemptResult: vi.fn(),
}))
vi.mock('@backend/practiceSessions', () => ({ deleteAttemptRecording: vi.fn() }))
vi.mock('@backend/friends', () => ({ listFriends: vi.fn(), formatHandle: (friend) => friend.display_name }))
vi.mock('../src/tabs/home/songSharing.js', () => ({ keepSongOnAccount: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const supabase = {}
const auth = { configured: true, user: { id: 'me', email: 'me@example.com', user_metadata: {} } }
const fingerprint = 'c'.repeat(64)
const ownSong = { songId: null, title: 'My Tune', format: 'musicxml', fingerprint, builtin: false, partId: null, partName: null, withOthers: false }

async function sendToAna(song) {
  saveAttempt.mockResolvedValue({ id: 'attempt-1', recording_path: null })
  listFriends.mockResolvedValue([{ user_id: 'ana', display_name: 'Ana', kind: 'friend' }])
  render(<ShareAttempt auth={auth} supabase={supabase} song={song} accuracy={80} recording={null} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send to friends' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Send to friends' }))
  fireEvent.click(await screen.findByLabelText('Ana'))
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await screen.findByText(/Sent to Ana/)
}

describe('sending a take of your own song to a friend', () => {
  it('puts the song on your account before the take goes', async () => {
    const order = []
    keepSongOnAccount.mockImplementation(async () => {
      order.push('song')
      return true
    })
    sendAttemptToFriends.mockImplementation(async () => order.push('send'))
    await sendToAna(ownSong)
    expect(keepSongOnAccount).toHaveBeenCalledWith(supabase, fingerprint)
    expect(sendAttemptToFriends).toHaveBeenCalledWith(supabase, 'attempt-1', ['ana'])
    expect(order).toEqual(['song', 'send'])
    expect(screen.queryByText(/their own copy/)).toBe(null)
  })

  it('still sends when the song can’t be kept, and says the friend needs their own copy', async () => {
    keepSongOnAccount.mockResolvedValue(false)
    await sendToAna(ownSong)
    expect(sendAttemptToFriends).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/My Tune couldn’t be kept on your account, so they’ll need their own copy of the file\./)).toBeTruthy()
  })

  it('leaves catalog and built-in songs alone: both people already have them', async () => {
    await sendToAna({ ...ownSong, builtin: true })
    cleanup()
    await sendToAna({ ...ownSong, songId: 'catalog-1' })
    expect(keepSongOnAccount).not.toHaveBeenCalled()
    expect(sendAttemptToFriends).toHaveBeenCalledTimes(2)
  })
})

describe('the shared-attempt gate, when the sender’s song isn’t stored for you', () => {
  it('says whose copy is missing and asks for yours', () => {
    const attempt = { sharer_name: 'Ana', song_title: 'My Tune', song_format: 'musicxml' }
    render(<SharedAttemptGate shared={{ phase: 'need-file', attempt }} onFileSelected={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Their copy of this song isn’t stored\s+online for you, so open your own copy of the same file/)).toBeTruthy()
    expect(screen.queryByText(/The song isn’t stored online/)).toBe(null)
  })
})
