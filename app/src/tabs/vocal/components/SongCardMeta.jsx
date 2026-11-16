import { Guitar, Mic, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchSongInfo, lengthLabel } from '../songs/songInfo.js'
import { bestStars } from '../feedback/progress.js'
import { useVocalProgress } from '../feedback/useProgress.js'

/**
 * The facts on a song card (a built-in song, or one of the person's own
 * files under "My songs"): solo or how many parts, length, the
 * tune's range and who can sing it as written, and the best stars sung so
 * far on this device. Read from the file once (songs/songInfo.js); until
 * then — or for a file it can't read — just the stars, if any.
 */
function SongCardMeta({ song, instrument = 'voice' }) {
  const [info, setInfo] = useState(null)
  const progress = useVocalProgress()
  const isVocal = instrument === 'voice'
  const SoloIcon = isVocal ? Mic : Guitar
  const stars = !isVocal ? null : bestStars(`song:${song.title}`, progress)

  useEffect(() => {
    let live = true
    fetchSongInfo(song).then((next) => {
      if (live) setInfo(next)
    })
    return () => {
      live = false
    }
  }, [song])

  const length = info && lengthLabel(info)
  return (
    <span className="song-meta">
      {info && (
        <span className="song-meta__facts">
          <span>{info.partCount > 1 ? <><Users size="1.1em" aria-hidden="true" /> {info.partCount} parts</> : <><SoloIcon size="1.1em" aria-hidden="true" /> Solo</>}</span>
          {length && <span>{length}</span>}
        </span>
      )}
      {isVocal && info?.range && (
        <span className="song-meta__range" title={`The tune goes from ${info.range.label}`}>
          {info.range.label}
          {info.fits.length > 0 ? ` · ${info.fits.join(', ')}` : ' · wide range'}
        </span>
      )}
      {stars !== null && (
        <span className="song-meta__stars" aria-label={`Best: ${stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < stars ? 'song-meta__star--on' : undefined} aria-hidden="true">
              ★
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

export default SongCardMeta
