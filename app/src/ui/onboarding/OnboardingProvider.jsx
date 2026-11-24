import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { acceptMicrophone, isSeen, markSeen, readOnboarding, resetTips, setWelcome } from './onboardingStore.js'
import { STUCK_MS, TIPS } from './tips.js'
import MicPrimer from './MicPrimer.jsx'
import Welcome from './Welcome.jsx'
import { OnboardingContext } from './useOnboarding.js'
import './Tip.css'

export default function OnboardingProvider({ children, initialWelcome, onDestination }) {
  const [record, setRecord] = useState(readOnboarding)
  const [welcome, showWelcome] = useState(initialWelcome)
  const [surfaces, setSurfaces] = useState([])
  const [manual, setManual] = useState(null)
  const [deferred, setDeferred] = useState([])
  const [busy, setBusy] = useState(0)
  const [stuckSurface, setStuckSurface] = useState(null)
  const [mic, setMic] = useState(null)
  const timer = useRef(null)
  const pending = useRef(null)
  const recordRef = useRef(record)
  const update = useCallback((apply) => {
    recordRef.current = apply(recordRef.current)
    setRecord(recordRef.current)
  }, [])

  const register = useCallback((id, anchor, instance) => {
    const surface = { id, anchor, instance }
    setSurfaces((current) => [...current, surface])
    return () => {
      setSurfaces((current) => current.filter((item) => item !== surface))
      setDeferred((current) => current.filter((item) => item !== surface))
      setManual((current) => current === surface ? null : current)
    }
  }, [])

  const enterBusy = useCallback(() => {
    setBusy((count) => count + 1)
    return () => setBusy((count) => count - 1)
  }, [])

  const markActive = useCallback(() => {
    clearTimeout(timer.current)
    setStuckSurface(null)
  }, [])

  const current = surfaces.findLast((surface) => surface.id !== 'guitar.song.section') ?? surfaces.at(-1)
  const stuck = Boolean(current && current === stuckSurface)
  useEffect(() => {
    if (!welcome && current && TIPS[current.id].mainAction) {
      timer.current = setTimeout(() => setStuckSurface(current), STUCK_MS)
    }
    return () => clearTimeout(timer.current)
  }, [current, welcome])

  const decideMic = useCallback((accepted) => {
    if (accepted) update(acceptMicrophone)
    const resolve = pending.current
    pending.current = null
    resolve?.(accepted)
    setMic(null)
  }, [update])

  const primeMicrophone = useCallback(async (signal) => {
    if (pending.current || signal?.aborted) return false
    let permission
    try {
      permission = (await navigator.permissions?.query({ name: 'microphone' }))?.state
    } catch {
      // Some browsers expose Permissions without supporting microphone queries.
    }
    if (pending.current || signal?.aborted) return false
    if (permission !== 'denied' && (permission === 'granted' || recordRef.current.micAccepted)) return true
    return new Promise((resolve) => {
      const cancel = () => decideMic(false)
      pending.current = (accepted) => {
        signal?.removeEventListener('abort', cancel)
        resolve(accepted)
      }
      signal?.addEventListener('abort', cancel, { once: true })
      const host = document.querySelector('dialog[open]') ?? document.getElementById('onboarding-tip-dock')
      setMic({ denied: permission === 'denied', host })
    })
  }, [decideMic])

  useEffect(() => () => pending.current?.(false), [])

  const tip = busy || welcome || mic ? null : manual ?? surfaces.find(
    (surface) => !isSeen(surface.id, record) && !deferred.includes(surface),
  )
  const closeTip = useCallback(() => {
    if (!tip) return
    update((state) => markSeen(tip.id, state))
    setManual(null)
  }, [tip, update])

  const finishWelcome = (destination, dismissed = false) => {
    update((state) => setWelcome(dismissed ? 'dismissed' : 'done', state))
    showWelcome(false)
    onDestination?.(destination)
  }

  const value = useMemo(() => ({
    register, enterBusy, primeMicrophone, markActive, current, tip, closeTip, stuck, replayingTip: Boolean(manual),
    showCurrentTip() {
      if (current) setManual(current)
    },
    replayWelcome() {
      showWelcome(true)
    },
    reset() {
      update(resetTips)
      setDeferred(surfaces)
      setManual(null)
    },
    guidancePaused: Boolean(busy || welcome || mic),
  }), [register, enterBusy, primeMicrophone, markActive, current, tip, closeTip, stuck, manual, update, surfaces, busy, welcome, mic])

  return (
    <OnboardingContext.Provider value={value}>
      {mic && createPortal(<MicPrimer denied={mic.denied} onDecision={decideMic} />, mic.host ?? document.body)}
      {children}
      {welcome && <Welcome onChoice={finishWelcome} onDismiss={() => finishWelcome('home', true)} />}
    </OnboardingContext.Provider>
  )
}
