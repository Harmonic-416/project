import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteDraft, draftsAvailable, listDrafts } from './drafts.js'

/** Storage failures retain the list and expose recovery instead of looking empty. */
export function useDraftLibrary(active) {
  const available = draftsAvailable()
  const [drafts, setDrafts] = useState([])
  const [phase, setPhase] = useState('loading')
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [revision, setRevision] = useState(0)
  const pendingDelete = useRef(null)
  const generation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (!active) return undefined
    let live = true
    if (!available) return undefined
    const version = ++generation.current
    listDrafts().then((list) => {
      if (live && version === generation.current) { setDrafts(list); setPhase('ready'); setError(null) }
    }, () => {
      if (live && version === generation.current) { setPhase('error'); setError({ kind: 'list', message: 'Your transcription drafts could not be read. Retry, or open the original score file below.' }) }
    })
    return () => { live = false }
  }, [active, revision, available])

  const remove = useCallback(async (draft) => {
    if (pendingDelete.current) return
    generation.current += 1
    pendingDelete.current = draft.id
    setDeleting(draft.id)
    setError(null)
    try {
      await deleteDraft(draft.id)
      if (mounted.current) { setDrafts((list) => list.filter((item) => item.id !== draft.id)); setPhase('ready') }
    } catch {
      if (mounted.current) { setPhase('ready'); setError({ kind: 'delete', draft, message: `The draft "${draft.title}" could not be deleted. It is still in your library. Try again.` }) }
    } finally {
      pendingDelete.current = null
      if (mounted.current) setDeleting(null)
    }
  }, [])
  const retry = () => {
    if (error?.kind === 'delete') return remove(error.draft)
    setPhase('loading')
    setError(null)
    setRevision((value) => value + 1)
  }
  return { drafts, phase: available ? phase : 'unavailable', error: error?.message ?? null, deleting, remove, retry }
}
