// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import GuitarPlaybackControls from '../src/tabs/guitar/song/follow/GuitarPlaybackControls.jsx'
afterEach(() => { cleanup(); document.querySelector('#transport-test')?.remove() })
describe('mode transport placement', () => {
  it('puts the active mode controls in the toolbar while retaining its play action', () => {
    const host = document.createElement('div')
    host.id = 'transport-test'
    document.body.append(host)
    const play = vi.fn()
    const { container } = render(<GuitarPlaybackControls transportHost={host} state="idle" position={0} duration={20} onPlay={play} />)
    const button = screen.getByRole('button', { name: 'Play' })
    expect(host.contains(button)).toBe(true)
    expect(container.querySelector('button')).toBe(null)
    fireEvent.click(button)
    expect(play).toHaveBeenCalledTimes(1)
  })
})
