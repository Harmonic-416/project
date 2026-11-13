import JSZip from 'jszip'

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
const children = (node, name) => [...node.children].filter((child) => child.tagName === name)
const text = (node, name, fallback = '') => children(node, name)[0]?.textContent?.trim() ?? fallback
const unsupported = () => new Error('This MuseScore score uses notation that cannot be converted reliably here. In MuseScore, export it as MusicXML, then open that file.')
const lengths = { long: 7680, breve: 3840, whole: 1920, half: 960, quarter: 480, eighth: 240, '16th': 120, '32nd': 60, '64th': 30, '128th': 15 }
const pitches = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]]

/** Conservative native conversion: refuse unsupported rhythms and navigation
 * instead of opening an apparently valid score with missing or shifted notes. */
export function museScoreToXml(source) {
  if (source.length > 10 * 1024 * 1024) throw new Error('This MuseScore score is too large. Export a smaller part as MusicXML.')
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw unsupported()
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  if (doc.querySelector('parsererror') || doc.documentElement.tagName !== 'museScore') throw new Error('This is not a readable MuseScore score. Export it as MusicXML and try again.')
  const score = doc.querySelector('museScore > Score')
  if (!score || !/^[34]\./.test(doc.documentElement.getAttribute('version') ?? '')) throw unsupported()
  // These features change sounding time/pitch or require linked notation.
  if (score.querySelector('Tuplet, TupletNumber, grace, grace4, grace8, grace16, grace32, acciaccatura, appoggiatura, Tie, Spanner, RepeatMeasure, startRepeat, endRepeat, Jump, Marker, Ottava, Tremolo, TremoloSingleChord, TremoloTwoChord, Arpeggio, Glissando, Trill')) throw unsupported()
  if ([...score.querySelectorAll('transposeChromatic')].some((n) => Number(n.textContent) !== 0)) throw unsupported()
  const staves = children(score, 'Staff')
  if (!staves.length || staves.length !== 1) throw unsupported()
  const title = [...score.querySelectorAll('metaTag')].find((n) => n.getAttribute('name') === 'workTitle')?.textContent || 'MuseScore import'
  const parts = staves.map((staff, i) => {
    if (score.querySelector('Drum, useDrumset')) throw unsupported()
    const id = `P${i + 1}`
    const part = children(score, 'Part').find((p) => children(p, 'Staff').some((s) => s.getAttribute('id') === staff.getAttribute('id')))
    const name = part ? text(part, 'trackName', `Guitar ${i + 1}`) : `Guitar ${i + 1}`
    let beats = 4
    let beatType = 4
    let fifths = 0
    let noteCount = 0
    const measures = children(staff, 'Measure').map((measure, m) => {
      const voices = children(measure, 'voice')
      if (voices.length > 1) throw unsupported()
      const voice = voices[0] ?? measure
      const sig = children(voice, 'TimeSig')[0] ?? children(measure, 'TimeSig')[0]
      if (sig) { beats = Number(text(sig, 'sigN')); beatType = Number(text(sig, 'sigD')) }
      const key = children(voice, 'KeySig')[0]
      if (key) fifths = Number(text(key, 'accidental', '0'))
      if (![1, 2, 4, 8, 16, 32].includes(beatType) || !Number.isInteger(beats) || beats < 1 || beats > 32 || !Number.isInteger(fifths) || Math.abs(fifths) > 7) throw unsupported()
      const len = measure.getAttribute('len')
      const fraction = len?.split('/').map(Number)
      const total = fraction ? 1920 * fraction[0] / fraction[1] : beats * 1920 / beatType
      if (!Number.isFinite(total) || total <= 0 || !Number.isInteger(total)) throw unsupported()
      let used = 0
      let notes = ''
      for (const item of voice.children) {
        if (item.tagName === 'Tempo') {
          const bpm = Number(text(item, 'tempo')) * 60
          if (!Number.isFinite(bpm) || bpm <= 0) throw unsupported()
          notes += `<direction><sound tempo="${bpm}"/></direction>`
        }
        if (!['Chord', 'Rest'].includes(item.tagName)) {
          if (['tick', 'location', 'move', 'MeasureRepeat'].includes(item.tagName) || (used > 0 && ['TimeSig', 'KeySig'].includes(item.tagName))) throw unsupported()
          continue
        }
        const type = text(item, 'durationType')
        const dots = Number(text(item, 'dots', '0'))
        if (!Number.isInteger(dots) || dots < 0 || dots > 3) throw unsupported()
        const duration = type === 'measure' && item.tagName === 'Rest' ? total : lengths[type] * (2 - 2 ** -dots)
        if (!Number.isInteger(duration) || duration <= 0) throw unsupported()
        used += duration
        if (used > total) throw unsupported()
        if (item.tagName === 'Rest') notes += `<note><rest/><duration>${duration}</duration></note>`
        else {
          const chord = children(item, 'Note')
          if (!chord.length) throw unsupported()
          notes += chord.map((note, index) => {
            const midi = Number(text(note, 'pitch', '-1'))
            if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw unsupported()
            const [step, alter] = pitches[midi % 12]
            noteCount++
            if (noteCount > 50000) throw unsupported()
            return `<note>${index ? '<chord/>' : ''}<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${Math.floor(midi / 12) - 1}</octave></pitch><duration>${duration}</duration><type>${type}</type>${'<dot/>'.repeat(dots)}</note>`
          }).join('')
        }
      }
      if (used < total) notes += `<note><rest/><duration>${total - used}</duration></note>`
      return `<measure number="${m + 1}"${len ? ' implicit="yes"' : ''}><attributes><divisions>480</divisions><key><fifths>${fifths}</fifths></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${notes}</measure>`
    }).join('')
    if (!noteCount) throw unsupported()
    return { id, name, measures }
  })
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${escape(title)}</work-title></work><part-list>${parts.map((p) => `<score-part id="${p.id}"><part-name>${escape(p.name)}</part-name></score-part>`).join('')}</part-list>${parts.map((p) => `<part id="${p.id}">${p.measures}</part>`).join('')}</score-partwise>`
}

export async function loadMuseScore(bytes, compressed) {
  let source
  if (compressed) {
    const zip = await JSZip.loadAsync(bytes)
    const scores = Object.values(zip.files).filter((entry) => !entry.dir && /\.mscx$/i.test(entry.name) && !/(^|\/)excerpts\//i.test(entry.name))
    if (scores.length !== 1) throw unsupported()
    source = await scores[0].async('string')
  } else source = new TextDecoder().decode(bytes)
  return museScoreToXml(source)
}
