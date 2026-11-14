import { useEffect, useMemo, useRef } from 'react'

/** Only the latest selection may replace the score, errors or saved metadata. */
export function useLatestSongRequest() {
  const generation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; generation.current += 1 }
  }, [])
  return useMemo(() => ({
    begin() {
      const id = ++generation.current
      return {
        isCurrent: () => mounted.current && generation.current === id,
        cancel: () => { if (generation.current === id) generation.current += 1 },
      }
    },
    cancel() { generation.current += 1 },
  }), [])
}
