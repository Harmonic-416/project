import './PitchMeter.css'
import { IN_TUNE_CENTS, METER_RANGE_CENTS, readPitch } from './pitchReading.js'

const BALL_TRAVEL_PCT = 40 // the ball stops short of the lane's ends so it never spills out
const BAND_PCT = (IN_TUNE_CENTS / METER_RANGE_CENTS) * BALL_TRAVEL_PCT // half the band, on the same scale

/**
 * The live "am I on it?" meter that sits beside the score while someone
 * sings: the note to sing, big; the sung pitch as a ball on a lane whose
 * middle band is the detector's in-tune tolerance; and which way to move,
 * in words. The ball glides (CSS transition) so frame-to-frame jitter in
 * the detector reads as a steady line rather than a flicker. Up is sharp on
 * the vertical lane; on a phone the meter lies under the score as a tuner
 * strip (flat left, sharp right) so the score keeps its width.
 */
function PitchMeter({ targetName, sungName, cents, verdict, hasTarget }) {
  const reading = readPitch({ sung: Boolean(sungName), hasTarget, cents, verdict })
  return (
    <div className={`pitch-meter pitch-meter--${reading.state}`}>
      <div className="pitch-meter__target">
        <span className="pitch-meter__label">{hasTarget ? 'Sing' : 'Rest'}</span>
        <strong className="pitch-meter__note">{hasTarget ? targetName : '—'}</strong>
      </div>
      <div className="pitch-meter__lane" aria-hidden="true">
        <span className="pitch-meter__edge pitch-meter__edge--top">sharp</span>
        <span className="pitch-meter__band" style={{ '--pm-band': BAND_PCT }} />
        <span className="pitch-meter__centre" />
        {sungName && hasTarget && (
          <span className="pitch-meter__ball" style={{ '--pm-pos': reading.offset * BALL_TRAVEL_PCT }}>
            {sungName}
          </span>
        )}
        <span className="pitch-meter__edge pitch-meter__edge--bottom">flat</span>
      </div>
      <p className="pitch-meter__words" aria-live="polite">
        {reading.arrow && (
          <span className="pitch-meter__arrow" aria-hidden="true">
            {reading.arrow}
          </span>
        )}
        {reading.words}
      </p>
    </div>
  )
}

export default PitchMeter
