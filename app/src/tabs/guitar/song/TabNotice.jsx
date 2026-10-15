import { tabNotice } from '../notation/tabReport.js'

/**
 * Under the song's title: whether its tab was generated from the notes (and
 * what was changed to fit the guitar), and which parts have no tab.
 */
function TabNotice({ tab, hasTab }) {
  const { generated, changes, notationOnly } = tabNotice(tab)
  if (!generated && hasTab) return null
  return (
    <div className={`guitar-song__notice ${generated ? 'guitar-song__notice--info' : ''}`}>
      {generated && <p>Tab generated from the notes; the fingerings are a suggestion.</p>}
      {changes.length > 0 && (
        <ul>
          {changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {notationOnly.length > 0 && <p>No tab for {notationOnly.join(', ')}: shown as notation only.</p>}
      {!generated && !notationOnly.length && (
        <p>This file has no string/fret data for every note, so some notes show as standard notation only.</p>
      )}
    </div>
  )
}

export default TabNotice
