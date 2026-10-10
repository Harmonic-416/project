import { magnitudeSpectrum } from './noteJudge.js'

/**
 * Turns the shared capture's frames and onsets (audio/capture/frameAssembler.js)
 * into listening windows for noteJudge.judgeWindow: after each note starts,
 * the frames that follow it (past the pick's click) plus the frame just
 * before it. Pure, so it runs in Node for tests.
 *
 * A note can start three ways, so there are three onset sources:
 *   - 'energy': the capture's onset — the level jumps (a strum, a pick in
 *     silence).
 *   - 'flux':   spectral flux — new frequencies appear even though the
 *     level barely moves (an arpeggio over strings still ringing).
 *   - 'pitch':  a new stable pitch with no attack at all (hammer-on,
 *     pull-off, slide), from the pitch tracker's reading passed with each
 *     frame as `midi`.
 * Onsets closer together than `mergeSeconds` are one note. A new onset
 * closes the open window early, so fast passages get one window per note.
 *
 * Positions are sample indices on the capture clock (a frame's position is
 * the sample it ends at).
 *
 *   onWindow({ onset, source, frames, spectra, pitches, before, beforeSpectrum,
 *              referenceSpectrum, levels, hop, floor, closedBy, closedAt })
 *
 * For telling a played note from noise and from a note still ringing
 * (waitListening.js): `referenceSpectrum` is the frame that ends
 * `referenceSeconds` before the onset, clear of a strum's first strings and
 * of a back-dated onset's timing; `levels` are the hop levels from the onset
 * to the window's end ([{ position, level }], each the RMS of the `hop`
 * samples ending at `position`); `floor` is the room's level so far (the
 * quietest median of five hops since reset, null until known); `closedBy`
 * is 'span' when the window ran its full length, 'onset' when a new onset at
 * `closedAt` cut it short.
 */
export function createWindowCollector({
  sampleRate,
  frameSize,
  onWindow,
  hop = 512,
  windowSeconds = 0.2,
  attackSeconds = 0.02,
  mergeSeconds = 0.08,
  referenceSeconds = 0.04,
  fluxOnsets = true,
  softOnsets = true,
  stableFrames = 3,
  softSemitones = 0.7,
}) {
  const attack = Math.round(attackSeconds * sampleRate)
  const span = Math.round(windowSeconds * sampleRate)
  const merge = Math.round(mergeSeconds * sampleRate)
  const referenceGap = Math.round(referenceSeconds * sampleRate)
  const recentPick = Math.round(0.1 * sampleRate) // the picked note settling is not a new note
  const flux = fluxOnsets ? createFluxDetector({ sampleRate, frameSize }) : null

  let open = null // { onset, source, frames, spectra, pitches, before, beforeSpectrum, referenceSpectrum, levels, lastAfter }
  let history = [] // recent frames: { samples, spectrum, position, midi, level }
  let mutedUntil = -Infinity
  let lastOnset = -Infinity
  let stable = null // the last stable pitch (MIDI)
  let candidate = null // { midi, start, count }
  let recentLevels = [] // the last five hop levels, for the room floor
  let floor = null

  const inWindow = (w, frame) => {
    const start = frame.position - frameSize
    return start >= w.onset + attack && start <= w.onset + attack + span
  }

  const close = (closedBy, closedAt) => {
    const w = open
    open = null
    if (!w) return
    if (!w.frames.length && w.lastAfter) {
      w.frames.push(w.lastAfter.samples)
      w.spectra.push(w.lastAfter.spectrum)
    }
    if (!w.frames.length) return
    const { onset, source, frames, spectra, pitches, before, beforeSpectrum, referenceSpectrum, levels } = w
    onWindow?.({ onset, source, frames, spectra, pitches, before, beforeSpectrum, referenceSpectrum, levels, hop, floor, closedBy, closedAt })
  }

  const begin = (position, source) => {
    if (position < mutedUntil || Math.abs(position - lastOnset) < merge) return
    close('onset', position)
    lastOnset = position
    let previous = null
    let reference = null
    for (const frame of history) {
      if (frame.position <= position) previous = frame
      if (frame.position <= position - referenceGap) reference = frame
    }
    open = {
      onset: position,
      source,
      frames: [],
      spectra: [],
      pitches: [],
      before: previous?.samples ?? null,
      beforeSpectrum: previous?.spectrum ?? null,
      referenceSpectrum: (reference ?? previous)?.spectrum ?? null,
      levels: [],
      lastAfter: null,
    }
    // A back-dated onset (flux, pitch) has already seen some of its frames.
    for (const frame of history) {
      if (frame.position > position) {
        open.lastAfter = frame
        if (frame.level !== undefined) open.levels.push({ position: frame.position, level: frame.level })
      }
      if (inWindow(open, frame)) collect(frame)
    }
  }

  const collect = (frame) => {
    open.frames.push(frame.samples)
    open.spectra.push(frame.spectrum)
    if (frame.midi !== null) open.pitches.push(frame.midi)
  }

  /** The room floor: the quietest median of five hop levels so far (digital silence ignored). */
  const trackFloor = (level) => {
    if (!(level > 1e-6)) return
    recentLevels.push(level)
    if (recentLevels.length > 5) recentLevels.shift()
    if (recentLevels.length < 5) return
    const median = [...recentLevels].sort((a, b) => a - b)[2]
    floor = floor === null ? median : Math.min(floor, median)
  }

  return {
    onset(position) {
      const before = lastOnset
      begin(position, 'energy')
      if (lastOnset !== before) {
        stable = null // the picked note's pitch becomes the new reference, not a soft onset
        candidate = null
      }
    },

    frame({ samples, position, level, midi = null }) {
      const frame = { samples, spectrum: magnitudeSpectrum(samples), position, midi, level }
      history.push(frame)
      if (history.length > 16) history.shift() // enough to reach back past a back-dated onset

      if (position < mutedUntil) return
      if (level !== undefined) trackFloor(level)

      if (flux) {
        const found = flux.push(frame.spectrum, position, level ?? 1)
        // Flux keeps rising while a picked note fills the frame: a peak within
        // a frame and a half of the last onset is that same note.
        if (found && found.peak - lastOnset > frameSize * 1.5) begin(found.onset, 'flux')
      }

      if (softOnsets && midi !== null) {
        if (candidate && Math.abs(midi - candidate.midi) < 0.5) candidate.count += 1
        else candidate = { midi, start: position - frameSize / 2, count: 1 }
        if (candidate.count === stableFrames) {
          const changed = stable !== null && Math.abs(candidate.midi - stable) >= softSemitones
          if (changed && candidate.start - lastOnset > recentPick) begin(candidate.start, 'pitch')
          stable = candidate.midi
        }
      } else if (midi === null) {
        candidate = null
      }

      if (!open) return
      if (position > open.onset) {
        open.lastAfter = frame
        // A back-dated onset may have taken this frame's level from the history already.
        if (level !== undefined && open.levels[open.levels.length - 1]?.position !== position) open.levels.push({ position, level })
      }
      if (inWindow(open, frame)) {
        if (!open.frames.includes(frame.samples)) collect(frame)
      } else if (position - frameSize > open.onset + attack + span) {
        close('span', position)
      }
    },

    /** Ignore everything until `position` (e.g. while the app plays a hint). */
    muteUntil(position) {
      mutedUntil = position
      open = null
      candidate = null
      stable = null
    },

    reset() {
      open = null
      history = []
      mutedUntil = -Infinity
      lastOnset = -Infinity
      stable = null
      candidate = null
      recentLevels = []
      floor = null
      flux?.reset()
    },
  }
}

