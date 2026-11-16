import { Fraction, ZERO } from './fraction.js'

/**
 * MuseScore's score file (.mscx, the XML inside a .mscz) → a small score
 * model that writeMusicXml.js turns into partwise MusicXML. Handles the
 * MuseScore 3 and 4 layout (mscx 3.01 / 3.02 / 4.x):
 *
 *   <museScore version="4.20">
 *     <Score>
 *       <Part> <Staff/>… <Instrument>…</Instrument> </Part>…   parts own staves, in order
 *       <Staff id="1"> <VBox/> <Measure> <voice> Chord / Rest / … </voice>… </Measure>… </Staff>…
 *
 * Inside a <voice>, elements come in time order: ChordRests advance the
 * clock by their duration, <location> moves it, and everything else
 * (clefs, dynamics, tempo, spanner starts…) happens at the current time.
 * Spanners (slurs, hairpins, voltas) are written once at their start with
 * a relative <next><location> to their end, which is how they are resolved
 * here. Anything not listed below is skipped.
 *
 * Pitches come from <pitch> (MIDI number) spelled by <tpc> (tonal pitch
 * class, the line of fifths with C = 14), so a written E♭ stays E♭.
 */

export class MuseScoreFormatError extends Error {}

const WHOLE = {
  long: new Fraction(4),
  breve: new Fraction(2),
  whole: new Fraction(1),
  half: new Fraction(1, 2),
  quarter: new Fraction(1, 4),
  eighth: new Fraction(1, 8),
  '16th': new Fraction(1, 16),
  '32nd': new Fraction(1, 32),
  '64th': new Fraction(1, 64),
  '128th': new Fraction(1, 128),
  '256th': new Fraction(1, 256),
  '512th': new Fraction(1, 512),
  '1024th': new Fraction(1, 1024),
}

const GRACE_TAGS = ['acciaccatura', 'appoggiatura', 'grace4', 'grace8after', 'grace16', 'grace16after', 'grace32', 'grace32after']

// MuseScore clef type → MusicXML sign / line / octave change.
const CLEFS = {
  G: ['G', 2, 0],
  G8va: ['G', 2, 1],
  G15ma: ['G', 2, 2],
  G8vb: ['G', 2, -1],
  G15mb: ['G', 2, -2],
  G8vbo: ['G', 2, -1],
  G8vbp: ['G', 2, -1],
  G1: ['G', 1, 0],
  F: ['F', 4, 0],
  F8vb: ['F', 4, -1],
  F15mb: ['F', 4, -2],
  F8va: ['F', 4, 1],
  F15ma: ['F', 4, 2],
  F3: ['F', 3, 0],
  F5: ['F', 5, 0],
  F_B: ['F', 3, 0],
  F_C: ['F', 5, 0],
  F_F18C: ['F', 4, 0],
  F_19C: ['F', 4, 0],
  C1: ['C', 1, 0],
  C2: ['C', 2, 0],
  C3: ['C', 3, 0],
  C4: ['C', 4, 0],
  C5: ['C', 5, 0],
  C4_8vb: ['C', 4, -1],
  C_19C: ['C', 3, 0],
  PERC: ['percussion', 0, 0],
  PERC2: ['percussion', 0, 0],
  TAB: ['TAB', 5, 0],
  TAB4: ['TAB', 5, 0],
  TAB2: ['TAB', 5, 0],
}

const ACCIDENTALS = {
  accidentalSharp: 'sharp',
  accidentalFlat: 'flat',
  accidentalNatural: 'natural',
  accidentalDoubleSharp: 'double-sharp',
  accidentalSharpSharp: 'sharp-sharp',
  accidentalDoubleFlat: 'flat-flat',
  accidentalNaturalSharp: 'natural-sharp',
  accidentalNaturalFlat: 'natural-flat',
  accidentalTripleSharp: 'triple-sharp',
  accidentalTripleFlat: 'triple-flat',
  // MuseScore 2-era names still found in some 3.x files.
  sharp: 'sharp',
  flat: 'flat',
  natural: 'natural',
  'double sharp': 'double-sharp',
  'double flat': 'flat-flat',
}

