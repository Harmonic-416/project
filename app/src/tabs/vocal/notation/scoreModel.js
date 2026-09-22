/**
 * Derive everything playback needs from the score OSMD actually rendered,
 * by walking its cursor iterator once (hidden) and resetting it.
 *
 * Because the cursor steps through exactly these timestamps later, audio,
 * cursor highlighting, and any pitch scoring share one clock — no matter
 * whether the file arrived as MIDI, MusicXML, or MXL. Repeats are expanded
 * (enrolled timestamps) and tempo changes are honoured per step.
 */

/** OSMD octave 1 == scientific octave 4 (middle C = C4 = MIDI 60). */
export function osmdPitchToMidi(pitch) {
  return (pitch.Octave + 4) * 12 + pitch.FundamentalNote + (pitch.AccidentalHalfTones ?? 0)
}

export function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12)
}

function secondsPerWholeNote(bpm) {
  return 240 / bpm
}

export function extractScoreModel(osmd) {
  const cursor = osmd.cursor
  const instruments = osmd.Sheet.Instruments
  const defaultBpm = osmd.Sheet.DefaultStartTempoInBpm || 120

  cursor.hide() // hidden cursors skip DOM work, so the walk is cheap
  cursor.reset()
  const iterator = cursor.iterator

  const cursorTimestamps = []
  const notes = []
  const byOsmdNote = new Map() // OSMD Note -> our note, for tie continuation
  let seconds = 0
  let prevTimestamp = null
  let prevBpm = defaultBpm

  while (!iterator.EndReached) {
    const timestamp = iterator.CurrentEnrolledTimestamp.RealValue
    const bpm = iterator.CurrentBpm > 0 ? iterator.CurrentBpm : defaultBpm
    if (prevTimestamp !== null) seconds += (timestamp - prevTimestamp) * secondsPerWholeNote(prevBpm)
    cursorTimestamps.push(seconds)

    for (const voiceEntry of iterator.CurrentVoiceEntries) {
      if (voiceEntry.IsGrace) continue
      const instrument = voiceEntry.ParentVoice?.Parent
      const partIndex = Math.max(0, instruments.indexOf(instrument))
      for (const note of voiceEntry.Notes) {
        if (note.isRest() || !note.Pitch) continue
        const duration = note.Length.RealValue * secondsPerWholeNote(bpm)
        const tie = note.NoteTie
        if (tie && tie.StartNote !== note) {
          const start = byOsmdNote.get(tie.StartNote)
          if (start) {
            start.duration = seconds + duration - start.time
            continue
          }
        }
        const midi = osmdPitchToMidi(note.Pitch)
        const entry = {
          partIndex,
          partName: instrument?.Name ?? `Part ${partIndex + 1}`,
          midi,
          frequency: midiToFrequency(midi),
          time: seconds,
          duration,
        }
        byOsmdNote.set(note, entry)
        notes.push(entry)
      }
    }

    prevTimestamp = timestamp
    prevBpm = bpm
    cursor.next()
  }
  cursor.reset()

  const duration = notes.reduce((max, n) => Math.max(max, n.time + n.duration), 0)
  const playbackSchedule = notes.map((n) => ({ time: n.time, pitches: [n.frequency], duration: n.duration }))

  return {
    notes,
    playbackSchedule,
    cursorTimestamps,
    duration,
    bpm: cursorTimestamps.length ? (iterator.CurrentBpm > 0 ? prevBpm : defaultBpm) : defaultBpm,
    partNames: instruments.map((i) => i.Name),
  }
}
