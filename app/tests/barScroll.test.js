import { describe, expect, it, vi } from 'vitest'
import { createBarScrollHandler } from '../src/tabs/guitar/song/follow/barScroll.js'
const beat = (index) => ({ barBounds: { masterBarBounds: { index, realBounds: { y: index * 120, h: 100 } } } })
describe('bar-follow scrolling', () => {
  it('follows each new bar, not every beat, including a loop back', () => {
    const follow = vi.fn()
    const handler = createBarScrollHandler(follow)
    handler.onBeatCursorUpdating(beat(0))
    handler.onBeatCursorUpdating(beat(0))
    handler.onBeatCursorUpdating(beat(1))
    handler.onBeatCursorUpdating(beat(0))
    expect(follow.mock.calls.map(([bar]) => bar.index)).toEqual([0, 1, 0])
  })
  it('supports explicit seek and safely ignores unavailable layout bounds', () => {
    const follow = vi.fn()
    const handler = createBarScrollHandler(follow)
    handler.forceScrollTo(beat(3))
    handler.onBeatCursorUpdating(null)
    handler.dispose()
    handler.onBeatCursorUpdating(beat(3))
    expect(follow).toHaveBeenCalledTimes(2)
  })
})
