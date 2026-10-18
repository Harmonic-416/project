import { useState } from 'react'
import './Fretboard.css'
import {
  FRETS,
  INLAYS,
  MATCH_MODES,
  TUNINGS,
  explainMove,
  gapRule,
  matchGroups,
  matchingPositions,
  noteName,
  pitchName,
  stringName,
  tuningById,
  tuningLabel,
} from './fretboard.js'
import { pluckNote } from './pluck.js'

/**
 * Guitar → Fretboard: the whole neck (open strings to fret 20) with every
 * spot's note. Pick a tuning and the notes follow; tap a note to hear it and
 * see everywhere else it can be played (the same pitch, or that note in any
 * octave), joined by lines, with why each one works. Laid out across the
 * screen (laptop) or down it (phone); it scrolls rather than shrinking.
 */

// Geometry, in SVG units (1:1 with pixels).
const LAYOUT = {
  horizontal: { cell: 56, gap: 36, lead: 44, side: 26, tail: 16, foot: 30 },
  vertical: { cell: 44, gap: 50, lead: 30, side: 26, tail: 16, foot: 36 },
}
const NOTE_R = 15

const STORE_KEY = 'harmonic.fretboard'

function loadPrefs() {
  try {
    return JSON.parse(globalThis.localStorage.getItem(STORE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function savePrefs(prefs) {
  try {
    globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(prefs))
  } catch {
    // storage blocked: the choice just isn't remembered
  }
}

const defaultOrientation = () => (globalThis.innerWidth && globalThis.innerWidth < 720 ? 'vertical' : 'horizontal')

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const spotLabel = (tuning, p) => (p.fret === 0 ? `open ${stringName(tuning, p.string)}` : `${ordinal(p.fret)} fret, ${stringName(tuning, p.string)}`)

function Fretboard() {
  const [prefs, setPrefs] = useState(() => ({ tuning: 'standard', mode: 'exact', orientation: defaultOrientation(), ...loadPrefs() }))
  const [selected, setSelected] = useState(null) // { string, fret }

  const update = (change) =>
    setPrefs((previous) => {
      const next = { ...previous, ...change }
      savePrefs(next)
      return next
    })

  const tuning = tuningById(prefs.tuning)
  const choice = selected ? { ...selected, midi: tuning.notes[selected.string] + selected.fret } : null
  const matches = choice ? matchingPositions(tuning, choice.midi, prefs.mode) : []
  const isMatch = (string, fret) => matches.some((m) => m.string === string && m.fret === fret)

  const choose = (string, fret) => {
    if (selected?.string === string && selected?.fret === fret) {
      setSelected(null)
      return
    }
    setSelected({ string, fret })
    pluckNote(tuning.notes[string] + fret).catch((err) => console.error(err))
  }

  return (
    <div className="fretboard">
      <div className="fretboard__controls">
        <label className="fretboard__control">
          <span className="fretboard__control-label">Tuning</span>
          <select className="fretboard__select" value={tuning.id} onChange={(event) => update({ tuning: event.target.value })}>
            {TUNINGS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({tuningLabel(t)})
              </option>
            ))}
          </select>
        </label>
        <Toggle
          label="Show"
          value={prefs.mode}
          options={MATCH_MODES.map((m) => ({ id: m.id, label: m.label, title: m.hint }))}
          onChange={(mode) => update({ mode })}
        />
        <Toggle
          label="Layout"
          value={prefs.orientation}
          options={[
            { id: 'horizontal', label: 'Across' },
            { id: 'vertical', label: 'Down' },
          ]}
          onChange={(orientation) => update({ orientation })}
        />
      </div>

      <p className="fretboard__tuning-note">
        <strong>{tuningLabel(tuning)}</strong> · {tuning.about} {gapRule(tuning)}
      </p>

      <div className={`fretboard__scroll fretboard__scroll--${prefs.orientation}`}>
        <Neck tuning={tuning} orientation={prefs.orientation} choice={choice} matches={matches} isMatch={isMatch} onChoose={choose} />
      </div>

      <Info tuning={tuning} choice={choice} matches={matches} mode={prefs.mode} onClear={() => setSelected(null)} />
    </div>
  )
}

function Toggle({ label, value, options, onChange }) {
  return (
    <div className="fretboard__control" role="group" aria-label={label}>
      <span className="fretboard__control-label">{label}</span>
      <div className="fretboard__toggle">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            title={option.title}
            className={`fretboard__toggle-button ${value === option.id ? 'is-on' : ''}`}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Neck({ tuning, orientation, choice, matches, isMatch, onChoose }) {
  const g = LAYOUT[orientation]
  const across = orientation === 'horizontal'
  // Along the neck: fret 0 (open) sits before the nut, then one cell per fret.
  const along = (fret) => g.lead + fret * g.cell + g.cell / 2
  const wire = (fret) => g.lead + (fret + 1) * g.cell // the wire after `fret` (fret 0's is the nut)
  // Across the strings: across the screen, the thinnest string is on top (like tab);
  // down the screen, the thickest is on the left (like a chord box).
  const side = (string) => g.side + (across ? 5 - string : string) * g.gap
  const xy = (string, fret) => (across ? { x: along(fret), y: side(string) } : { x: side(string), y: along(fret) })
  const length = wire(FRETS) + g.tail
  const breadth = g.side * 2 + 5 * g.gap
  // `foot` is the strip for fret numbers: under the neck, or beside it when it runs down.
  const width = across ? length : breadth + g.foot
  const height = across ? breadth + g.foot : length
  const neckStart = wire(0)
  const line = (a1, s1, a2, s2) => (across ? { x1: a1, y1: s1, x2: a2, y2: s2 } : { x1: s1, y1: a1, x2: s2, y2: a2 })
  const box = (a, s, la, ls) => (across ? { x: a, y: s, width: la, height: ls } : { x: s, y: a, width: ls, height: la })

  const frets = Array.from({ length: FRETS + 1 }, (_, f) => f)
  const strings = tuning.notes.map((_, s) => s)
  const groups = matchGroups(matches)

  return (
    <svg
      className="fretboard__neck"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label={`Guitar neck in ${tuning.name} tuning`}
    >
      {/* the wood */}
      <rect className="fb-wood" {...box(neckStart, side(across ? 5 : 0) - g.gap / 2, wire(FRETS) - neckStart, 5 * g.gap + g.gap)} rx="4" />

      {/* nut and fret wires */}
      {frets.map((f) => (
        <line key={`w${f}`} className={f === 0 ? 'fb-nut' : 'fb-wire'} {...line(wire(f), side(0), wire(f), side(5))} />
      ))}

      {/* strings, thicker for the low ones */}
      {strings.map((s) => (
        <line
          key={`s${s}`}
          className="fb-string"
          strokeWidth={2.4 - s * 0.32}
          {...line(neckStart - g.cell * 0.15, side(s), wire(FRETS), side(s))}
        />
      ))}

      {/* fret numbers */}
      {frets.map((f) => (
        <text
          key={`n${f}`}
          className={`fb-fret-number ${INLAYS.includes(f) ? 'is-marked' : ''}`}
          {...(across ? { x: along(f), y: breadth + g.foot - 10 } : { x: breadth + 4, y: along(f) + 4 })}
          textAnchor={across ? 'middle' : 'start'}
        >
          {f === 0 ? 'open' : f}
        </text>
      ))}

      {/* lines joining the same pitch */}
      {groups.map((group) =>
        group.positions.length > 1 ? (
          <polyline
            key={group.midi}
            className={`fb-link ${group.midi === choice?.midi ? 'is-chosen' : ''}`}
            points={group.positions.map((p) => `${xy(p.string, p.fret).x},${xy(p.string, p.fret).y}`).join(' ')}
          />
        ) : null,
      )}

      {/* the notes */}
      {strings.map((s) =>
        frets.map((f) => {
          const midi = tuning.notes[s] + f
          const { x, y } = xy(s, f)
          const chosen = choice?.string === s && choice?.fret === f
          const match = isMatch(s, f)
          const state = chosen ? 'is-chosen' : match ? 'is-match' : choice ? 'is-faded' : ''
          const name = noteName(midi, tuning.flats)
          return (
            <g
              key={`${s}-${f}`}
              className={`fb-note ${f === 0 ? 'is-open' : ''} ${state}`}
              transform={`translate(${x} ${y})`}
              role="button"
              tabIndex={0}
              aria-pressed={chosen}
              aria-label={`${pitchName(midi, tuning.flats)}, ${spotLabel(tuning, { string: s, fret: f })}`}
              onClick={() => onChoose(s, f)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onChoose(s, f)
                }
              }}
            >
              <circle r={NOTE_R} />
              <text textAnchor="middle" dy="0.35em">
                {name}
              </text>
            </g>
          )
        }),
      )}
    </svg>
  )
}

function Info({ tuning, choice, matches, mode, onClear }) {
  if (!choice) {
    return (
      <div className="fretboard__info">
        <p className="fretboard__hint">
          Tap any note to hear it and see everywhere else it can be played. Each fret is one semitone higher; at fret 12 the
          names start over, an octave up.
        </p>
      </div>
    )
  }

  const others = matches.filter((m) => !(m.string === choice.string && m.fret === choice.fret))
  const samePitch = others.filter((m) => m.midi === choice.midi)
  const otherOctaves = matchGroups(others.filter((m) => m.midi !== choice.midi))
  const name = pitchName(choice.midi, tuning.flats)

  return (
    <div className="fretboard__info" aria-live="polite">
      <div className="fretboard__info-head">
        <h3 className="fretboard__info-title">
          {name} <small>{spotLabel(tuning, choice)}</small>
        </h3>
        <button type="button" className="fretboard__clear" onClick={onClear}>
          Clear
        </button>
      </div>

      {samePitch.length === 0 ? (
        <p className="fretboard__hint">This exact pitch only exists here on the neck (frets 0–{FRETS}).</p>
      ) : (
        <>
          <p className="fretboard__hint">
            The same {name} also plays at {samePitch.length} other {samePitch.length === 1 ? 'spot' : 'spots'}:
          </p>
          <ul className="fretboard__moves">
            {samePitch.map((m) => (
              <li key={`${m.string}-${m.fret}`}>
                <strong>{spotLabel(tuning, m)}</strong>
                <span>{explainMove(tuning, choice, m)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {mode === 'octaves' && otherOctaves.length > 0 && (
        <>
          <p className="fretboard__hint">
            Every other {noteName(choice.midi, tuning.flats)}, by octave (same name, higher or lower):
          </p>
          <ul className="fretboard__octaves">
            {otherOctaves.map((group) => (
              <li key={group.midi}>
                <strong>{pitchName(group.midi, tuning.flats)}</strong>{' '}
                {group.positions.map((p) => spotLabel(tuning, p)).join(' · ')}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default Fretboard