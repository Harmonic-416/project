import { useEffect, useRef, useState } from 'react'
import { readSavedPassages, writeSavedPassages } from './savedPassages.js'

const sectionKey = ({ first, last }) => `${first}:${last}`
const barLabel = ({ first, last }) => first === last ? `Bar ${first + 1}` : `Bars ${first + 1}–${last + 1}`

const savedKey = (id) => `saved:${id}`

/** How long a passage notice stays up before it gets out of the way. */
const MESSAGE_MS = 4000

export default function SongSectionPicker({ api, barCount, section, onChange, disabled, storageKey, getPassage }) {
  const [rendered, setRendered] = useState(null)
  const [saved, setSaved] = useState(() => {
    try {
      return readSavedPassages(storageKey, barCount)
    } catch {
      return { passages: [], lastId: null, error: 'Saved passages could not be loaded on this device.' }
    }
  })
  const [message, setMessage] = useState(null)
  const [messageSection, setMessageSection] = useState(section)
  const [draft, setDraft] = useState(null)
  const dialog = useRef(null)
  const passageDialog = useRef(null)
  const picker = useRef(null)
  const firstInput = useRef(null)
  const lastInput = useRef(null)

  // A notice answers the passage it was raised about: once the player picks or
  // drags a different one it no longer applies (most often "choose bars first",
  // which choosing bars has just done).
  if (section !== messageSection) {
    setMessageSection(section)
    setMessage(null)
  }

  // Otherwise it clears itself, so it never sits in the practice row for good.
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS)
    return () => clearTimeout(timer)
  }, [message])

  useEffect(() => {
    if (draft && !passageDialog.current.open) passageDialog.current.showModal()
  }, [draft])

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
  const selected = saved.passages.find(({ id }) => id === section?.passageId)
  const last = saved.passages.find(({ id }) => id === saved.lastId)
  const value = selected ? savedKey(selected.id) : section ? sectionKey(section) : ''
  const custom = section && !selected && !lines.some((line) => sectionKey(line) === value)

  function store(update) {
    try {
      const next = update(readSavedPassages(storageKey, barCount))
      writeSavedPassages(storageKey, next)
      setSaved(next)
      setMessage(null)
      return true
    } catch {
      setMessage('The passage change could not be saved on this device.')
      return false
    }
  }

  function selectPassage(passage) {
    onChange({ first: passage.first, last: passage.last, loop: passage.loop, tempo: passage.tempo, passageId: passage.id })
  }

  function openPassage(passage) {
    selectPassage(passage)
    store((data) => ({ ...data, lastId: passage.id }))
  }

  function change(event) {
    const next = event.target.value
    const passage = saved.passages.find(({ id }) => savedKey(id) === next)
    if (passage) {
      openPassage(passage)
      return
    }
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

  function editPassage(rename = false) {
    const passage = rename ? selected : getPassage()
    if (!passage) {
      setMessage('Choose bars in the picker or drag a passage on the tab first.')
      return
    }
    setMessage(null)
    setDraft({ ...passage, name: rename ? passage.name : '' })
  }

  function savePassage(event) {
    event.preventDefault()
    const name = draft.name.trim()
    if (!name) {
      setMessage('Enter a passage name.')
      return
    }
    const passage = { ...draft, name, id: draft.id ?? crypto.randomUUID() }
    if (!store((data) => ({
      passages: draft.id ? data.passages.map((item) => item.id === draft.id ? passage : item) : [...data.passages, passage],
      lastId: draft.id ? data.lastId : passage.id,
    }))) return
    passageDialog.current.close()
    if (!draft.id) selectPassage(passage)
  }

  function updatePassage() {
    const settings = getPassage()
    if (!settings) return
    store((data) => ({
      ...data,
      passages: data.passages.map((item) => item.id === selected.id ? { ...item, ...settings } : item),
      lastId: selected.id,
    }))
  }

  function removePassage() {
    if (!window.confirm(`Remove "${selected.name}" from saved passages?`)) return
    if (store((data) => ({
      passages: data.passages.filter(({ id }) => id !== selected.id),
      lastId: data.lastId === selected.id ? null : data.lastId,
    }))) onChange(null)
  }

  return (
    <div className="song-section">
      <label htmlFor="guitar-song-section">Practice section</label>
      <select ref={picker} id="guitar-song-section" value={value} onChange={change} disabled={disabled}>
        <option value="">Full song</option>
        {lines.map((line, index) => <option key={sectionKey(line)} value={sectionKey(line)}>Line {index + 1} · {barLabel(line)}</option>)}
        {custom && <option value={value}>{barLabel(section)}</option>}
        {saved.passages.map((passage) => (
          <option key={passage.id} value={savedKey(passage.id)}>{passage.name} · {barLabel(passage)}</option>
        ))}
        <option value="custom">Choose bars…</option>
      </select>
      {storageKey && (
        <div className="song-section__fields">
          {last && <button type="button" disabled={disabled} onClick={() => openPassage(last)}>Resume last passage</button>}
          <button type="button" disabled={disabled} onClick={() => editPassage()}>Save passage</button>
          {selected && <>
            <button type="button" disabled={disabled} onClick={() => editPassage(true)}>Rename passage</button>
            <button type="button" disabled={disabled} onClick={updatePassage}>Update passage</button>
            <button type="button" disabled={disabled} onClick={removePassage}>Remove passage</button>
          </>}
        </div>
      )}
      {(message || saved.error) && <span role="alert">{message ?? saved.error}</span>}
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
      <dialog ref={passageDialog} className="song-section__dialog" aria-labelledby="saved-guitar-passage-title" onClose={() => picker.current.focus()}>
        {draft && <form onSubmit={savePassage}>
          <h2 id="saved-guitar-passage-title">{draft.id ? 'Rename passage' : 'Save passage'}</h2>
          <p>{barLabel(draft)} · {draft.tempo}% · {draft.loop ? 'Loop on' : 'Loop off'}</p>
          <label>Passage name <input required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          {message && <p role="alert">{message}</p>}
          <div className="song-section__fields">
            <button type="submit">{draft.id ? 'Rename' : 'Save'}</button>
            <button type="button" onClick={() => passageDialog.current.close()}>Cancel</button>
          </div>
        </form>}
      </dialog>
    </div>
  )
}
