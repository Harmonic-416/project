import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { OSMD_UNIT_PX, STAFF_UNITS, measureCursorSteps, pitchToY, positionFor } from '../audio/useSheetOverlay.js'
import { extractScoreModel } from '../notation/scoreModel.js'
import { describeMissed, judgeNotes, sampleVerdict } from './sharedAttempt.js'

/**
 * "Save PDF" for a sung attempt: the whole score wrapped onto A4 pages, with
 * the pitch dots and the practised part's notes coloured sung / missed,
 * under a header with the song, singer and score.
 *
 * The on-screen viewer is one long line, so the score is rendered again in
 * a hidden page-width container. Its timing and note list come from the same
 * MusicXML, so the stored samples land exactly where they did on screen.
 * Colours are written as SVG attributes (not CSS classes) so the PDF keeps
 * them; the SVG goes into the PDF as vectors (svg2pdf.js).
 */

export const COLORS = {
  'in-tune': '#2e9e5b',
  close: '#e0a100',
  octave: '#5b7cf2',
  wrong: '#cf4b36',
  rest: '#9a9a9a',
  sung: '#2e9e5b',
  missed: '#cf4b36',
  otherPart: '#b3b0a9',
}

const RENDER_WIDTH_PX = 1000
const PAGE = { width: 595.28, height: 841.89, margin: 40 } // A4 in pt

/** Paint every shape of a rendered note (VexFlow <g>) one colour. */
function paintNote(group, color) {
  if (!group) return
  for (const el of group.querySelectorAll('path, rect, ellipse, circle, polygon')) {
    el.setAttribute('fill', color)
    el.setAttribute('stroke', color)
    el.style.fill = color
    el.style.stroke = color
  }
}

/** svg2pdf skips text sized in pt (OSMD's tempo marks); px draws. */
function normalizeFontSizes(svg) {
  for (const text of svg.querySelectorAll('text[font-size$="pt"]')) {
    const pt = Number.parseFloat(text.getAttribute('font-size'))
    if (Number.isFinite(pt)) text.setAttribute('font-size', `${(pt * 4) / 3}px`)
  }
}

const SHAPES = 'path, rect, text, circle, ellipse, line, polyline, polygon, image'

/**
 * Measure every shape once (getBBox needs layout) and tag it, so each page
 * can drop what isn't on it without measuring again. Returns [top, bottom]
 * per tag, in SVG units.
 */
function measureShapes(svg) {
  const extents = []
  svg.querySelectorAll(SHAPES).forEach((el) => {
    let box
    try {
      box = el.getBBox()
    } catch {
      return
    }
    el.setAttribute('data-pdf', String(extents.length))
    extents.push([box.y, box.y + box.height])
  })
  return extents
}

/** Drop every measured shape wholly outside [top, bottom], and the groups left empty. */
function pruneOutside(svg, extents, top, bottom) {
  for (const el of svg.querySelectorAll('[data-pdf]')) {
    const [y0, y1] = extents[Number(el.getAttribute('data-pdf'))]
    if (y0 > bottom || y1 < top) el.remove()
  }
  for (const g of [...svg.querySelectorAll('g')].reverse()) if (!g.firstElementChild) g.remove()
}

/** Container (client) coordinates → the SVG's own user units. */
function toSvgPoint(svg, clientX, clientY) {
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  return point.matrixTransform(svg.getScreenCTM().inverse())
}

/**
 * Where each system (line of music) sits in the SVG, in SVG units: cuts
 * halfway between consecutive systems, so lyrics and dots that stick out
 * above or below a staff stay with it.
 */
function systemBands(osmd, svg) {
  const unit = OSMD_UNIT_PX * (osmd.Zoom || 1)
  const tops = []
  for (const page of osmd.GraphicSheet.MusicPages) {
    for (const system of page.MusicSystems) tops.push(system.PositionAndShape.AbsolutePosition.y * unit)
  }
  const height = svg.viewBox?.baseVal?.height || Number.parseFloat(svg.getAttribute('height')) || svg.getBBox().height
  if (!tops.length) return [{ top: 0, bottom: height }]
  return tops.map((top, i) => ({
    top: i === 0 ? 0 : (tops[i - 1] + top) / 2,
    bottom: i === tops.length - 1 ? height : (top + tops[i + 1]) / 2,
  }))
}

