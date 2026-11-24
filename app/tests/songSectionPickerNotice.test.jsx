// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import SongSectionPicker from '../src/tabs/guitar/song/SongSectionPicker.jsx'

const HINT = 'Choose bars in the picker or drag a passage on the tab first.'

function renderPicker(section = null) {
  const props = { api: null, barCount: 8, onChange: vi.fn(), disabled: false, storageKey: 'notice-test', getPassage: () => null }
  const view = render(<SongSectionPicker {...props} section={section} />)
  return { ...view, rerenderWith: (next) => view.rerender(<SongSectionPicker {...props} section={next} />) }
}

beforeEach(() => { vi.useFakeTimers(); localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Save passage notice', () => {
  it('clears itself instead of staying in the practice row', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Save passage' }))
    expect(screen.getByRole('alert').textContent).toBe(HINT)
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByRole('alert')).toBe(null)
  })

  it('clears as soon as a passage is chosen, since that is what it asked for', () => {
    const { rerenderWith } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Save passage' }))
    expect(screen.getByRole('alert')).toBeTruthy()
    rerenderWith({ first: 0, last: 1 })
    expect(screen.queryByRole('alert')).toBe(null)
  })
})
