// @vitest-environment jsdom
import React, { forwardRef, useEffect, useImperativeHandle } from 'react'
import { importer } from '@coderline/alphatab'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import GuitarSong from '../src/tabs/guitar/song/GuitarSong.jsx'
import { loadGuitarNotation } from '../src/tabs/guitar/notation/loadGuitarNotation.js'
import { loadMyFile, rememberMyFile } from '../src/tabs/home/myFiles.js'
import { loadSongTempo, saveSongTempo } from '../src/audio/tempo/tempo.js'
import { findAttemptSongFile } from '../src/tabs/guitar/song/songSources.js'
import { canViewAttempt, getSharedAttempt, getSharedRecordingUrl } from '@backend/attempts'
const mocks = vi.hoisted(() => ({
  fingerprint: vi.fn(async () => 'fingerprint'),
  overlay: {clear: vi.fn(), mark: vi.fn()},
  scoreApi: null,
  timeline: null,
  getSongScoreStats: vi.fn(),
  listGuitarPracticeVerdicts: vi.fn(),
  revealBar: vi.fn(),
  client: {},
  realScore: false,
}))
vi.mock('@coderline/alphatab', async (importOriginal) => ({
  ...(await importOriginal()),
  AlphaTabApi: class { constructor() { return mocks.scoreApi } },
}))
vi.mock('../src/lib/supabaseClient.js', () => ({supabase: mocks.client}))
vi.mock('@backend/attempts', async (importOriginal) => ({
  ...(await importOriginal()),
  getSongScoreStats: mocks.getSongScoreStats,
  listGuitarPracticeVerdicts: mocks.listGuitarPracticeVerdicts,
  getSharedAttempt: vi.fn(),
  canViewAttempt: vi.fn(),
  getSharedRecordingUrl: vi.fn(),
}))
vi.mock('../src/tabs/vocal/practice/usePracticeSession.js', () => ({usePracticeSession: () => ({attempts: []})}))
vi.mock('../src/tabs/guitar/song/follow/GuitarTroubleMode.jsx', () => ({default: () => null}))
vi.mock('../src/tabs/guitar/song/follow/SongTransportExtras.jsx', () => ({default: () => null}))
vi.mock('../src/tabs/guitar/song/songSources.js', () => ({BUILT_IN_SONGS: [{id:'a',title:'First song',filename:'a.musicxml'}, {id:'b',title:'Second song',filename:'b.musicxml'}], findSongFile: vi.fn(), findAttemptSongFile: vi.fn()}))
vi.mock('../src/tabs/guitar/notation/loadGuitarNotation.js', () => ({GUITAR_NOTATION_ACCEPT: '.musicxml,.mid', loadGuitarNotation: vi.fn()}))
vi.mock('../src/tabs/home/myFiles.js', () => ({loadMyFile: vi.fn(), rememberMyFile: vi.fn(async () => {}), listMyFiles: vi.fn(async () => []), fileKind: () => 'MusicXML', myFilesAvailable: () => true, deleteMyFile: vi.fn()}))
vi.mock('../src/tabs/vocal/share/sharedAttempt.js', () => ({fingerprintBytes: mocks.fingerprint}))
vi.mock('../src/tabs/guitar/song/GuitarScore.jsx', async (importOriginal) => {
  const { default: RealScore } = await importOriginal()
  const FakeScore = forwardRef(function Score({ score, onApi }, ref) {
    useImperativeHandle(ref, () => ({revealBar: mocks.revealBar, getHost: () => null}))
    useEffect(() => { if (mocks.scoreApi) onApi(mocks.scoreApi) }, [onApi])
    return <h2 data-low-string={score.tracks[0]?.staves[0].tuning.at(-1)}>{score.title}</h2>
  })
  return { default: forwardRef(function Score(props, ref) {
    const ScoreComponent = mocks.realScore ? RealScore : FakeScore
    return <ScoreComponent {...props} ref={ref} />
  }) }
})
vi.mock('../src/tabs/guitar/song/follow/useAlphaTabPlayer.js', () => ({useAlphaTabPlayer: () => ({ready:true,state:'idle',loaded:1,tick:0})}))
vi.mock('../src/tabs/guitar/song/follow/useTabOverlay.js', () => ({useTabOverlay: () => mocks.overlay}))
vi.mock('../src/tabs/guitar/song/follow/songTimeline.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildTimeline: () => mocks.timeline,
  practiceableTracks: () => mocks.timeline ? [{index: 0, name: 'Guitar'}] : [],
  secondsToTicks: () => 0,
  ticksToSeconds: () => 0,
}))
const parsed = (title) => ({title,format:'musicxml',score:{title,tracks:[],masterBars:[]}})
afterEach(() => {cleanup(); mocks.timeline = null; mocks.scoreApi = null; mocks.realScore = false; vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); localStorage.clear()})
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
  expect(screen.getByRole('button', {name:/^Search songs/})).toBeTruthy()
  expect(container.querySelector('input[type="file"]').disabled).toBe(false)
})
it('puts the score, transport and practice modes in the main workspace', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ok:true,arrayBuffer:async () => new ArrayBuffer(1)})))
  loadGuitarNotation.mockResolvedValue(parsed('Score workspace test'))
  const {container}=render(<GuitarSong />)
  fireEvent.click(screen.getByRole('button',{name:'First song',exact:true}))
  await screen.findByRole('heading',{name:'Score workspace test'})
  const main=screen.getByRole('region',{name:'Score workspace'})
  const options=screen.getByRole('complementary',{name:'Practice options'})
  expect(main.contains(screen.getByRole('heading',{name:'Score workspace test'}))).toBe(true)
  expect(main.querySelector('.guitar-song__transport-slot')).toBeTruthy()
  expect(main.contains(screen.getByRole('group',{name:'Practice mode'}))).toBe(true)
  expect(options.querySelector('.guitar-song__tempo-slot')).toBeTruthy()
  expect(container.querySelector('.song-workspace').children[0]).toBe(main)
  expect(main.nextElementSibling.querySelector('.song-workspace__feedback')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}))
  expect(screen.getByRole('button',{name:'Settings',exact:true}).getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(screen.getByRole('button',{name:'Close practice options'}))
  expect(screen.getByRole('button',{name:'Settings',exact:true}).getAttribute('aria-expanded')).toBe('false')
})

