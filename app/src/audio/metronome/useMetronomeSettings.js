import { useCallback, useEffect, useState } from 'react'
import { loadMetronomeSettings, saveMetronomeSettings } from './settings.js'

/** [settings, update(patch)] — metronome preferences, remembered in this browser. */
export function useMetronomeSettings() {
  const [settings, setSettings] = useState(loadMetronomeSettings)

  useEffect(() => saveMetronomeSettings(settings), [settings])

  const update = useCallback((patch) => setSettings((current) => ({ ...current, ...patch })), [])

  return [settings, update]
}
