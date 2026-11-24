// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/App.jsx'
import PracticeHeaderControls from '../src/tabs/shared/PracticeHeaderControls.jsx'

vi.mock('../src/auth/useSession.js', () => ({ useSession: () => ({}) }))
vi.mock('../src/tabs/guitar/learn/useLearnProgressSync.js', () => ({ useLearnProgressSync: () => 0 }))
vi.mock('../src/tabs/home/useMyFilesSync.js', () => ({ useMyFilesSync: () => 0 }))
vi.mock('../src/tabs/home/HomeTab.jsx', () => ({ default: () => <h1>Home page</h1> }))
vi.mock('../src/tabs/social/SocialTab.jsx', () => ({ default: ({ inviteCode }) => <h1>Invite {inviteCode}</h1> }))
vi.mock('../src/tabs/guitar/GuitarTab.jsx', () => ({
  default: ({ initialView }) => <><PracticeHeaderControls /><h1>Guitar {initialView}</h1></>,
}))
vi.mock('../src/tabs/vocal/VocalTab.jsx', () => ({
  default: ({ initialSection, initialWarmUp, sharedAttemptId }) => (
    <><PracticeHeaderControls /><h1>Vocal {initialSection} {initialWarmUp && 'warm-up'} {sharedAttemptId}</h1></>
  ),
}))

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

it('routes from welcome to Guitar and replays from the shared header to Vocal warm-up', () => {
  render(<App />)
  const welcome = screen.getByRole('dialog', { name: 'Welcome to Harmonic' })
  fireEvent.click(within(welcome).getByRole('button', { name: 'Guitar' }))
  expect(screen.getByRole('heading', { name: 'Guitar tuner' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Practice help' }))
  fireEvent.click(screen.getByRole('button', { name: 'Replay welcome' }))
  fireEvent.click(screen.getByRole('button', { name: 'Voice' }))
  expect(screen.getByRole('heading', { name: /^Vocal learn warm-up/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Practice help' })).toBeTruthy()
})

it.each([
  ['/?attempt=2d3d064a-5eff-4b74-9840-46bfc2edda7e', /Vocal.*2d3d064a/],
  ['/?invite=a1b2c3d4e5f60718', /Invite.*a1b2c3d4e5f60718/],
])('suppresses welcome on a deep link (%s)', (url, destination) => {
  window.history.replaceState(null, '', url)
  const { unmount } = render(<App />)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('heading', { name: destination })).toBeTruthy()
  unmount()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  render(<App />)
  expect(screen.getByRole('dialog', { name: 'Welcome to Harmonic' })).toBeTruthy()
})
