// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkingOnCards } from '../src/tabs/home/ProgressSection.jsx'
import MyFilesSection from '../src/tabs/home/MyFilesSection.jsx'
import PracticeSessions from '../src/tabs/vocal/components/PracticeSessions.jsx'
import SocialFriends from '../src/tabs/social/SocialFriends.jsx'
import SocialTab from '../src/tabs/social/SocialTab.jsx'

vi.mock('../src/lib/supabaseClient.js', () => ({ supabase: {} }))
vi.mock('../src/tabs/home/myFiles.js', () => ({ myFilesAvailable: () => true }))
vi.mock('../src/tabs/home/useMyFiles.js', () => ({ useMyFiles: () => ({ files: [] }) }))
vi.mock('@backend/practiceSessions', () => ({
  listPracticeSessions: async () => [],
  recordingStorageUsed: async () => null,
}))

afterEach(cleanup)

it('explains what goes in Working On and offers the Guitar song library', () => {
  const navigate = vi.fn()
  render(<WorkingOnCards recent={[]} showAdd onNavigate={navigate} />)
  expect(screen.getByText('Songs you practise will show up here.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Guitar' }))
  expect(navigate).toHaveBeenCalledWith('guitar')
})

it.each([null, 'player'])('offers a local score action from empty My Files (%s)', (userId) => {
  const importScore = vi.fn()
  render(<MyFilesSection userId={userId} onImportScore={importScore} />)
  expect(screen.getByText(/Scores you open from a file appear here/)).toBeTruthy()
  expect(Boolean(screen.queryByText(/Sign in to keep them on your account/))).toBe(!userId)
  const file = new File(['score'], 'song.musicxml')
  fireEvent.change(screen.getByLabelText('Open a Guitar score'), { target: { files: [file] } })
  expect(importScore).toHaveBeenCalledWith(file)
})

it('offers song practice when signed-in sessions are empty', async () => {
  const start = vi.fn()
  render(<PracticeSessions auth={{ configured: true, ready: true, user: { id: 'player' } }}
    supabase={{}} instrument="guitar" onStartPractice={start} practiceActionLabel="Open song library" />)
  expect(await screen.findByText(/completed Wait for me and Trouble spots runs/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Open song library' }))
  expect(start).toHaveBeenCalledOnce()
})

it('explains that sessions require sign-in and hides the cloud action', () => {
  render(<PracticeSessions auth={{ configured: true, ready: true }} supabase={{}}
    onStartPractice={vi.fn()} practiceActionLabel="Open song library" />)
  expect(screen.getByText(/practice history.*sign in/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Open song library' })).toBeNull()
})

it('guides a signed-in player to the add-friend field', () => {
  render(<SocialFriends me={{ display_name: 'Player', tag: 'abcd' }} friends={[]} />)
  expect(screen.getByText('People you add or accept will appear here.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Add a friend' }))
  expect(document.activeElement).toBe(screen.getByRole('textbox'))
})

it('tells a signed-out player how to enable friends', () => {
  render(<SocialTab auth={{ configured: true, ready: true }} onNavigate={vi.fn()} />)
  expect(screen.getByText(/People you add will appear here after you sign in/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Add a friend' })).toBeNull()
})