/**
 * Spectral-flux onsets: the summed rise in log magnitude since `lag` frames
 * ago, over bins that are actually sounding. A note joining strings that
 * still ring adds new frequencies even when the overall level barely
 * moves. A peak above an adaptive threshold (the recent median × `ratio` +
 * `floor`) is an onset, back-dated to where the note entered the frame.
 * Pure; exported for tests.
 */
export function createFluxDetector({
  sampleRate,
  frameSize,
  lag = 2,
  ratio = 2,
  floor = 6,
  historyFrames = 24,
  refractorySeconds = 0.1,
  soundFloor = 0.005,
}) {
  const n = frameSize
  const lo = Math.max(1, Math.floor((60 * n) / sampleRate))
  const hi = Math.ceil((5000 * n) / sampleRate)
  const refractory = Math.round(refractorySeconds * sampleRate)
  // Flux peaks once the new note fills most of the frame; the note itself started earlier.
  const backdate = Math.round(frameSize * 0.6)

  let logs = []
  let fluxes = []
  let prev = null // { flux, position, threshold }
  let prevPrev = null
  let lastOnset = -Infinity

  const median = (values) => {
    if (!values.length) return 0
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[sorted.length >> 1]
  }

  return {
    /** One frame's magnitude spectrum (and RMS level); returns { onset, peak } positions, or null. */
    push(spectrum, position, level = 1) {
      let loudest = 0
      for (let bin = lo; bin <= hi; bin += 1) loudest = Math.max(loudest, spectrum[bin])
      const log = new Float32Array(hi - lo + 1)
      for (let bin = lo; bin <= hi; bin += 1) log[bin - lo] = Math.log1p(spectrum[bin])
      logs.push(log)
      if (logs.length > lag + 1) logs.shift()

      // Only bins that are sounding now count (not noise), compared with their
      // real earlier level — gating both frames would make quiet bins "rise"
      // whenever a loud note dies away.
      let value = 0
      if (logs.length > lag && level >= soundFloor) {
        const old = logs[0]
        const gate = loudest * 0.01
        for (let bin = lo; bin <= hi; bin += 1) {
          if (spectrum[bin] < gate) continue
          const rise = log[bin - lo] - old[bin - lo]
          if (rise > 0) value += rise
        }
      }
      const threshold = median(fluxes) * ratio + floor

      let onset = null
      const isPeak = prev && prev.flux > prev.threshold && prev.flux >= value && (!prevPrev || prev.flux > prevPrev.flux)
      if (isPeak && prev.position - lastOnset > refractory) {
        lastOnset = prev.position
        onset = { onset: Math.max(0, prev.position - backdate), peak: prev.position }
      }
      fluxes.push(value)
      if (fluxes.length > historyFrames) fluxes.shift()
      prevPrev = prev
      prev = { flux: value, position, threshold }
      return onset
    },

    reset() {
      logs = []
      fluxes = []
      prev = null
      prevPrev = null
      lastOnset = -Infinity
    },
  }
}
