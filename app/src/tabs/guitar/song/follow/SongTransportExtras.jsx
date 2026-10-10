import { useEffect, useState } from 'react'
import { clearLoop, setPlayerOptions } from './playerControls.js'

/**
 * Looping the passage you drag across on the tab, with alphaTab's playback
 * range. Tempo, metronome and count-in are GuitarScore's (F37, F40). The
 * loop lives on the player, so it carries over between modes.
 */
function SongTransportExtras({ api, disabled }) {
  const [looping, setLooping] = useState(false)
  const [hasRange, setHasRange] = useState(false)

  useEffect(() => {
    if (!api) return undefined
    const sync = () => {
      setLooping(api.isLooping)
      setHasRange(Boolean(api.playbackRange))
    }
    sync()
    const offs = [api.playbackRangeChanged.on(sync), api.playerStateChanged.on(sync)]
    return () => offs.forEach((off) => off())
  }, [api])

  if (!api) return null

  const clearRange = () => {
    clearLoop(api)
    setHasRange(false)
    setLooping(false)
  }

  return (
    <div className="song-extras" role="group" aria-label="Loop">
      {hasRange ? (
        <>
          <label className="song-extras__item">
            <input
              type="checkbox"
              checked={looping}
              disabled={disabled}
              onChange={(event) => {
                setPlayerOptions(api, { isLooping: event.target.checked })
                setLooping(event.target.checked)
              }}
            />
            Loop selection
          </label>
          <button type="button" className="song-extras__link" onClick={clearRange} disabled={disabled}>
            Clear selection
          </button>
        </>
      ) : (
        <span className="song-extras__hint">Drag across the tab to pick a passage to loop.</span>
      )}
    </div>
  )
}

export default SongTransportExtras
