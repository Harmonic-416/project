import { describe, expect, it } from 'vitest'
import { CHORDS } from '../src/tabs/guitar/practice/chords.js'
import { createChangeCounter } from '../src/tabs/guitar/practice/changesCounter.js'
import { RUN_SECONDS, changesReducer, defaultPair, initialChanges, pairKey, recordBest } from '../src/tabs/guitar/practice/changesState.js'
import { chordTransition, transitionTip } from '../src/tabs/guitar/practice/chordTransition.js'
import { listen, mix, renderGuitar, strum, typing, withRoomNoise } from './guitarSignals.js'

const chord = (id) => CHORDS.find((c) => c.id === id)
const shapeOf = (c) => Object.fromEntries(c.frets.flatMap((fret, i) => (fret < 0 ? [] : [[6 - i, fret]])))
const run = (actions, state = initialChanges()) => actions.reduce(changesReducer, state)

describe('one-minute changes (F38)', () => {
  it('counts down, runs a minute, and only counts taps while running', () => {
    let state = run([{ type: 'tap' }, { type: 'start' }, { type: 'tap' }])
    expect(state).toMatchObject({ status: 'countdown', tapped: 0 })
    state = run([{ type: 'tick' }, { type: 'tick' }, { type: 'tick' }], state)
    expect(state.status).toBe('running')
    state = run([{ type: 'tap' }, { type: 'tap' }, { type: 'heard', count: 1 }], state)
    expect(state).toMatchObject({ tapped: 2, heard: 1, left: RUN_SECONDS })
    for (let i = 0; i < RUN_SECONDS; i += 1) state = changesReducer(state, { type: 'tick' })
    expect(state).toMatchObject({ status: 'done', left: 0, tapped: 2 })
    expect(changesReducer(state, { type: 'tap' })).toBe(state)
  })

  it('keeps the best per pair, either way round', () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} }
    expect(pairKey('Em', 'C')).toBe(pairKey('C', 'Em'))
    let bests = recordBest({}, 'Em', 'C', 21)
    bests = recordBest(bests, 'C', 'Em', 18)
    expect(bests[pairKey('Em', 'C')]).toBe(21)
    delete globalThis.localStorage
  })

  it('pairs the newest opened chord with the one before it', () => {
    expect(defaultPair(1)).toEqual(['Em', 'Am'])
    expect(defaultPair(4)).toEqual(['C', 'G'])
  })
})

describe('chord transitions', () => {
  it('keeps the 1st and 2nd fingers down from C to A minor', () => {
    const moves = chordTransition(chord('C'), chord('Am'))
    expect(moves.find((m) => m.finger === 1).kind).toBe('anchor')
    expect(moves.find((m) => m.finger === 2).kind).toBe('anchor')
    expect(moves.find((m) => m.finger === 3).kind).toBe('move')
    expect(transitionTip(chord('C'), chord('Am'))).toMatch(/Keep your 1st finger and 2nd finger down/)
  })

  it('lifts the 3rd finger from E to E7, and places new fingers', () => {
    const moves = chordTransition(chord('E'), chord('E7'))
    expect(moves.find((m) => m.finger === 3).kind).toBe('lift')
    expect(chordTransition(chord('Em'), chord('C')).find((m) => m.finger === 1).kind).toBe('place')
  })
})

describe('counting changes by mic', () => {
  const em = chord('Em')
  const c = chord('C')
  const count = (signal) => {
    const counter = createChangeCounter(em, c)
    for (const window of listen(signal)) counter.window(window)
    return counter.count
  }

  it('counts each switch between the two chords', () => {
    const strums = [em, c, em, c, em, c].flatMap((ch, i) => strum(0.5 + i * 0.7, shapeOf(ch), { seed: 70 + i }))
    expect(count(withRoomNoise(renderGuitar(5, strums)))).toBe(5)
  })

  it('doesn’t count the same chord twice, or typing while it rings', () => {
    const same = [0, 1, 2].flatMap((i) => strum(0.5 + i * 0.7, shapeOf(em), { seed: 80 + i }))
    expect(count(withRoomNoise(renderGuitar(3, same)))).toBe(0)
    const typed = mix(renderGuitar(4, [...strum(0.5, shapeOf(em)), ...strum(1.2, shapeOf(c), { seed: 9 })]), typing(4, 1.6, 3.8, { seed: 2 }))
    expect(count(withRoomNoise(typed))).toBe(1)
  })
})
