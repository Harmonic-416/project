import { useEffect, useRef, useState } from 'react'

const sectionKey = ({ first, last }) => `${first}:${last}`
const barLabel = ({ first, last }) => first === last ? `Bar ${first + 1}` : `Bars ${first + 1}–${last + 1}`

export default function SongSectionPicker({ api, barCount, section, onChange, disabled }) {
  const [rendered, setRendered] = useState(null)
  const dialog = useRef(null)
  const picker = useRef(null)
  const firstInput = useRef(null)
  const lastInput = useRef(null)

  useEffect(() => {
    if (!api) return undefined
    const readLines = () => {
      const lines = (api.boundsLookup?.staffSystems ?? []).flatMap(({ bars }) =>
        bars.length ? [{ first: bars[0].index, last: bars.at(-1).index }] : [],
      )
      setRendered({ api, lines })
    }
    readLines()
    return api.postRenderFinished?.on(readLines)
  }, [api])

  const lines = rendered?.api === api ? rendered?.lines ?? [] : []
  const value = section ? sectionKey(section) : ''
  const custom = section && !lines.some((line) => sectionKey(line) === value)

  function change(event) {
    const next = event.target.value
    if (next === 'custom') {
      firstInput.current.value = section ? section.first + 1 : 1
      lastInput.current.value = section ? section.last + 1 : barCount
      lastInput.current.setCustomValidity('')
      dialog.current.showModal()
      return
    }
    onChange(lines.find((line) => sectionKey(line) === next) ?? null)
  }

  function apply(event) {
    event.preventDefault()
    const first = firstInput.current.valueAsNumber
    const last = lastInput.current.valueAsNumber
    if (last < first) {
      lastInput.current.setCustomValidity('Choose an ending bar at or after the starting bar.')
      lastInput.current.reportValidity()
      return
    }
    dialog.current.close()
    onChange({ first: first - 1, last: last - 1 })
  }

  return (
    <div className="song-section">
      <label htmlFor="guitar-song-section">Practice section</label>
      <select ref={picker} id="guitar-song-section" value={value} onChange={change} disabled={disabled}>
        <option value="">Full song</option>
        {lines.map((line, index) => <option key={sectionKey(line)} value={sectionKey(line)}>Line {index + 1} · {barLabel(line)}</option>)}
        {custom && <option value={value}>{barLabel(section)}</option>}
        <option value="custom">Choose bars…</option>
      </select>
      <dialog ref={dialog} className="song-section__dialog" aria-labelledby="song-section-title" onClose={() => picker.current.focus()}>
        <form onSubmit={apply} onInput={() => lastInput.current.setCustomValidity('')}>
          <h2 id="song-section-title">Choose bars to practise</h2>
          <div className="song-section__fields">
            <label>From bar <input ref={firstInput} type="number" min="1" max={barCount} required /></label>
            <label>Through bar <input ref={lastInput} type="number" min="1" max={barCount} required /></label>
          </div>
          <div className="song-section__fields">
            <button type="submit">Practise section</button>
            <button type="button" onClick={() => dialog.current.close()}>Cancel</button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
