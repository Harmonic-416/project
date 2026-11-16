import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  effectiveRange,
  loadMeasuredRange,
  loadVoicePartId,
  saveMeasuredRange,
  saveVoicePartId,
  subscribeVoiceRange,
} from './voiceRange.js'

const read = () => ({ voiceId: loadVoicePartId(), measured: loadMeasuredRange() })

/**
 * The singer's voice part and measured range, shared by every component that
 * shows them (saved on the device; see voiceRange.js). `range` is what songs
 * are fitted to: the measured range when it is in use, else the voice part's.
 */
export function useVoiceRange() {
  const [state, setState] = useState(read)
  useEffect(() => subscribeVoiceRange(() => setState(read())), [])

  const chooseVoice = useCallback((id) => {
    saveVoicePartId(id)
    const measured = loadMeasuredRange()
    if (measured?.use) saveMeasuredRange({ ...measured, use: false })
  }, [])

  const useMyRange = useCallback(() => {
    const measured = loadMeasuredRange()
    if (measured) saveMeasuredRange({ ...measured, use: true })
  }, [])

  const saveCapture = useCallback((captured) => saveMeasuredRange({ ...captured, use: true }), [])

  const range = useMemo(
    () => effectiveRange({ partId: state.voiceId, measured: state.measured, useMeasured: state.measured?.use }),
    [state],
  )
  return { ...state, range, chooseVoice, useMyRange, saveCapture }
}
