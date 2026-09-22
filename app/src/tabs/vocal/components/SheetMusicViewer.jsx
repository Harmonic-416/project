import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import './SheetMusicViewer.css'
import { extractScoreModel } from '../notation/scoreModel.js'

/**
 * Renders notation via OSMD and exposes a small imperative cursor API
 * (next/reset/show/hide) so playback code can drive highlighting without
 * knowing anything about SVG rendering.
 *
 * `content` is a MusicXML string (see notation/loadNotation.js). Once
 * rendered, `onReady` receives the score model derived from what is on
 * screen (notation/scoreModel.js).
 */
const SheetMusicViewer = forwardRef(function SheetMusicViewer({ content, onReady, onError }, ref) {
  const containerRef = useRef(null)
  const osmdRef = useRef(null)

  useImperativeHandle(
    ref,
    () => ({
      next: () => osmdRef.current?.cursor?.next(),
      reset: () => osmdRef.current?.cursor?.reset(),
      show: () => osmdRef.current?.cursor?.show(),
      hide: () => osmdRef.current?.cursor?.hide(),
      getOsmd: () => osmdRef.current,
      getContainer: () => containerRef.current,
    }),
    [],
  )

  useEffect(() => {
    if (!containerRef.current || !content) return undefined
    let cancelled = false

    async function render() {
      if (!osmdRef.current) {
        osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
          autoResize: true,
          drawTitle: false,
          followCursor: true,
        })
      }
      const osmd = osmdRef.current
      await osmd.load(content)
      if (cancelled) return
      osmd.render()
      const model = extractScoreModel(osmd)
      osmd.cursor.show()
      onReady?.(model)
    }

    render().catch((err) => {
      if (cancelled) return
      console.error(err)
      onError?.(err)
    })
    return () => {
      cancelled = true
    }
  }, [content, onReady, onError])

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
