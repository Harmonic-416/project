import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import './SheetMusicViewer.css'

/**
 * Renders MusicXML via OSMD and exposes a small imperative cursor API
 * (next/reset/show/hide) so playback code can drive highlighting without
 * knowing anything about SVG rendering.
 */
const SheetMusicViewer = forwardRef(function SheetMusicViewer({ musicXml, onReady }, ref) {
  const containerRef = useRef(null)
  const osmdRef = useRef(null)

  useImperativeHandle(
    ref,
    () => ({
      next: () => osmdRef.current?.cursor?.next(),
      reset: () => osmdRef.current?.cursor?.reset(),
      show: () => osmdRef.current?.cursor?.show(),
      hide: () => osmdRef.current?.cursor?.hide(),
    }),
    [],
  )

  useEffect(() => {
    if (!containerRef.current || !musicXml) return undefined
    let cancelled = false

    async function render() {
      if (!osmdRef.current) {
        osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          drawTitle: false,
          followCursor: true,
        })
      }
      await osmdRef.current.load(musicXml)
      if (cancelled) return
      osmdRef.current.render()
      osmdRef.current.cursor.show()
      onReady?.()
    }

    render()
    return () => {
      cancelled = true
    }
  }, [musicXml, onReady])

  useEffect(
    () => () => {
      osmdRef.current?.clear()
      osmdRef.current = null
    },
    [],
  )

  return <div className="sheet-music-viewer" ref={containerRef} />
})

export default SheetMusicViewer
