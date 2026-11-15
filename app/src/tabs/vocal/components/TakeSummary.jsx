import './TakeSummary.css'

/**
 * The card after a take (practice/takeSummary.js): stars and a headline from
 * the share of notes that landed — the same verdicts the staff shows — then
 * the few spots worth going back to, in words, each with a button that plays
 * the song from that bar. Pitch accuracy and loudness are secondary lines.
 * `children` holds the take's actions (download, clear, share).
 */
function TakeSummary({ summary, accuracy, octaveAccuracy, dynamicsLine, onHear, children }) {
  const tier = summary.ratio >= 0.9 ? 'great' : summary.ratio >= 0.6 ? 'good' : 'start'
  const octaveHelps = octaveAccuracy !== null && octaveAccuracy > accuracy + 0.5
  return (
    <div className={`take-summary take-summary--${tier}`} role="status">
      <div className="take-summary__head">
        <span className="take-summary__stars" aria-label={`${summary.stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < summary.stars ? 'take-summary__star--on' : undefined} aria-hidden="true">
              ★
            </span>
          ))}
        </span>
        <div>
          <strong className="take-summary__title">{summary.title}</strong>
          <p className="take-summary__score">
            <b>
              {summary.hit} of {summary.total} notes
            </b>{' '}
            · in tune {Math.round(accuracy)}% of the time
            {octaveHelps && ` (${Math.round(octaveAccuracy)}% counting other octaves)`}
          </p>
        </div>
      </div>

      {summary.spots.length > 0 && (
        <div className="take-summary__spots">
          <h4>Go back to</h4>
          <ul>
            {summary.spots.map((spot) => (
              <li key={`${spot.time}-${spot.label}`} className={`take-summary__spot take-summary__spot--${spot.direction}`}>
                <span className="take-summary__glyph" aria-hidden="true">
                  {spot.glyph}
                </span>
                <span>
                  <b>{spot.label}</b> · {spot.words}
                </span>
                <button type="button" className="take-summary__hear" onClick={() => onHear(spot.time)}>
                  ▶ Hear it
                </button>
              </li>
            ))}
          </ul>
          {summary.moreSpots > 0 && (
            <p className="take-summary__more">
              and {summary.moreSpots} more spot{summary.moreSpots === 1 ? '' : 's'} marked in red on the score
            </p>
          )}
        </div>
      )}

      {dynamicsLine && <p className="take-summary__note">{dynamicsLine}</p>}
      <div className="take-summary__actions">{children}</div>
    </div>
  )
}

export default TakeSummary