it('opens a recurring trouble spot as a paused single-bar loop and clears it', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(1)})))
  loadGuitarNotation.mockResolvedValue(parsed('Practice score'))
  mocks.timeline = {
    tempoMap: [{tick: 0, time: 0, bpm: 120}],
    bars: [{index: 0, start: 0, end: 960}, {index: 1, start: 960, end: 1920}],
    entries: [{bar: 0, index: 0, tick: 0}, {bar: 1, index: 1, tick: 960}],
  }
  mocks.scoreApi = {
    stop: vi.fn(), play: vi.fn(), scrollToCursor: vi.fn(), changeTrackMute: vi.fn(),
    clearPlaybackRangeHighlight: vi.fn(), changeTrackSolo: vi.fn(),
  }
  mocks.getSongScoreStats.mockResolvedValue({last: 50, best: 100, count: 3})
  mocks.listGuitarPracticeVerdicts.mockResolvedValue([['hit', 'miss'], ['hit', 'close'], ['hit', 'hit']])
  render(<GuitarSong auth={{configured: true, ready: true, user: {id: 'player'}}} />)
  fireEvent.click(screen.getByRole('button', {name: 'First song', exact: true}))
  fireEvent.click(await screen.findByRole('button', {name: 'Trouble spots', exact: true}))
  fireEvent.click(await screen.findByRole('button', {name: 'Bar 2 Needed work in 2 of 3 runs'}))
  expect(mocks.listGuitarPracticeVerdicts).toHaveBeenCalledWith(mocks.client, expect.objectContaining({
    songFingerprint: 'fingerprint', partId: '0', mode: 'trouble', easy: false,
  }))
  expect(mocks.scoreApi.playbackRange).toMatchObject({startTick: 960, endTick: 1920})
  expect(mocks.scoreApi.isLooping).toBe(true)
  expect(mocks.scoreApi.tickPosition).toBe(960)
  expect(mocks.revealBar).toHaveBeenCalledWith(1)
  expect(mocks.scoreApi.play).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', {name: 'Clear trouble spot loop'}))
  expect(mocks.scoreApi.playbackRange).toBeNull()
  expect(mocks.scoreApi.isLooping).toBe(false)
})

it.each([[-1, 39], [undefined, 40]])('opens a shared recording with its saved guitar shift of %s', async (guitar_shift, lowString) => {
  const score = importer.ScoreLoader.loadAlphaTex(String.raw`\title "Shared score"
\tuning (E4 B3 G3 D3 A2 E2)
0.6.4 1.6.4 |`)
  const attempt = { id: 'attempt', instrument: 'guitar', user_id: 'player', song_fingerprint: 'fingerprint', part_id: '0',
    recording_path: 'take.webm', created_at: '2026-11-22', guitar_shift }
  getSharedAttempt.mockResolvedValue(attempt)
  getSharedRecordingUrl.mockResolvedValue('https://example.test/take.webm')
  canViewAttempt.mockResolvedValue(false)
  findAttemptSongFile.mockResolvedValue({ bytes: new ArrayBuffer(1), filename: 'shared.alphatex' })
  loadGuitarNotation.mockResolvedValue({ title: score.title, score, format: 'alphatex' })
  const { container } = render(<GuitarSong sharedAttemptId="attempt" auth={{ ready: true, configured: true, user: { id: 'reviewer' } }} />)
  const heading = await screen.findByRole('heading', { name: 'Shared score' })
  expect(heading.dataset.lowString).toBe(String(lowString))
  await waitFor(() => expect(container.querySelector('audio')?.getAttribute('src')).toBe('https://example.test/take.webm'))
  expect(container.querySelector('audio').playbackRate).toBe(1)
  expect(screen.queryByRole('button', { name: 'Down a semitone' })).toBeNull()
})

