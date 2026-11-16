import { describe, expect, it } from 'vitest'
import { ACTIVITIES, LEVELS, courseLevels, levelStates, songStarsId } from '../src/tabs/vocal/learn/levels.js'

// Vocal → Learn is a course of songs: one song per level, the warm-ups and
// lessons beside it as support, and nothing ever locked.

const library = LEVELS.map((level) => ({
  id: level.song,
  filename: level.song,
  title: level.song.replace(/\.[a-z]+$/, ''),
  url: `/midi-files/${level.song}`,
}))

describe('courseLevels', () => {
  it('gives every level its song from the library and its activities in full', () => {
    const levels = courseLevels(library)
    expect(levels).toHaveLength(LEVELS.length)
    expect(levels[0].song).toBe(library[0])
    for (const level of levels) {
      expect(level.supports.length).toBeGreaterThan(0)
      for (const activity of level.supports) expect(activity).toMatchObject(ACTIVITIES[activity.id])
    }
  })

  it('leaves out a level whose song file is missing, rather than showing it broken', () => {
    const levels = courseLevels(library.slice(1))
    expect(levels.map((l) => l.id)).toEqual(LEVELS.slice(1).map((l) => l.id))
  })

  it('only points at activities that exist', () => {
    for (const level of LEVELS) for (const id of level.supports) expect(ACTIVITIES[id]).toBeDefined()
  })
})

describe('levelStates', () => {
  const levels = courseLevels(library)

  it('suggests the first level on a fresh start, and locks nothing', () => {
    const states = levelStates(levels, {})
    expect(states[0]).toBe('next')
    expect(states.slice(1).every((s) => s === 'open')).toBe(true)
    expect(states).not.toContain('locked')
  })

  it('counts a level done once its song has a sung run, whatever the stars', () => {
    const states = levelStates(levels, { [songStarsId(levels[0].song)]: 0 })
    expect(states[0]).toBe('done')
    expect(states[1]).toBe('next')
  })

  it('suggests the first unsung song even when a later one was sung first', () => {
    const states = levelStates(levels, { [songStarsId(levels[2].song)]: 3 })
    expect(states.slice(0, 3)).toEqual(['next', 'open', 'done'])
  })

  it('suggests nothing once every song has been sung', () => {
    const stars = Object.fromEntries(levels.map((l) => [songStarsId(l.song), 2]))
    expect(levelStates(levels, stars).every((s) => s === 'done')).toBe(true)
  })

  it('ignores stars from supporting activities when judging a level', () => {
    expect(levelStates(levels, { 'solfege-scale': 3, 'pitch-test': 3 })[0]).toBe('next')
  })
})
