/**
 * A semantic digest of a partwise MusicXML score, for comparing two
 * encodings of the same music (e.g. the MuseScore importer's output against
 * MuseScore's own MusicXML export) without caring about byte layout:
 * per part, its name, its measure count, and every note as
 * { measure, staff, voice, onset, midi, duration, rest, lyrics } with times
 * in quarter notes. Needs a DOMParser (run the test under jsdom).
 */

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const kids = (node, name) => [...node.children].filter((c) => c.tagName === name)
const kid = (node, name) => kids(node, name)[0] ?? null
const num = (node, name, fallback = 0) => {
  const el = kid(node, name)
  return el ? Number(el.textContent.trim()) : fallback
}

export function summarizeMusicXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const root = doc.documentElement
  const names = new Map(
    [...root.getElementsByTagName('score-part')].map((sp) => [sp.getAttribute('id'), kid(sp, 'part-name')?.textContent.trim() ?? '']),
  )
  return kids(root, 'part').map((part) => {
    let divisions = 1
    const notes = []
    const measures = kids(part, 'measure')
    measures.forEach((measure, m) => {
      let cursor = 0
      let lastOnset = 0
      for (const el of measure.children) {
        if (el.tagName === 'attributes' && kid(el, 'divisions')) divisions = num(el, 'divisions', 1)
        if (el.tagName === 'backup') cursor -= num(el, 'duration') / divisions
        if (el.tagName === 'forward') cursor += num(el, 'duration') / divisions
        if (el.tagName !== 'note') continue
        if (kid(el, 'grace')) continue
        const duration = num(el, 'duration') / divisions
        const isChord = Boolean(kid(el, 'chord'))
        const onset = isChord ? lastOnset : cursor
        if (!isChord) {
          lastOnset = cursor
          cursor += duration
        }
        const pitch = kid(el, 'pitch')
        const midi = pitch ? (num(pitch, 'octave') + 1) * 12 + STEP[kid(pitch, 'step').textContent.trim()] + num(pitch, 'alter', 0) : null
        const lyrics = {}
        for (const lyric of kids(el, 'lyric')) lyrics[lyric.getAttribute('number') ?? '1'] = kid(lyric, 'text')?.textContent ?? ''
        notes.push({
          measure: m,
          staff: num(el, 'staff', 1),
          voice: kid(el, 'voice')?.textContent.trim() ?? '1',
          onset: Math.round(onset * 1000) / 1000,
          midi,
          spelling: pitch ? `${kid(pitch, 'step').textContent.trim()}${num(pitch, 'alter', 0)}` : null,
          duration: Math.round(duration * 1000) / 1000,
          rest: !pitch,
          tieStart: kids(el, 'tie').some((t) => t.getAttribute('type') === 'start'),
          lyrics,
        })
      }
    })
    return { id: part.getAttribute('id'), name: names.get(part.getAttribute('id')), measureCount: measures.length, notes }
  })
}

/** Notes in a stable order: by measure, staff, onset, voice, pitch. */
export function orderedNotes(notes) {
  return [...notes].sort(
    (a, b) => a.measure - b.measure || a.staff - b.staff || a.onset - b.onset || String(a.voice).localeCompare(String(b.voice)) || (a.midi ?? -1) - (b.midi ?? -1),
  )
}
