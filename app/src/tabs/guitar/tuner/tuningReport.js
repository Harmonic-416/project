import { createContext, useContext } from 'react'

/**
 * How the practice modes tell the Guitar tab what they hear: the cents of
 * each single note judged right, for the out-of-tune check
 * (tuneSession.createTuningWatch). GuitarTab provides it; anywhere else it's
 * a no-op.
 */
export const TuningReportContext = createContext(() => {})

export const useTuningReport = () => useContext(TuningReportContext)
