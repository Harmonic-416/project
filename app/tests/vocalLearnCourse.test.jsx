// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

// Vocal → Learn on screen: a level per song, nothing locked, the song opens
// on the song screen and the supporting activities open in place.

vi.mock('../src/tabs/vocal/songs/songLibrary.js', () => ({
  songLibrary: [
    { id: 'c-major-scale.mid', filename: 'c-major-scale.mid', title: 'C Major Scale', url: '/midi-files/c-major-scale.mid' },
    { id: 'ode-to-joy.musicxml', filename: 'ode-to-joy.musicxml', title: 'Ode To Joy', url: '/midi-files/ode-to-joy.musicxml' },
  ],
}))
vi.mock('../src/tabs/vocal/learn/usePlayback.js', () => ({ usePlayback: () => ({ stop() {} }) }))
vi.mock('../src/tabs/vocal/feedback/sfx.js', () => ({ sfx: { tap() {} } }))
vi.mock('../src/tabs/vocal/warmup/WarmUp.jsx', () => ({
  default: ({ show, only }) => (
    <p>
      WarmUp:{show}
      {only ? `:${only}` : ''}
    </p>
  ),
}))
vi.mock('../src/tabs/vocal/learn/SolfegeLearn.jsx', () => ({ default: ({ lesson }) => <p>Solfege:{lesson}</p> }))
vi.mock('../src/tabs/vocal/learn/RhythmLearn.jsx', () => ({ default: () => <p>Rhythm</p> }))

const { default: VocalLearn } = await import('../src/tabs/vocal/learn/VocalLearn.jsx')
const { resetProgressCache } = await import('../src/tabs/vocal/feedback/progress.js')

beforeEach(() => {
  localStorage.clear()
  resetProgressCache()
  vi.stubGlobal('fetch', async () => ({ ok: false }))
  vi.stubGlobal('requestAnimationFrame', (fn) => fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('VocalLearn', () => {
  it('shows one level per song, with every song open to sing', () => {
    render(<VocalLearn onOpenSong={() => {}} />)
    const levels = within(screen.getByRole('list', { name: 'Levels' })).getAllByRole('heading', { level: 2 })
    expect(levels.map((h) => h.textContent)).toEqual(['C Major Scale', 'Ode To Joy'])
    for (const button of screen.getAllByRole('button')) expect(button.disabled).toBe(false)
  })

  it('starts on level one, with no shortcut card repeating it, and opens its song', () => {
    const onOpenSong = vi.fn()
    render(<VocalLearn onOpenSong={onOpenSong} />)
    expect(screen.queryByRole('button', { name: /Up next · Level/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sing: C Major Scale' }))
    expect(onOpenSong).toHaveBeenCalledWith(expect.objectContaining({ title: 'C Major Scale' }), 'scale')
  })

  it('lets a later song be sung straight away', () => {
    const onOpenSong = vi.fn()
    render(<VocalLearn onOpenSong={onOpenSong} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sing: Ode To Joy' }))
    expect(onOpenSong).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ode To Joy' }), 'ode')
  })

  it('moves the suggestion on once a song has been sung', () => {
    localStorage.setItem('harmonic.vocal.progress', JSON.stringify({ streak: 1, lastDay: null, stars: { 'song:C Major Scale': 2 } }))
    resetProgressCache()
    render(<VocalLearn onOpenSong={() => {}} />)
    expect(screen.getByRole('button', { name: /Up next · Level 2/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sing again: C Major Scale' })).toBeTruthy()
  })

  it('opens a supporting activity in place, with a way to the song and a way back', () => {
    const onOpenSong = vi.fn()
    render(<VocalLearn onOpenSong={onOpenSong} />)
    const scale = screen.getAllByRole('listitem').find((li) => li.textContent.includes('C Major Scale'))
    fireEvent.click(within(scale).getByRole('button', { name: /Warm up/ }))
    expect(screen.getByText('WarmUp:warmups')).toBeTruthy()
    expect(screen.getByText('Getting ready for C Major Scale')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sing C Major Scale →' }))
    expect(onOpenSong).toHaveBeenCalledWith(expect.objectContaining({ title: 'C Major Scale' }), 'scale')

    fireEvent.click(screen.getByRole('button', { name: '← Learn' }))
    expect(screen.getByRole('list', { name: 'Levels' })).toBeTruthy()
  })

  it('opens the solfège, rhythm and ear-test activities a level points at', () => {
    render(<VocalLearn onOpenSong={() => {}} />)
    const ode = screen.getAllByRole('listitem').find((li) => li.textContent.includes('Ode To Joy') && li.className.includes('vlevel'))
    fireEvent.click(within(ode).getByRole('button', { name: /Read it/ }))
    expect(screen.getByText('Solfege:read')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '← Learn' }))

    const again = screen.getAllByRole('listitem').find((li) => li.textContent.includes('Ode To Joy') && li.className.includes('vlevel'))
    fireEvent.click(within(again).getByRole('button', { name: /Pitch test/ }))
    // Just the test the level named, not every test.
    expect(screen.getByText('WarmUp:tests:pitch')).toBeTruthy()
  })
})
