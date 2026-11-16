import './SongLibraryPage.css'

export default function SongQuickAction({ kind, icon: Icon, label, description, onClick }) {
  return (
    <button type="button" className={`song-quick__item song-quick__item--${kind} v-card v-card--pressable`} onClick={onClick}>
      <span className="song-quick__icon" aria-hidden="true"><Icon size="1.1em" /></span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  )
}