it('resumes a named passage after reopening with different staff lines', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(1)})))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  HTMLDialogElement.prototype.showModal ??= function () { this.open = true }
  HTMLDialogElement.prototype.close ??= function () { this.open = false }
  const savedScore = parsed('Passage score')
  savedScore.score.masterBars = [{}, {}, {}]
  loadGuitarNotation.mockResolvedValue(savedScore)
  const bars = [{index: 0, start: 0, end: 960}, {index: 1, start: 960, end: 1920}, {index: 2, start: 1920, end: 2880}]
  mocks.timeline = {tempoMap: [], bars, entries: bars.map(({index, start}) => ({bar: index, index, tick: start}))}
  const emitter = {on: () => () => {}}
  mocks.realScore = true
  mocks.scoreApi = {
    playbackSpeed: 1, playbackRange: null, isLooping: false,
    boundsLookup: {staffSystems: [{bars}], findMasterBarByIndex: () => null},
    stop: vi.fn(), play: vi.fn(), scrollToCursor: vi.fn(), changeTrackMute: vi.fn(),
    clearPlaybackRangeHighlight: vi.fn(), changeTrackSolo: vi.fn(), renderScore: vi.fn(), destroy: vi.fn(),
    error: emitter, playerStateChanged: emitter, midiEventsPlayed: emitter, renderFinished: emitter, postRenderFinished: emitter,
  }
  saveSongTempo('fingerprint', 65)
  const first = render(<GuitarSong />)
  fireEvent.click(screen.getByRole('button', {name: 'First song', exact: true}))
  await screen.findByRole('combobox', {name: 'Practice section'})
  mocks.scoreApi.playbackRange = {startTick: 1000, endTick: 2150}
  mocks.scoreApi.isLooping = true
  fireEvent.click(screen.getByRole('button', {name: 'Save passage'}))
  expect(screen.getByText('Bars 2–3 · 65% · Loop on')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', {name: 'Passage name'}), {target: {value: 'Ending'}})
  fireEvent.click(screen.getByRole('button', {name: 'Save', exact: true}))
  expect(screen.getByRole('option', {name: 'Ending · Bars 2–3'}).selected).toBe(true)
  first.unmount()

  Object.assign(mocks.scoreApi, {
    playbackRange: null, isLooping: false, tickPosition: 0,
    boundsLookup: {staffSystems: [{bars: bars.slice(0, 2)}, {bars: bars.slice(2)}], findMasterBarByIndex: () => null},
  })
  saveSongTempo('fingerprint', 80)
  render(<GuitarSong />)
  fireEvent.click(screen.getByRole('button', {name: 'First song', exact: true}))
  const resume = await screen.findByRole('button', {name: 'Resume last passage'})
  expect(mocks.scoreApi.playbackSpeed).toBe(0.8)
  expect(mocks.scoreApi.playbackRange).toBeNull()
  fireEvent.click(resume)
  expect(screen.getByRole('option', {name: 'Ending · Bars 2–3'}).selected).toBe(true)
  expect(mocks.scoreApi.playbackRange).toMatchObject({startTick: 960, endTick: 2880})
  expect(mocks.scoreApi.tickPosition).toBe(960)
  expect(mocks.scoreApi.isLooping).toBe(true)
  expect(mocks.scoreApi.playbackSpeed).toBe(0.65)
  expect(mocks.scoreApi.play).not.toHaveBeenCalled()

  fireEvent.click(screen.getByText(/^Tempo 65%/))
  fireEvent.change(screen.getByRole('slider', {name: 'Tempo'}), {target: {value: '70'}})
  expect(mocks.scoreApi.playbackSpeed).toBe(0.7)
  expect(loadSongTempo('fingerprint')).toBe(80)
  fireEvent.click(screen.getByRole('button', {name: 'Update passage'}))
  fireEvent.change(screen.getByRole('combobox', {name: 'Practice section'}), {target: {value: ''}})
  expect(mocks.scoreApi.playbackSpeed).toBe(0.8)
  expect(mocks.scoreApi.playbackRange).toBeNull()
  fireEvent.click(screen.getByRole('button', {name: 'Resume last passage'}))
  expect(mocks.scoreApi.playbackSpeed).toBe(0.7)
})
