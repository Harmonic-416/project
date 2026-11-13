// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import RunReview from '../src/tabs/guitar/song/follow/RunReview.jsx'
import { reviewRows } from '../src/tabs/guitar/song/follow/runReview.js'
const entries = Array.from({ length: 4 }, (_, index) => ({ index, bar: index, kind: 'single', technique: index === 3 ? 'bend' : 'pick', notes: [{ string: 1, fret: index }] }))
afterEach(cleanup)
describe('per-note run review', () => {
  it('keeps hit, close, missed and unsupported techniques distinct without timing grades', () => {
    const rows = reviewRows(entries, ['hit', 'close', 'miss', 'skipped'], 'trouble')
    expect(rows.map((row) => row.label)).toEqual(['Hit', 'Close', 'Missed', 'Not scored'])
    expect(rows[3].reason).toContain('bend')
    expect(JSON.stringify(rows)).not.toMatch(/early|late|on.time/)
  })
  it('labels manual skips separately from excluded techniques', () => {
    expect(reviewRows(entries, ['hit', 'close', 'miss', 'skipped'], 'wait').map((row) => row.label)).toEqual(['First try', 'After retry', 'Manually skipped', 'Not scored'])
  })
  it('filters weak notes and opens the exact selected entry', () => {
    const select = vi.fn()
    render(<RunReview entries={entries} verdicts={['hit', 'close', 'miss', 'skipped']} mode="trouble" onSelect={select} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'practice' } })
    expect(screen.queryByRole('button', { name: /Bar 1/ })).toBe(null)
    fireEvent.click(screen.getByRole('button', { name: /Bar 3/ }))
    expect(select).toHaveBeenCalledWith(entries[2])
  })
})
