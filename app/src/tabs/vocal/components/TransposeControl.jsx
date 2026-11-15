import { useMemo, useState } from 'react'
import './PracticeModes.css'
import './TransposeControl.css'
import RangeCapture from './RangeCapture.jsx'
import { MAX_SHIFT, MIN_SHIFT, fitKey, noteLabel, signed, transposeLabel } from '../transpose/keyFit.js'
import {
  COMFORTABLE_RANGES,
  VOICE_OPTIONS,
  effectiveRange,
  loadMeasuredRange,
  loadVoicePartId,
  saveMeasuredRange,
  saveVoicePartId,
} from '../transpose/voiceRange.js'

const MINE = 'mine'

const span = (r) => `${noteLabel(r.low)}–${noteLabel(r.high)}`

/**
 * The song's key, under the score: −/+ a semitone, "Auto (fit my voice)"
 * and what it's transposed to. Auto fits the practised part's `notes`
 * (as written, keyFit's { midi, duration }) to the singer's range — their
 * voice part, or the range they've sung for us (RangeCapture) — and the
 * line under it says what it suggests and why. `keyInfo` is the written
 * key ({ fifths, mode }); `onChange(shift)` moves the whole song.
 */
export default function TransposeControl({ shift, onChange, notes, keyInfo, disabled }) {
  const [voiceId, setVoiceId] = useState(loadVoicePartId)
  const [measured, setMeasured] = useState(loadMeasuredRange)
  const [capturing, setCapturing] = useState(false)
  const range = effectiveRange({ partId: voiceId, measured, useMeasured: measured?.use })
  const low = range?.low
  const high = range?.high
  const fit = useMemo(
    () => (low != null && notes?.length ? fitKey(notes, { low, high }, keyInfo) : null),
    [notes, low, high, keyInfo],
  )

  const choose = (value) => {
    if (!value) return
    if (value === MINE) {
      const next = { ...measured, use: true }
      setMeasured(next)
      saveMeasuredRange(next)
      return
    }
    setVoiceId(value)
    saveVoicePartId(value)
    if (measured?.use) {
      const next = { ...measured, use: false }
      setMeasured(next)
      saveMeasuredRange(next)
    }
  }

  const saveCapture = (captured) => {
    const next = { ...captured, use: true }
    setMeasured(next)
    saveMeasuredRange(next)
    setCapturing(false)
  }

  let hint
  if (!range) hint = 'Choose your voice to find the key that fits it.'
  else if (!fit) hint = ''
  else if (fit.shift === shift) hint = shift ? `Fits your voice. ${fit.reason}` : fit.reason
  else hint = `Best for your voice: ${signed(fit.shift)} (${fit.key}). ${fit.reason}`

  return (
    <div className="practice-modes transpose">
      <div className="practice-modes__options" role="group" aria-label="Key">
        <button
          type="button"
          className="practice-modes__option"
          aria-label="Down a semitone"
          disabled={disabled || shift <= MIN_SHIFT}
          onClick={() => onChange(shift - 1)}
        >
          −
        </button>
        <output className="practice-modes__option transpose__now" aria-live="polite">
          {transposeLabel(shift, keyInfo)}
        </output>
        <button
          type="button"
          className="practice-modes__option"
          aria-label="Up a semitone"
          disabled={disabled || shift >= MAX_SHIFT}
          onClick={() => onChange(shift + 1)}
        >
          +
        </button>
      </div>
      <div className="practice-modes__options" role="group" aria-label="Fit the key">
        <button
          type="button"
          className="practice-modes__option"
          aria-pressed={Boolean(fit) && fit.shift === shift && shift !== 0}
          disabled={disabled || !fit || fit.shift === shift}
          onClick={() => onChange(fit.shift)}
        >
          Auto (fit my voice)
        </button>
        {shift !== 0 && (
          <button type="button" className="practice-modes__option" disabled={disabled} onClick={() => onChange(0)}>
            Original
          </button>
        )}
      </div>
      <label className="transpose__voice">
        <span className="practice-modes__hint">Your voice</span>
        <select value={measured?.use ? MINE : (voiceId ?? '')} onChange={(e) => choose(e.target.value)}>
          {!voiceId && !measured?.use && <option value="">Choose…</option>}
          {VOICE_OPTIONS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({span(COMFORTABLE_RANGES[v.id])})
            </option>
          ))}
          {measured && <option value={MINE}>My range ({span(measured)})</option>}
        </select>
      </label>
      {!capturing && (
        <div className="practice-modes__options">
          <button type="button" className="practice-modes__option" onClick={() => setCapturing(true)}>
            {measured ? 'Measure again' : 'Measure my range'}
          </button>
        </div>
      )}
      {capturing && <RangeCapture onSave={saveCapture} onCancel={() => setCapturing(false)} />}
      {hint && <p className="practice-modes__hint transpose__hint">{hint}</p>}
    </div>
  )
}