// Checked in order, so "Staccatissimo" wins over "Staccato".
const ARTICULATIONS = [
  ['TenutoStaccato', 'detached-legato'],
  ['Staccatissimo', 'staccatissimo'],
  ['Staccato', 'staccato'],
  ['Tenuto', 'tenuto'],
  ['Marcato', 'strong-accent'],
  ['Accent', 'accent'],
]

// ---------- DOM helpers (direct children only: nested <Score>s are excerpts) ----------

const kids = (node, name) => (node ? [...node.children].filter((c) => c.tagName === name) : [])
const kid = (node, name) => (node ? [...node.children].find((c) => c.tagName === name) ?? null : null)
const textOf = (node, name, fallback = null) => {
  const found = kid(node, name)
  return found ? found.textContent.trim() : fallback
}
const numOf = (node, name, fallback = 0) => {
  const value = Number(textOf(node, name))
  return textOf(node, name) !== null && Number.isFinite(value) ? value : fallback
}

/** A MuseScore text property's plain text: formatting tags dropped, symbols named. */
export function plainText(node) {
  if (!node) return ''
  let out = ''
  for (const child of node.childNodes) {
    if (child.nodeType === 3 || child.nodeType === 4) out += child.nodeValue
    else if (child.nodeType === 1) {
      if (child.tagName === 'sym') out += SYMBOL_TEXT[child.textContent.trim()] ?? ''
      else out += plainText(child)
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

const SYMBOL_TEXT = {
  lyricsElision: '‿',
  segno: '𝄋',
  coda: '𝄌',
  metNoteWhole: '𝅝',
  metNoteHalfUp: '𝅗𝅥',
  metNoteQuarterUp: '♩',
  metNote8thUp: '♪',
  metAugmentationDot: '.',
  dynamicPiano: 'p',
  dynamicForte: 'f',
  dynamicMezzo: 'm',
}

// ---------- pitch ----------

/** MIDI pitch + tonal pitch class → MusicXML step / alter / octave. */
export function spellPitch(pitch, tpc) {
  if (!Number.isFinite(tpc)) return spellFromMidi(pitch)
  const step = 'FCGDAEB'[(((tpc - 13) % 7) + 7) % 7]
  const alter = Math.floor((tpc - 13) / 7)
  const octave = Math.floor((pitch - alter) / 12) - 1
  return { step, alter, octave }
}

const SHARP_SPELLING = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]]
function spellFromMidi(pitch) {
  const [step, alter] = SHARP_SPELLING[((pitch % 12) + 12) % 12]
  return { step, alter, octave: Math.floor(pitch / 12) - 1 }
}

// ---------- small parsers ----------

function parseLocation(node) {
  return {
    staves: numOf(node, 'staves', 0),
    voices: numOf(node, 'voices', 0),
    measures: numOf(node, 'measures', 0),
    fractions: Fraction.parse(textOf(node, 'fractions'), ZERO),
  }
}

function clefFromType(type) {
  const [sign, line, octave] = CLEFS[type] ?? CLEFS[String(type).replace(/[^A-Za-z0-9_]/g, '')] ?? CLEFS.G
  return { sign, line, octave, type }
}

function clefOfElement(el) {
  const type = textOf(el, 'concertClefType') ?? textOf(el, 'subtype') ?? textOf(el, 'transposingClefType') ?? 'G'
  return clefFromType(type)
}

function keyOfElement(el) {
  const fifths = numOf(el, 'concertKey', numOf(el, 'accidental', numOf(el, 'actualKey', numOf(el, 'key', 0))))
  const mode = textOf(el, 'mode')
  return { fifths: Math.max(-7, Math.min(7, Math.trunc(fifths))), mode: mode === 'minor' || mode === 'major' ? mode : null }
}

function chordRestDuration(el, measureLen) {
  const type = textOf(el, 'durationType')
  if (type === 'measure') {
    return { type: null, dots: 0, base: null, duration: Fraction.parse(textOf(el, 'duration'), measureLen), measureRest: true }
  }
  const base = WHOLE[type]
  if (!base) throw new MuseScoreFormatError(`unknown note length "${type}"`)
  const dots = Math.max(0, Math.min(4, numOf(el, 'dots', 0)))
  const duration = base.mul(new Fraction(2 ** (dots + 1) - 1, 2 ** dots))
  return { type, dots, base, duration, measureRest: false }
}

function parseTempo(el) {
  const quartersPerSecond = numOf(el, 'tempo', 0)
  if (!(quartersPerSecond > 0)) return null
  const bpm = Math.round(quartersPerSecond * 60 * 100) / 100
  const textNode = kid(el, 'text')
  const syms = textNode ? [...textNode.getElementsByTagName('sym')].map((s) => s.textContent.trim()) : []
  let beatUnit = null
  let dotted = false
  for (const sym of syms) {
    const unit = { metNoteWhole: 'whole', metNoteHalfUp: 'half', metNoteQuarterUp: 'quarter', metNote8thUp: 'eighth', metNote16thUp: '16th' }[sym]
    if (unit && !beatUnit) beatUnit = unit
    if (sym === 'metAugmentationDot' && beatUnit) dotted = true
  }
  let words = ''
  if (textNode) {
    for (const child of textNode.childNodes) if (child.nodeType === 3) words += child.nodeValue
  }
  words = words.replace(/=\s*\d+(?:[.,]\d+)?/g, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
  let perMinute = null
  if (beatUnit) {
    const quarters = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 }[beatUnit] * (dotted ? 1.5 : 1)
    perMinute = Math.round((bpm / quarters) * 100) / 100
  }
  return { bpm, beatUnit, dotted, perMinute, words, visible: textOf(el, 'visible') !== '0' }
}

// ---------- the score ----------

/**
 * Parse mscx text. Throws MuseScoreFormatError for files that can't be read
 * (not MuseScore, too old, no music).
 */
export function parseMscx(source) {
  if (typeof globalThis.DOMParser !== 'function') throw new MuseScoreFormatError('no XML parser available')
  const doc = new globalThis.DOMParser().parseFromString(source, 'application/xml')
  const root = doc.documentElement
  if (!root || root.tagName === 'parsererror' || doc.getElementsByTagName('parsererror').length) {
    throw new MuseScoreFormatError('the score XML is damaged')
  }
  if (root.tagName !== 'museScore') throw new MuseScoreFormatError('this is not a MuseScore score')
  const version = root.getAttribute('version') ?? ''
  const major = Number.parseInt(version, 10)
  if (!(major >= 3)) {
    throw new MuseScoreFormatError(
      `it was saved by MuseScore ${Number.isFinite(major) ? major : 'an old version'} (format ${version || 'unknown'}); open and re-save it in MuseScore 3 or 4`,
    )
  }
  const score = kid(root, 'Score')
  if (!score) throw new MuseScoreFormatError('the file has no score in it')

  const meta = {}
  for (const tag of kids(score, 'metaTag')) meta[tag.getAttribute('name')] = tag.textContent.trim()

  // Parts and the global index of each staff they own.
  const parts = []
  let staffCount = 0
  for (const partEl of kids(score, 'Part')) {
    const instrument = kid(partEl, 'Instrument')
    const staffEls = kids(partEl, 'Staff')
    const instrumentClefs = kids(instrument, 'clef')
    const staves = staffEls.map((staffEl, i) => {
      const group = kid(staffEl, 'StaffType')?.getAttribute('group')
      const fromInstrument =
        instrumentClefs.find((c) => Number(c.getAttribute('staff') ?? 1) === i + 1)?.textContent.trim() ?? null
      const fallback = textOf(staffEl, 'defaultClef') ?? fromInstrument ?? (group === 'percussion' ? 'PERC' : group === 'tablature' ? 'TAB' : 'G')
      return { index: staffCount++, fallbackClef: clefFromType(fallback) }
    })
    if (!staves.length) continue
    const name = plainText(kid(instrument, 'longName')) || textOf(partEl, 'trackName') || plainText(kid(instrument, 'trackName')) || `Part ${parts.length + 1}`
    parts.push({
      id: `P${parts.length + 1}`,
      name,
      abbreviation: plainText(kid(instrument, 'shortName')),
      staves,
    })
  }

  const staffEls = kids(score, 'Staff')
  if (!parts.length || !staffEls.length) throw new MuseScoreFormatError('the score has no staves')

  // Titles from the first staff's title frame, if the metadata has none.
  let frameTitle = ''
  for (const box of kids(staffEls[0], 'VBox')) {
    for (const t of kids(box, 'Text')) if (textOf(t, 'style') === 'title' || textOf(t, 'style') === 'Title') frameTitle ||= plainText(kid(t, 'text'))
  }

  const measureEls = staffEls.map((s) => kids(s, 'Measure'))
  const measureCount = measureEls[0].length
  if (!measureCount) throw new MuseScoreFormatError('the score has no measures')

  const measures = readMeasureMeta(measureEls[0])

  const allStaves = parts.flatMap((p) => p.staves)
  const spanners = []
  const staves = allStaves.map((staffInfo) => {
    const els = measureEls[staffInfo.index] ?? []
    const staffMeasures = []
    for (let m = 0; m < measureCount; m++) {
      const events = []
      const measureEl = els[m]
      if (measureEl) {
        const voiceEls = kids(measureEl, 'voice')
        const voices = voiceEls.length ? voiceEls : [measureEl]
        voices.forEach((voiceEl, voice) => {
          if (voice > 3) return
          parseVoice(voiceEl, { staff: staffInfo.index, voice, m, len: measures[m].len, events, spanners })
        })
      }
      staffMeasures.push(events)
    }
    // The opening clef: the first measure's header clef, else the staff's default.
    let initialClef = staffInfo.fallbackClef
    const first = staffMeasures[0]
    const headerAt = first.findIndex((e) => e.kind === 'clef' && e.offset.isZero())
    if (headerAt >= 0) initialClef = first.splice(headerAt, 1)[0].clef
    return { index: staffInfo.index, initialClef, measures: staffMeasures }
  })

  resolveSpanners(spanners, staves, measures)

  return {
    version,
    title: meta.workTitle || frameTitle || '',
    creators: { composer: meta.composer || '', lyricist: meta.lyricist || meta.poet || '', arranger: meta.arranger || '' },
    parts,
    measures,
    staves,
  }
}

/** Measure lengths, numbers, time signatures, repeats and barlines, from the first staff. */
function readMeasureMeta(measureEls) {
  let sig = { n: 4, d: 4 }
  let number = 1
  return measureEls.map((el, m) => {
    const voices = kids(el, 'voice')
    const items = voices.length ? voices.flatMap((v) => [...v.children]) : [...el.children]
    let time = null
    const timeEl = items.find((c) => c.tagName === 'TimeSig')
    if (timeEl) {
      const n = numOf(timeEl, 'sigN', sig.n)
      const d = numOf(timeEl, 'sigD', sig.d)
      if (n > 0 && d > 0) {
        sig = { n, d }
        const subtype = textOf(timeEl, 'subtype')
        time = { n, d, symbol: subtype === '1' ? 'common' : subtype === '2' ? 'cut' : null }
      }
    }
    if (m === 0 && !time) time = { ...sig, symbol: null }
    const nominal = new Fraction(sig.n, sig.d)
    const len = Fraction.parse(el.getAttribute('len'), nominal)
    const irregular = Boolean(kid(el, 'irregular')) && textOf(el, 'irregular') !== '0'
    const pickup = m === 0 && len.compare(nominal) < 0
    if (pickup) number = 0
    // An irregular measure is left out of MuseScore's count; here it keeps a
    // unique number and is marked implicit instead.
    const label = number++
    const endRepeat = kid(el, 'endRepeat')
    const barEl = [...items].reverse().find((c) => c.tagName === 'BarLine') ?? kid(el, 'BarLine')
    const directions = []
    for (const node of [...el.children, ...items]) {
      if (node.tagName === 'Marker') directions.push(markerDirection(node))
      if (node.tagName === 'Jump') directions.push(jumpDirection(node, len))
    }
    return {
      index: m,
      number: label,
      implicit: pickup || (irregular && m > 0),
      len,
      sig: { ...sig },
      time,
      startRepeat: Boolean(kid(el, 'startRepeat')),
      endRepeat: endRepeat ? Math.max(2, Number(endRepeat.textContent.trim()) || 2) : 0,
      barline: barEl ? textOf(barEl, 'subtype') : null,
      volta: { start: null, stop: null },
      directions: directions.filter(Boolean),
    }
  })
}

function markerDirection(el) {
  const label = textOf(el, 'label') ?? ''
  const type = textOf(el, 'subtype') ?? label
  const text = plainText(kid(el, 'text'))
  const kind = /^(var)?segno/i.test(type) ? 'segno' : /coda/i.test(type) && !/tocoda/i.test(type) ? 'coda' : /fine/i.test(type) ? 'fine' : /tocoda/i.test(type) ? 'tocoda' : null
  if (!kind) return text ? { offset: ZERO, words: text } : null
  return { offset: ZERO, marker: kind, label: label || kind, words: kind === 'fine' || kind === 'tocoda' ? text || (kind === 'fine' ? 'Fine' : 'To Coda') : '' }
}

function jumpDirection(el, len) {
  const jumpTo = textOf(el, 'jumpTo') ?? 'start'
  const text = plainText(kid(el, 'text')) || (jumpTo === 'start' ? 'D.C.' : 'D.S.')
  return { offset: len, words: text, jump: jumpTo === 'start' ? { dacapo: true } : { dalsegno: jumpTo } }
}

/** One <voice> of one staff in one measure: events in time order. */
function parseVoice(voiceEl, ctx) {
  const { staff, voice, m, len, events, spanners } = ctx
  let time = ZERO
  const tuplets = [] // open tuplets, outermost first: { actual, normal, events: [] }
  let pendingSpanners = [] // voice-level spanner starts waiting for their first chord
  let pendingFermata = null
  let lastChord = null

  const direction = (props, placement = 'above') => events.push({ kind: 'direction', staff, voice, offset: time, placement, ...props })

  for (const el of voiceEl.children) {
    switch (el.tagName) {
      case 'Chord':
      case 'Rest': {
        const ev = parseChordRest(el, { staff, voice, m, len, time, spanners, isRest: el.tagName === 'Rest' })
        if (tuplets.length) {
          ev.actual = tuplets.reduce((a, t) => a * t.actual, 1)
          ev.normal = tuplets.reduce((a, t) => a * t.normal, 1)
          if (!ev.grace) {
            ev.duration = ev.duration.mul(new Fraction(ev.normal, ev.actual))
            for (const [level, t] of tuplets.entries()) {
              if (!t.events.length) ev.tupletStarts.push({ level: level + 1, actual: t.actual, normal: t.normal, bracket: t.bracket })
              t.events.push(ev)
            }
          }
        }
        if (pendingFermata && !ev.grace) {
          ev.fermata = pendingFermata
          pendingFermata = null
        }
        if (!ev.isRest) {
          for (const s of pendingSpanners) s.startChord = ev
          pendingSpanners = []
          if (!ev.grace) lastChord = ev
        }
        events.push(ev)
        if (!ev.grace) time = time.add(ev.duration)
        break
      }
      case 'location':
        time = time.add(parseLocation(el).fractions)
        if (time.compare(ZERO) < 0) time = ZERO
        break
      case 'Tuplet': {
        const actual = numOf(el, 'actualNotes', 0)
        const normal = numOf(el, 'normalNotes', 0)
        if (!(actual > 0 && normal > 0)) throw new MuseScoreFormatError('a tuplet has no ratio')
        tuplets.push({ actual, normal, events: [], bracket: textOf(el, 'bracketType') !== '2' })
        break
      }
      case 'endTuplet': {
        const t = tuplets.pop()
        const lastEv = t?.events[t.events.length - 1]
        if (lastEv) lastEv.tupletStops.push(tuplets.length + 1)
        break
      }
      case 'Clef':
        events.push({ kind: 'clef', staff, voice, offset: time, clef: clefOfElement(el) })
        break
      case 'KeySig':
        events.push({ kind: 'key', staff, voice, offset: time, key: keyOfElement(el) })
        break
      case 'Tempo': {
        const tempo = parseTempo(el)
        if (tempo) direction({ tempo })
        break
      }
      case 'Dynamic': {
        const mark = textOf(el, 'subtype') ?? plainText(kid(el, 'text'))
        if (mark) direction({ dynamics: mark }, 'below')
        break
      }
      case 'StaffText':
      case 'SystemText':
      case 'Expression':
      case 'PlayTechAnnotation': {
        const words = plainText(kid(el, 'text'))
        if (words) direction({ words }, el.tagName === 'Expression' ? 'below' : 'above')
        break
      }
      case 'RehearsalMark': {
        const words = plainText(kid(el, 'text'))
        if (words) direction({ rehearsal: words })
        break
      }
      case 'Fermata':
        pendingFermata = /below/i.test(textOf(el, 'subtype') ?? '') ? 'inverted' : 'upright'
        break
      case 'Breath':
        if (lastChord) lastChord.breath = /caesura/i.test(textOf(el, 'symbol') ?? '') ? 'caesura' : 'breath-mark'
        break
      case 'Spanner': {
        const record = readSpanner(el, { staff, voice, m, offset: time })
        if (record) {
          spanners.push(record)
          if (record.type === 'Slur') pendingSpanners.push(record)
        }
        break
      }
      default:
        // Beam, Harmony, LayoutBreak, Image, Ornament, … — not needed to sing from.
        break
    }
  }
}

/** A spanner start (anything with a body and a <next><location>); end markers return null. */
function readSpanner(el, { staff, voice, m, offset }) {
  const type = el.getAttribute('type')
  const body = kid(el, type)
  const loc = kid(kid(el, 'next'), 'location')
  if (!body || !loc) return null
  const delta = parseLocation(loc)
  return {
    type,
    body,
    staff,
    voice,
    start: { m, offset },
    end: { m: m + delta.measures, offset: offset.add(delta.fractions), staff: staff + delta.staves, voice: voice + delta.voices },
    startChord: null,
  }
}

function parseChordRest(el, { staff, voice, m, len, time, spanners, isRest }) {
  const { type, dots, duration, measureRest } = chordRestDuration(el, len)
  const graceTag = GRACE_TAGS.find((tag) => kid(el, tag))
  const ev = {
    kind: isRest ? 'rest' : 'chord',
    isRest,
    staff,
    voice,
    offset: time,
    type,
    dots,
    duration: graceTag ? ZERO : duration,
    measureRest,
    grace: graceTag ? { slash: graceTag === 'acciaccatura', after: /after/.test(graceTag) } : null,
    visible: textOf(el, 'visible') !== '0',
    stem: textOf(el, 'StemDirection'),
    beamMode: textOf(el, 'BeamMode'),
    tupletStarts: [],
    tupletStops: [],
    actual: 1,
    normal: 1,
    notes: [],
    lyrics: [],
    articulations: [],
    slurStarts: [],
    slurStops: [],
    fermata: null,
    breath: null,
  }
  if (isRest) return ev

  for (const art of kids(el, 'Articulation')) {
    const subtype = textOf(art, 'subtype') ?? ''
    if (/fermata/i.test(subtype)) ev.fermata = /below/i.test(subtype) ? 'inverted' : 'upright'
    const found = ARTICULATIONS.find(([key]) => subtype.toLowerCase().includes(key.toLowerCase()))
    if (found && !ev.articulations.includes(found[1])) ev.articulations.push(found[1])
  }

  for (const lyricEl of kids(el, 'Lyrics')) {
    const text = plainText(kid(lyricEl, 'text'))
    if (!text) continue
    const melisma = Fraction.parse(textOf(lyricEl, 'ticks_f'), null)
    const ticks = numOf(lyricEl, 'ticks', 0)
    ev.lyrics.push({
      number: numOf(lyricEl, 'no', 0) + 1,
      syllabic: textOf(lyricEl, 'syllabic') ?? 'single',
      text,
      extend: Boolean((melisma && !melisma.isZero()) || ticks),
    })
  }

  for (const noteEl of kids(el, 'Note')) {
    const pitch = numOf(noteEl, 'pitch', NaN)
    if (!Number.isFinite(pitch)) continue
    const tpc = numOf(noteEl, 'tpc', NaN)
    const note = { midi: pitch, ...spellPitch(pitch, tpc), tieStart: false, tieStop: false, accidental: null }
    for (const sp of kids(noteEl, 'Spanner')) {
      if (sp.getAttribute('type') !== 'Tie') continue
      if (kid(sp, 'Tie')) note.tieStart = true
      if (kid(sp, 'prev')) note.tieStop = true
    }
    // MuseScore 2-style ties, kept by some converted files.
    if (kid(noteEl, 'Tie')) note.tieStart = true
    if (kid(noteEl, 'endSpanner')) note.tieStop = true
    const acc = kid(noteEl, 'Accidental')
    if (acc) {
      const name = ACCIDENTALS[textOf(acc, 'subtype')]
      if (name) note.accidental = { name, parentheses: textOf(acc, 'bracket') === '1' }
    }
    ev.notes.push(note)
  }
  if (!ev.notes.length) {
    // A chord with nothing playable in it reads as a rest.
    ev.kind = 'rest'
    ev.isRest = true
    return ev
  }

  // Chord-level spanners (MuseScore 4 writes slur starts inside the chord).
  for (const sp of kids(el, 'Spanner')) {
    const record = readSpanner(sp, { staff, voice, m, offset: time })
    if (record) {
      record.startChord = ev
      spanners.push(record)
    }
  }
  return ev
}

// ---------- spanners ----------

function chordAt(staves, { staff, voice, m, offset }) {
  const staffModel = staves.find((s) => s.index === staff)
  const events = staffModel?.measures[m]
  if (!events) return null
  const chords = events.filter((e) => e.kind === 'chord' && e.voice === voice && !e.grace)
  return chords.find((e) => e.offset.equals(offset)) ?? [...chords].reverse().find((e) => e.offset.compare(offset) <= 0) ?? null
}

function resolveSpanners(spanners, staves, measures) {
  const last = measures.length - 1
  const slurNumbers = new Map() // staff → [{ number, end }]
  const ordered = [...spanners].sort((a, b) => a.start.m - b.start.m || a.start.offset.compare(b.start.offset))
  for (const s of ordered) {
    if (s.type === 'Slur') {
      if (!s.startChord) continue
      const endChord = chordAt(staves, { staff: s.end.staff, voice: s.end.voice, m: Math.min(s.end.m, last), offset: s.end.offset })
      if (!endChord || endChord === s.startChord) continue
      const active = (slurNumbers.get(s.staff) ?? []).filter((a) => a.end.m > s.start.m || (a.end.m === s.start.m && a.end.offset.compare(s.start.offset) > 0))
      let number = 1
      while (active.some((a) => a.number === number)) number++
      if (number > 6) continue
      active.push({ number, end: s.end })
      slurNumbers.set(s.staff, active)
      s.startChord.slurStarts.push(number)
      endChord.slurStops.push(number)
    } else if (s.type === 'HairPin') {
      const subtype = numOf(s.body, 'subtype', 0)
      const crescendo = subtype === 0 || subtype === 2
      const startEvents = staves.find((st) => st.index === s.staff)?.measures[s.start.m]
      if (!startEvents) continue
      if (subtype >= 2) {
        startEvents.push({ kind: 'direction', staff: s.staff, voice: s.voice, offset: s.start.offset, placement: 'below', words: crescendo ? 'cresc.' : 'dim.' })
        continue
      }
      startEvents.push({ kind: 'direction', staff: s.staff, voice: s.voice, offset: s.start.offset, placement: 'below', wedge: crescendo ? 'crescendo' : 'diminuendo' })
      let endM = s.end.m
      let endOffset = s.end.offset
      if (endM > last) {
        endM = last
        endOffset = measures[last].len
      }
      const endEvents = staves.find((st) => st.index === s.staff)?.measures[endM]
      endEvents?.push({ kind: 'direction', staff: s.staff, voice: s.voice, offset: endOffset, placement: 'below', wedge: 'stop' })
    } else if (s.type === 'Volta') {
      const startMeasure = measures[s.start.m]
      if (!startMeasure || startMeasure.volta.start) continue
      const endingsText = textOf(s.body, 'endings') ?? ''
      const numbers = endingsText.split(/[,\s]+/).map(Number).filter((n) => n > 0)
      const text = plainText(kid(s.body, 'beginText')) || plainText(kid(s.body, 'text'))
      const lastM = Math.min(last, s.end.offset.isZero() ? s.end.m - 1 : s.end.m)
      const endHook = textOf(s.body, 'endHookType')
      startMeasure.volta.start = { numbers: numbers.length ? numbers : [1], text }
      measures[Math.max(s.start.m, lastM)].volta.stop = {
        numbers: numbers.length ? numbers : [1],
        type: endHook === '1' || endHook === '2' ? 'stop' : 'discontinue',
      }
    }
    // Ottava, pedal, trill and text lines change nothing a singer reads here.
  }
}
