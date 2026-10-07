/**
 * Printed tempo marks at the chosen tempo (F37). OSMD draws a metronome
 * mark through VexFlow as <g class="vf-stavetempo">…<g class="vf-bpm"><text>
 * " = 120"</text>. The sheet model can't simply be changed — its tempo also
 * drives the iterator the score model is timed from — so the drawn text is
 * rescaled after every render instead. The written text is kept on the
 * element, so applying a factor again never compounds.
 */

const MARK_TEXT = 'g.vf-stavetempo g.vf-bpm text'
const WRITTEN_ATTR = 'data-written'
const NUMBER = /(=\s*)(\d+(?:\.\d+)?)/

/** " = 120" at 0.75 → " = 90". Text without a number comes back unchanged. */
export function scaleTempoText(text, factor) {
  return text.replace(NUMBER, (_, prefix, bpm) => `${prefix}${Math.round(Number(bpm) * factor)}`)
}

export function scaleTempoMarks(container, factor) {
  if (!container) return
  for (const text of container.querySelectorAll(MARK_TEXT)) {
    const written = text.getAttribute(WRITTEN_ATTR) ?? text.textContent
    text.setAttribute(WRITTEN_ATTR, written)
    text.textContent = scaleTempoText(written, factor)
  }
}
