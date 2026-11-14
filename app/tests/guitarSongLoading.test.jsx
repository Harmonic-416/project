// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import GuitarSong from '../src/tabs/guitar/song/GuitarSong.jsx'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { loadMyFile, rememberMyFile } from '../src/tabs/home/myFiles.js'
const mocks = vi.hoisted(() => ({fingerprint: vi.fn(async () => 'fingerprint'), overlay: {clear: vi.fn(), mark: vi.fn()}}))
vi.mock('../src/tabs/guitar/song/songSources.js', () => ({BUILT_IN_SONGS: [{id:'a',title:'First song',filename:'a.musicxml'}, {id:'b',title:'Second song',filename:'b.musicxml'}], findSongFile: vi.fn()}))
vi.mock('../src/tabs/guitar/notation/loadGuitarNotation.js', () => ({GUITAR_NOTATION_ACCEPT: '.musicxml,.mid', loadGuitarNotation: vi.fn()}))
vi.mock('../src/tabs/home/myFiles.js', () => ({loadMyFile: vi.fn(), rememberMyFile: vi.fn(async () => {}), listMyFiles: vi.fn(async () => []), fileKind: () => 'MusicXML'}))
vi.mock('../src/tabs/vocal/share/sharedAttempt.js', () => ({fingerprintBytes: mocks.fingerprint}))
vi.mock('../src/tabs/guitar/song/GuitarScore.jsx', () => ({default: ({score}) => <h2>{score.title}</h2>}))
vi.mock('../src/tabs/guitar/song/follow/useAlphaTabPlayer.js', () => ({useAlphaTabPlayer: () => ({ready:true,state:'idle',loaded:1,tick:0})}))
vi.mock('../src/tabs/guitar/song/follow/useTabOverlay.js', () => ({useTabOverlay: () => mocks.overlay}))
vi.mock('../src/tabs/guitar/song/follow/songTimeline.js', () => ({buildTimeline: () => null, practiceableTracks: () => [], secondsToTicks: () => 0, ticksToSeconds: () => 0}))
const parsed = (title) => ({title,format:'musicxml',score:{title,tracks:[],masterBars:[]}})
afterEach(() => {cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); localStorage.clear()})
it('keeps the latest selected song when earlier fetches finish later', async () => {
  const pending = {}
  vi.stubGlobal('fetch', vi.fn((url) => new Promise((resolve) => {pending[url.includes('a.musicxml') ? 'a' : 'b'] = resolve})))
  loadGuitarNotation.mockImplementation(async (_, filename) => parsed(filename))
  render(<GuitarSong />)
  fireEvent.click(screen.getByRole('button', {name:'First song',exact:true}))
  fireEvent.click(screen.getByRole('button', {name:'Second song',exact:true}))
  await act(async () => pending.b({ok:true,arrayBuffer:async () => new ArrayBuffer(1)}))
  expect(await screen.findByRole('heading', {name:'b.musicxml'})).toBeTruthy()
  await act(async () => pending.a({ok:true,arrayBuffer:async () => new ArrayBuffer(1)}))
  expect(screen.getByRole('heading', {name:'b.musicxml'})).toBeTruthy()
  expect(loadGuitarNotation).toHaveBeenCalledTimes(1)
})
it.each(['invalid.mid', 'invalid.musicxml'])('does not add a rejected %s import to saved files', async (filename) => {
  vi.spyOn(console,'error').mockImplementation(() => {})
  loadGuitarNotation.mockRejectedValueOnce(new Error('This MIDI cannot be converted'))
  const {container} = render(<GuitarSong />)
  const file = {name:filename,size:4,arrayBuffer:async () => new ArrayBuffer(4)}
  await act(async () => fireEvent.change(container.querySelector('input[type="file"]'), {target:{files:[file]}}))
  expect(screen.getByRole('alert').textContent).toContain('cannot be converted')
  expect(rememberMyFile).not.toHaveBeenCalled()
  expect(screen.getByRole('button', {name:'First song',exact:true})).toBeTruthy()
  vi.restoreAllMocks()
})
it('opens a saved file requested from Home and acknowledges it only after parsing', async () => {
  let resolve; loadMyFile.mockResolvedValue({id:'saved',name:'saved.musicxml',bytes:new ArrayBuffer(1)})
  loadGuitarNotation.mockReturnValueOnce(new Promise((done) => {resolve = done}))
  const opened = vi.fn()
  render(<GuitarSong fileToOpenId="saved" onFileOpened={opened} />)
  await waitFor(() => expect(loadGuitarNotation).toHaveBeenCalled())
  expect(opened).not.toHaveBeenCalled()
  await act(async () => resolve(parsed('Saved score')))
  expect(screen.getByRole('heading', {name:'Saved score'})).toBeTruthy()
  expect(opened).toHaveBeenCalledOnce()
})

it('offers catalog browsing and file import without signing in', () => {
  const {container} = render(<GuitarSong auth={{configured:true,ready:true,user:null}} />)
  expect(screen.getByRole('button', {name:/Search songs Browse the online guitar catalog/})).toBeTruthy()
  expect(container.querySelector('input[type="file"]').disabled).toBe(false)
})
