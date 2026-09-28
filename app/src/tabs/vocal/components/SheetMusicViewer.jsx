import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import './SheetMusicViewer.css'
import { extractScoreModel } from '../notation/scoreModel.js'

/**
 * Renders notation via OSMD and exposes a small imperative cursor API
 * (next/reset/show/hide/goToStep) plus note marking (markNote/clearMarks)
 * so playback and practice code can drive highlighting without knowing
 * anything about SVG rendering.
 *
 * The score is drawn as one long staff line inside a fixed-height strip
 * that scrolls sideways: every cursor move (playback, wait mode, seeking)
 * slides the strip so the cursor sits a third of the way in, leaving the
 * upcoming bars in view. OSMD's own followCursor is off because it uses
 * scrollIntoView, which also scrolls the page itself on phones.
 *
 * `content` is a MusicXML string (see notation/loadNotation.js). Once
 * rendered, `onReady` receives the score model derived from what is on
 * screen (notation/scoreModel.js).
 */
// Where the cursor sits in the strip, as a fraction of its width.
const CURSOR_ANCHOR = 0.3

/** Smaller notation on phone-width screens so a few bars fit across. */
function zoomFor(width) {
  if (width < 480) return 0.8
  if (width < 768) return 0.9
  return 1
}

const SheetMusicViewer = forwardRef(function SheetMusicViewer({ content, onReady, onError }, ref) {
  const containerRef = useRef(null)
  const osmdRef = useRef(null)
  const stepRef = useRef(0) // cursor position, so goToStep only walks forward when it can
  const sourceNotesRef = useRef([]) // OSMD Notes, aligned with scoreModel.notes
  const marksRef = useRef(new Map()) // SVG element -> Set of classes we added

  useImperativeHandle(
    ref,
    () => {
      /** Slide the strip so the cursor sits at CURSOR_ANCHOR (or back to the start when it's hidden). */
      const follow = (smooth = true) => {
        const container = containerRef.current
        const element = osmdRef.current?.cursor?.cursorElement
        if (!container) return
        // A hidden cursor has no offsetParent (and offsetLeft 0).
        const left = element?.offsetParent ? element.offsetLeft - container.clientWidth * CURSOR_ANCHOR : 0
        container.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' })
      }
      const step = () => {
        osmdRef.current?.cursor?.next()
        stepRef.current += 1
      }
      const next = () => {
        step()
        follow()
      }
      const reset = () => {
        osmdRef.current?.cursor?.reset()
        stepRef.current = 0
        follow()
      }
      const clearMarks = (className) => {
        for (const [element, classes] of marksRef.current) {
          for (const c of classes) {
            if (className && c !== className) continue
            element.classList.remove(c)
            classes.delete(c)
          }
          if (!classes.size) marksRef.current.delete(element)
        }
      }
      return {
        next,
        reset,
        /** Put the cursor on `step` (an index into scoreModel.cursorTimestamps). */
        goToStep: (target) => {
          if (target < stepRef.current) {
            osmdRef.current?.cursor?.reset()
            stepRef.current = 0
          }
          while (stepRef.current < target && !osmdRef.current?.cursor?.iterator?.EndReached) step()
          follow()
        },
        /** Add/remove a CSS class on the rendered note for scoreModel.notes[noteIndex]. */
        markNote: (noteIndex, className, on = true) => {
          const note = sourceNotesRef.current[noteIndex]
          const element = note && osmdRef.current?.EngravingRules?.GNote(note)?.getSVGGElement?.()
          if (!element) return
          element.classList.toggle(className, on)
          const classes = marksRef.current.get(element) ?? new Set()
          if (on) classes.add(className)
          else classes.delete(className)
          if (classes.size) marksRef.current.set(element, classes)
          else marksRef.current.delete(element)
        },
        /** Remove one mark class everywhere, or every mark when called without one. */
        clearMarks,
        show: () => {
          osmdRef.current?.cursor?.show()
          follow(false)
        },
        hide: () => osmdRef.current?.cursor?.hide(),
        getOsmd: () => osmdRef.current,
        getContainer: () => containerRef.current,
      }
    },
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
          drawComposer: false,
          drawLyricist: false,
          drawCredits: false,
          renderSingleHorizontalStaffline: true,
          followCursor: false,
        })
        // The strip is one line tall; OSMD's default page margins would leave a band of blank space.
        osmdRef.current.EngravingRules.PageTopMargin = 1
        osmdRef.current.EngravingRules.PageBottomMargin = 1
      }
      const osmd = osmdRef.current
      await osmd.load(content)
      if (cancelled) return
      osmd.Zoom = zoomFor(containerRef.current.clientWidth)
      osmd.render()
      containerRef.current.scrollLeft = 0
      const sourceNotes = []
      const model = extractScoreModel(osmd, { sourceNotes })
      sourceNotesRef.current = sourceNotes
      marksRef.current.clear()
      stepRef.current = 0
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
