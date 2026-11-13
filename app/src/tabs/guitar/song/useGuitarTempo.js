import { useCallback, useEffect, useRef, useState } from 'react'
import { getTempoPref, setTempoPref } from '@backend/progress'
import { clampTempo, loadSongTempo, saveSongTempo } from '../../../audio/tempo/tempo.js'
import { readAccountTempo, writeAccountTempo } from './tempoPreferences.js'

/** Prefer the account value on open, but never override a slider moved while loading. */
export function useGuitarTempo({ fingerprint, catalogSongId, userId, client }) {
  const key = userId ? `${userId}:${fingerprint}` : fingerprint
  const [held, setHeld] = useState(() => ({ key, value: loadSongTempo(key), message: '' }))
  const revision = useRef(0)
  const currentKey = useRef(key)
  useEffect(() => { currentKey.current = key }, [key])
  const current = held.key === key ? held : { key, value: loadSongTempo(key), message: '' }
  useEffect(() => {
    if (!userId || !client || !fingerprint) return undefined
    let live = true
    const before = revision.current
    const request = catalogSongId ? getTempoPref(client, catalogSongId) : readAccountTempo(client, userId, fingerprint)
    request.then((value) => {
      if (!live || revision.current !== before) return
      const pct = value ?? loadSongTempo(key)
      saveSongTempo(key, pct)
      setHeld({ key, value: pct, message: value === null ? 'Tempo saved on this device. Change it to save to your account.' : 'Tempo restored from your account.' })
    }, () => {
      if (live && revision.current === before) setHeld((old) => ({ ...(old.key === key ? old : { key, value: loadSongTempo(key) }), message: 'Account tempo is unavailable. Changes stay on this device; use Retry sync when online.' }))
    })
    return () => { live = false }
  }, [key, fingerprint, catalogSongId, userId, client])

  const change = useCallback((value) => {
    const pct = clampTempo(value)
    revision.current += 1
    const changed = revision.current
    saveSongTempo(key, pct)
    setHeld({ key, value: pct, message: userId ? 'Saving tempo…' : 'Tempo saved on this device.' })
    if (!userId || !client) return
    const save = catalogSongId ? setTempoPref(client, catalogSongId, pct) : writeAccountTempo(client, userId, fingerprint, pct)
    save.then(() => {
      if (currentKey.current === key && revision.current === changed) setHeld({ key, value: pct, message: 'Tempo saved to your account.' })
    }, () => {
      if (currentKey.current === key && revision.current === changed) setHeld({ key, value: pct, message: 'Tempo saved on this device. Account sync failed; use Retry sync when online.' })
    })
  }, [key, userId, client, catalogSongId, fingerprint])
  return { tempo: current.value, change, message: current.message, retry: () => change(current.value) }
}