/** Render `content`, draw the attempt on it; returns { svg, width, bands, judged, cleanup }. */
async function renderAttempt(content, samples) {
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-${RENDER_WIDTH_PX * 3}px;top:0;width:${RENDER_WIDTH_PX}px;background:#fff;`
  document.body.appendChild(host)
  const cleanup = () => host.remove()
  try {
    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: false,
      backend: 'svg',
      drawTitle: false,
      drawComposer: false,
      drawLyricist: false,
      drawCredits: false,
      drawPartNames: true,
      followCursor: false,
    })
    await osmd.load(content)
    osmd.Zoom = 1
    osmd.render()

    const sourceNotes = []
    const model = extractScoreModel(osmd, { sourceNotes })
    const svg = host.querySelector('svg')
    if (!svg) throw new Error('Could not draw the score for the PDF.')

    // The practised part is part 0 of the rendered score (see VocalTab).
    const noteGroup = (i) => osmd.EngravingRules.GNote(sourceNotes[i])?.getSVGGElement?.()
    model.notes.forEach((note, i) => {
      if (note.partIndex !== 0) paintNote(noteGroup(i), COLORS.otherPart)
    })
    const judged = judgeNotes(samples, model.notes)
    judged.hit.forEach((note) => paintNote(noteGroup(note.index), COLORS.sung))
    judged.missed.forEach((note) => paintNote(noteGroup(note.index), COLORS.missed))

    // Pitch dots, placed exactly like the on-screen overlay, then moved into the SVG.
    const steps = measureCursorSteps(osmd, host, model.cursorTimestamps)
    osmd.cursor.hide()
    const hostRect = host.getBoundingClientRect()
    const staffPx = STAFF_UNITS * OSMD_UNIT_PX * (osmd.Zoom || 1)
    const melody = model.notes.filter((n) => n.partIndex === 0).sort((a, b) => a.time - b.time)
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    for (const sample of samples) {
      const position = positionFor(steps, sample.time)
      if (!position) continue
      const y = pitchToY(sample.midi, position.top, staffPx)
      const p = toSvgPoint(svg, hostRect.left + position.x, hostRect.top + y)
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      dot.setAttribute('cx', p.x.toFixed(1))
      dot.setAttribute('cy', p.y.toFixed(1))
      dot.setAttribute('r', '2.6')
      dot.setAttribute('fill', COLORS[sampleVerdict(sample, melody)])
      dot.setAttribute('fill-opacity', '0.85')
      layer.appendChild(dot)
    }
    svg.appendChild(layer)
    normalizeFontSizes(svg)
    const extents = measureShapes(svg)

    const width = svg.viewBox?.baseVal?.width || Number.parseFloat(svg.getAttribute('width')) || RENDER_WIDTH_PX
    const measureOf = (note) => sourceNotes[note.index]?.SourceMeasure?.MeasureNumber ?? null
    return { svg, width, bands: systemBands(osmd, svg), extents, judged, measureOf, host, cleanup }
  } catch (err) {
    cleanup()
    throw err
  }
}

/**
 * Build the PDF and return it as a Blob.
 * `attempt` = { title, partName, singer, date, accuracy, samples: [{ time, midi }], content (MusicXML as shown) }.
 */
export async function buildAttemptPdf(attempt) {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  const rendered = await renderAttempt(attempt.content, attempt.samples)
  try {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
    const { margin } = PAGE
    const contentWidth = PAGE.width - margin * 2
    let y = margin

    // Header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor('#24242c')
    doc.text(attempt.title || 'Attempt', margin, y + 14)
    y += 26
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor('#6c6a72')
    const who = [attempt.partName, attempt.singer ? `sung by ${attempt.singer}` : null, attempt.date]
      .filter(Boolean)
      .join('  ·  ')
    if (who) {
      doc.text(who, margin, y + 8)
      y += 18
    }
    const { hit, missed, total } = rendered.judged
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor('#24242c')
    const summary = `${Math.round(attempt.accuracy)}% in tune${total ? `  ·  ${hit.length} of ${total} notes sung${missed.length ? `  ·  ${missed.length} missed` : ''}` : ''}`
    doc.text(summary, margin, y + 10)
    y += 22

    // Legend
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    let x = margin
    const legend = [
      ['in-tune', 'in tune', 'dot'],
      ['close', 'close', 'dot'],
      ['octave', 'other octave', 'dot'],
      ['wrong', 'wrong note', 'dot'],
      ['sung', 'note sung', 'box'],
      ['missed', 'note missed', 'box'],
    ]
    for (const [key, label, shape] of legend) {
      doc.setFillColor(COLORS[key])
      if (shape === 'dot') doc.circle(x + 3.5, y + 4, 3, 'F')
      else doc.rect(x + 0.5, y + 1, 6, 6, 'F')
      doc.setTextColor('#6c6a72')
      doc.text(label, x + 10, y + 7)
      x += 14 + doc.getTextWidth(label) + 12
    }
    y += 18

    if (missed.length) {
      doc.setFontSize(9.5)
      doc.setTextColor('#8f2c1c')
      const lines = doc.splitTextToSize(`Missed: ${describeMissed(missed, rendered.measureOf)}`, contentWidth)
      doc.text(lines, margin, y + 8)
      y += lines.length * 12 + 6
    }
    y += 6

    // Score, a whole number of systems per page.
    const scale = contentWidth / rendered.width
    const pageBottom = PAGE.height - margin
    const { svg, bands } = rendered
    let i = 0
    while (i < bands.length) {
      let bottom = bands[i].top
      let j = i
      while (j < bands.length && y + (bands[j].bottom - bands[i].top) * scale <= pageBottom) {
        bottom = bands[j].bottom
        j += 1
      }
      if (j === i) {
        // Not even one system fits here: new page (or, on an empty page, draw it shrunk).
        if (y > margin + 1) {
          doc.addPage()
          y = margin
          continue
        }
        j = i + 1
        bottom = bands[i].bottom
      }
      const top = bands[i].top
      const sliceHeight = bottom - top
      const height = Math.min(sliceHeight * scale, pageBottom - y)
      const width = height === sliceHeight * scale ? contentWidth : (height / sliceHeight) * rendered.width
      const slice = svg.cloneNode(true)
      slice.setAttribute('viewBox', `0 ${top} ${rendered.width} ${sliceHeight}`)
      slice.setAttribute('width', String(rendered.width))
      slice.setAttribute('height', String(sliceHeight))
      pruneOutside(slice, rendered.extents, top, bottom)
      rendered.host.appendChild(slice)
      doc.saveGraphicsState()
      doc.rect(margin, y, contentWidth, height, null)
      doc.clip()
      doc.discardPath()
      await doc.svg(slice, { x: margin, y, width, height })
      doc.restoreGraphicsState()
      slice.remove()
      y += height
      i = j
      if (i < bands.length) {
        doc.addPage()
        y = margin
      }
    }

    doc.setProperties({ title: `${attempt.title} — attempt`, creator: 'Harmonic' })
    return doc.output('blob')
  } finally {
    rendered.cleanup()
  }
}
