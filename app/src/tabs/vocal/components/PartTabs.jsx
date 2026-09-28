import './PracticeModes.css'

/**
 * One tab per part in the score (named as in the uploaded file). Picking a
 * part shows and practises only that part (see AccompanimentToggle for
 * hearing the others). Only shown when there's more than one part.
 */
function PartTabs({ parts, selected, onSelect, disabled }) {
  if (parts.length < 2) return null
  return (
    <div className="part-tabs" role="tablist" aria-label="Part to practise">
      {parts.map((part) => (
        <button
          key={part.id}
          type="button"
          role="tab"
          className="part-tabs__tab"
          aria-selected={part.id === selected}
          disabled={disabled}
          onClick={() => onSelect(part.id)}
        >
          {part.name}
        </button>
      ))}
    </div>
  )
}

export default PartTabs
