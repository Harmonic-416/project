import { createContext, useCallback, useContext, useLayoutEffect, useRef } from 'react'
import { TIPS } from './tips.js'

export const OnboardingContext = createContext(null)

export function useOnboarding() {
  return useContext(OnboardingContext)
}

export function useTip(id, { anchorRef, ready = true, visit, instance } = {}) {
  const { register } = useOnboarding() ?? {}
  useLayoutEffect(() => {
    if (ready && TIPS[id] && anchorRef?.current) return register?.(id, anchorRef.current, instance)
  }, [id, anchorRef, ready, register, visit, instance])
}

export function useOnboardingBusy(busy) {
  const { enterBusy } = useOnboarding() ?? {}
  useLayoutEffect(() => {
    if (busy) return enterBusy?.()
  }, [busy, enterBusy])
}

export function usePracticeOnboarding() {
  const { markActive, primeMicrophone } = useOnboarding() ?? {}
  const lifetime = useRef(null)
  useLayoutEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  const startWithMicrophone = useCallback(async () => {
    markActive()
    const { signal } = lifetime.current
    return await primeMicrophone(signal) && !signal.aborted
  }, [markActive, primeMicrophone])
  return { markActive, startWithMicrophone: primeMicrophone ? startWithMicrophone : null }
}
