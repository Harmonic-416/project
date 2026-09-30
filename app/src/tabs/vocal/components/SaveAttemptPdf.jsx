import { useState } from 'react'
import './ShareAttempt.css'
import { downloadBlob, safeFilename } from '../notation/exportNotation.js'

/**
 * "Save PDF": the attempt on the full score (pitch dots, notes sung / missed)
 * as a printable A4 file. `getAttempt()` returns what share/attemptPdf.js
 * needs; the PDF code (jsPDF, svg2pdf) only downloads on the first click.
 */
function SaveAttemptPdf({ getAttempt, className = 'record-panel__link' }) {
  const [state, setState] = useState('idle') // idle | saving | error

  const save = async () => {
    setState('saving')
    try {
      const attempt = getAttempt()
      const { buildAttemptPdf } = await import('../share/attemptPdf.js')
      const blob = await buildAttemptPdf(attempt)
      downloadBlob(blob, `${safeFilename(attempt.title || 'attempt')}-attempt.pdf`)
      setState('idle')
    } catch (err) {
      console.error(err)
      setState('error')
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={state === 'saving'} onClick={save}>
        {state === 'saving' ? 'Making PDF…' : 'Save PDF'}
      </button>
      {state === 'error' && <span className="share-attempt__error">Couldn’t make the PDF.</span>}
    </>
  )
}

export default SaveAttemptPdf
