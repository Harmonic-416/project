import { Fraction, ZERO, lcm } from './fraction.js'

/**
 * The score model from parseMscx.js → a partwise MusicXML 4.0 string, the
 * same shape the rest of the Vocal tab gets from MusicXML / MXL / MIDI.
 *
 * Each part's measure is written staff by staff, voice by voice, with
 * <backup> between them and <forward> over gaps; MuseScore voice v on the
 * part's staff s becomes MusicXML voice 4·s + v + 1. Pitches are written at
 * concert pitch. Beams are filled in by beat, since MuseScore only stores
 * the ones a user changed.
 */

const DYNAMICS = new Set([
  'p', 'pp', 'ppp', 'pppp', 'ppppp', 'pppppp', 'f', 'ff', 'fff', 'ffff', 'fffff', 'ffffff',
  'mp', 'mf', 'sf', 'sfp', 'sfpp', 'fp', 'rf', 'rfz', 'sfz', 'sffz', 'fz', 'n', 'pf', 'sfzp',
])

const BEAMABLE = new Set(['eighth', '16th', '32nd', '64th', '128th', '256th', '512th', '1024th'])

const BARLINE_STYLES = {
  end: 'light-heavy',
  double: 'light-light',
  'reverse-end': 'heavy-light',
  heavy: 'heavy',
  'double-heavy': 'heavy-heavy',
  dashed: 'dashed',
  dotted: 'dotted',
  // MuseScore 3 numeric subtypes.
  2: 'light-light',
  4: 'light-heavy',
}

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
}

const RANK = { clef: 0, key: 0, direction: 1, rest: 2, chord: 2 }

/** Smallest divisions per quarter note that make every duration and offset whole. */
function divisionsFor(model) {
  let den = 1
  const take = (f) => {
    const quarters = f.mul(new Fraction(4))
    den = lcm(den, quarters.den)
  }
  for (const m of model.measures) take(m.len)
  for (const staff of model.staves) {
    for (const events of staff.measures) {
      for (const e of events) {
        take(e.offset)
        if (e.duration) take(e.duration)
      }
    }
  }
  return den
}

function beatGroup(sig) {
  if (sig.d === 8 && sig.n % 3 === 0 && sig.n > 3) return new Fraction(3, 8)
  if (sig.d >= 8) return new Fraction(sig.n, sig.d)
  return new Fraction(1, sig.d)
}

/** Fill in `beam` ("begin" | "continue" | "end") on one voice's chords. */
function assignBeams(stream, sig) {
  const group = beatGroup(sig)
  const groupOf = (offset) => Math.floor(offset.valueOf() / group.valueOf() + 1e-9)
  let run = []
  const flush = () => {
    if (run.length > 1) run.forEach((ev, i) => (ev.beam = i === 0 ? 'begin' : i === run.length - 1 ? 'end' : 'continue'))
    run = []
  }
  for (const ev of stream) {
    if (ev.kind !== 'chord' && ev.kind !== 'rest') continue
    if (ev.grace) continue
    const beamable = ev.kind === 'chord' && BEAMABLE.has(ev.type) && ev.beamMode !== 'no'
    if (!beamable) {
      flush()
      continue
    }
    const prev = run[run.length - 1]
    const end = ev.offset.add(ev.duration)
    const sameGroup = prev && groupOf(ev.offset) === groupOf(prev.offset) && groupOf(end.sub(new Fraction(1, 4096))) === groupOf(ev.offset)
    const forcedStart = ev.beamMode === 'begin' || ev.beamMode === 'begin32' || ev.beamMode === 'begin64'
    const forcedJoin = ev.beamMode === 'mid' || ev.beamMode === 'end'
    const tupletBoundary = prev && (ev.tupletStarts.length > 0 || prev.tupletStops.length > 0)
    if (prev && !forcedStart && (forcedJoin || (sameGroup && !tupletBoundary)) && prev.offset.add(prev.duration).equals(ev.offset)) {
      run.push(ev)
    } else {
      flush()
      run.push(ev)
    }
  }
  flush()
}

function pitchXml({ step, alter, octave }) {
  return `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>`
}

function noteXml(ev, note, index, { div, voiceNumber, staffNumber, stem }) {
  const isFirst = index === 0
  const parts = []
  parts.push(ev.visible ? '<note>' : '<note print-object="no">')
  if (ev.grace) parts.push(ev.grace.slash ? '<grace slash="yes"/>' : '<grace/>')
  if (!isFirst) parts.push('<chord/>')
  if (ev.kind === 'rest') parts.push(ev.measureRest ? '<rest measure="yes"/>' : '<rest/>')
  else parts.push(pitchXml(note))
  if (!ev.grace) parts.push(`<duration>${durationUnits(ev.duration, div)}</duration>`)
  if (note?.tieStop) parts.push('<tie type="stop"/>')
  if (note?.tieStart) parts.push('<tie type="start"/>')
  parts.push(`<voice>${voiceNumber}</voice>`)
  if (ev.type && !(ev.kind === 'rest' && ev.measureRest)) parts.push(`<type>${ev.type}</type>`)
  for (let i = 0; i < ev.dots; i++) parts.push('<dot/>')
  if (note?.accidental) {
    parts.push(`<accidental${note.accidental.parentheses ? ' parentheses="yes"' : ''}>${note.accidental.name}</accidental>`)
  }
  if (ev.actual !== ev.normal && !ev.grace) {
    parts.push(`<time-modification><actual-notes>${ev.actual}</actual-notes><normal-notes>${ev.normal}</normal-notes></time-modification>`)
  }
  if (stem && ev.kind === 'chord') parts.push(`<stem>${stem}</stem>`)
  if (staffNumber) parts.push(`<staff>${staffNumber}</staff>`)
  if (ev.beam) parts.push(`<beam number="1">${ev.beam}</beam>`)

  const notations = []
  if (note?.tieStop) notations.push('<tied type="stop"/>')
  if (note?.tieStart) notations.push('<tied type="start"/>')
  if (isFirst) {
    for (const n of ev.slurStops) notations.push(`<slur type="stop" number="${n}"/>`)
    for (const n of ev.slurStarts) notations.push(`<slur type="start" number="${n}"/>`)
    for (const t of ev.tupletStarts) {
      notations.push(
        `<tuplet type="start" number="${t.level}" bracket="${t.bracket ? 'yes' : 'no'}"><tuplet-actual><tuplet-number>${t.actual}</tuplet-number></tuplet-actual><tuplet-normal><tuplet-number>${t.normal}</tuplet-number></tuplet-normal></tuplet>`,
      )
    }
    for (const level of ev.tupletStops) notations.push(`<tuplet type="stop" number="${level}"/>`)
    if (ev.fermata) notations.push(`<fermata type="${ev.fermata}"/>`)
    const arts = ev.articulations.map((a) => `<${a}/>`)
    if (ev.breath) arts.push(`<${ev.breath}/>`)
    if (arts.length) notations.push(`<articulations>${arts.join('')}</articulations>`)
  }
  if (notations.length) parts.push(`<notations>${notations.join('')}</notations>`)

  if (isFirst && ev.kind === 'chord') {
    for (const lyric of ev.lyrics) {
      parts.push(
        `<lyric number="${lyric.number}"><syllabic>${lyric.syllabic}</syllabic><text>${escapeXml(lyric.text)}</text>${lyric.extend ? '<extend/>' : ''}</lyric>`,
      )
    }
  }
  parts.push('</note>')
  return parts.join('')
}

function durationUnits(fraction, div) {
  return Math.round(fraction.valueOf() * 4 * div)
}

function clefXml(clef, number) {
  const attr = number ? ` number="${number}"` : ''
  if (clef.sign === 'percussion') return `<clef${attr}><sign>percussion</sign></clef>`
  const octave = clef.octave ? `<clef-octave-change>${clef.octave}</clef-octave-change>` : ''
  return `<clef${attr}><sign>${clef.sign}</sign><line>${clef.line}</line>${octave}</clef>`
}

function keyXml(key) {
  return `<key><fifths>${key.fifths}</fifths>${key.mode ? `<mode>${key.mode}</mode>` : ''}</key>`
}

function timeXml(time) {
  const symbol = time.symbol ? ` symbol="${time.symbol}"` : ''
  return `<time${symbol}><beats>${time.n}</beats><beat-type>${time.d}</beat-type></time>`
}

function directionXml(ev, { voiceNumber, staffNumber }) {
  const types = []
  let sound = ''
  if (ev.tempo) {
    const { tempo } = ev
    if (tempo.visible && tempo.words) types.push(`<direction-type><words font-weight="bold">${escapeXml(tempo.words)}</words></direction-type>`)
    if (tempo.visible && tempo.beatUnit) {
      types.push(
        `<direction-type><metronome><beat-unit>${tempo.beatUnit}</beat-unit>${tempo.dotted ? '<beat-unit-dot/>' : ''}<per-minute>${tempo.perMinute}</per-minute></metronome></direction-type>`,
      )
    }
    sound = `<sound tempo="${tempo.bpm}"/>`
  }
  if (ev.dynamics) {
    const mark = DYNAMICS.has(ev.dynamics) ? `<${ev.dynamics}/>` : `<other-dynamics>${escapeXml(ev.dynamics)}</other-dynamics>`
    types.push(`<direction-type><dynamics>${mark}</dynamics></direction-type>`)
  }
  if (ev.wedge) types.push(`<direction-type><wedge type="${ev.wedge}"/></direction-type>`)
  if (ev.rehearsal) types.push(`<direction-type><rehearsal>${escapeXml(ev.rehearsal)}</rehearsal></direction-type>`)
  if (ev.marker === 'segno') {
    types.push('<direction-type><segno/></direction-type>')
    sound = `<sound segno="${escapeXml(ev.label)}"/>`
  }
  if (ev.marker === 'coda') {
    types.push('<direction-type><coda/></direction-type>')
    sound = `<sound coda="${escapeXml(ev.label)}"/>`
  }
  if (ev.words) types.push(`<direction-type><words>${escapeXml(ev.words)}</words></direction-type>`)
  if (ev.marker === 'fine') sound = '<sound fine="yes"/>'
  if (ev.marker === 'tocoda') sound = '<sound tocoda="coda"/>'
  if (ev.jump?.dacapo) sound = '<sound dacapo="yes"/>'
  if (ev.jump?.dalsegno) sound = `<sound dalsegno="${escapeXml(ev.jump.dalsegno)}"/>`
  if (!types.length && !sound) return ''
  if (!types.length) types.push('<direction-type><words/></direction-type>')
  const placement = ev.placement ? ` placement="${ev.placement}"` : ''
  return `<direction${placement}>${types.join('')}<voice>${voiceNumber}</voice>${staffNumber ? `<staff>${staffNumber}</staff>` : ''}${sound}</direction>`
}

function leftBarline(meta) {
  const inner = []
  if (meta.startRepeat) inner.push('<bar-style>heavy-light</bar-style>')
  if (meta.volta.start) {
    const { numbers, text } = meta.volta.start
    inner.push(`<ending number="${numbers.join(', ')}" type="start">${escapeXml(text || `${numbers.join(', ')}.`)}</ending>`)
  }
  if (meta.startRepeat) inner.push('<repeat direction="forward"/>')
  return inner.length ? `<barline location="left">${inner.join('')}</barline>` : ''
}

function rightBarline(meta, isLast) {
  const inner = []
  const style = meta.endRepeat ? 'light-heavy' : BARLINE_STYLES[meta.barline] ?? (isLast ? 'light-heavy' : null)
  if (style) inner.push(`<bar-style>${style}</bar-style>`)
  if (meta.volta.stop) inner.push(`<ending number="${meta.volta.stop.numbers.join(', ')}" type="${meta.volta.stop.type}"/>`)
  if (meta.endRepeat) inner.push(`<repeat direction="backward"${meta.endRepeat > 2 ? ` times="${meta.endRepeat - 1}"` : ''}/>`)
  return inner.length ? `<barline location="right">${inner.join('')}</barline>` : ''
}

function writeMeasure(model, part, partIndex, m, div, keys) {
  const meta = model.measures[m]
  const multiStaff = part.staves.length > 1
  const out = []
  out.push(`<measure number="${meta.number}"${meta.implicit ? ' implicit="yes"' : ''}>`)
  out.push(leftBarline(meta))

  const staffModels = part.staves.map((s) => model.staves.find((st) => st.index === s.index))
  // A key at the start of the measure (from the part's first staff) goes in
  // the measure's attributes; the streams below leave those out.
  const startsKey = (e) => e.kind === 'key' && e.offset.isZero()
  let key = staffModels[0].measures[m].find(startsKey)?.key ?? null
  if (m === 0 && !key) key = { fifths: 0, mode: null }
  if (key && keys.get(part.id) && keys.get(part.id).fifths === key.fifths && m > 0) key = null
  if (key) keys.set(part.id, key)

  const attrs = []
  if (m === 0) attrs.push(`<divisions>${div}</divisions>`)
  if (key) attrs.push(keyXml(key))
  if (meta.time) attrs.push(timeXml(meta.time))
  if (m === 0 && multiStaff) attrs.push(`<staves>${part.staves.length}</staves>`)
  if (m === 0) staffModels.forEach((sm, i) => attrs.push(clefXml(sm.initialClef, multiStaff ? i + 1 : 0)))
  if (attrs.length) out.push(`<attributes>${attrs.join('')}</attributes>`)

  let cursor = ZERO
  let firstStream = true
  staffModels.forEach((sm, s) => {
    const events = sm.measures[m].filter((e) => !startsKey(e))
    const byVoice = new Map()
    for (const e of events) {
      if (!byVoice.has(e.voice)) byVoice.set(e.voice, [])
      byVoice.get(e.voice).push(e)
    }
    // Measure-level marks (segno, D.C. …) go with the first part's top voice.
    if (partIndex === 0 && s === 0 && meta.directions.length) {
      if (!byVoice.has(0)) byVoice.set(0, [])
      byVoice.get(0).push(...meta.directions.map((d) => ({ kind: 'direction', voice: 0, placement: 'above', ...d })))
    }
    if (!byVoice.size) {
      // A staff with nothing in this measure still needs a bar's rest.
      byVoice.set(0, [{ kind: 'rest', isRest: true, voice: 0, offset: ZERO, duration: meta.len, measureRest: true, type: null, dots: 0, visible: true, grace: null, actual: 1, normal: 1, tupletStarts: [], tupletStops: [], slurStarts: [], slurStops: [], articulations: [], lyrics: [], notes: [] }])
    }
    const voicesWithNotes = [...byVoice.values()].filter((list) => list.some((e) => e.kind === 'chord')).length
    for (const voice of [...byVoice.keys()].sort((a, b) => a - b)) {
      const stream = byVoice
        .get(voice)
        .map((e, i) => ({ e, i }))
        .sort((a, b) => a.e.offset.compare(b.e.offset) || RANK[a.e.kind] - RANK[b.e.kind] || a.i - b.i)
        .map(({ e }) => e)
      assignBeams(stream, meta.sig)
      const voiceNumber = s * 4 + voice + 1
      const staffNumber = multiStaff ? s + 1 : 0
      const stem = voicesWithNotes > 1 ? (voice % 2 === 0 ? 'up' : 'down') : null
      if (!firstStream && cursor.compare(ZERO) > 0) out.push(`<backup><duration>${durationUnits(cursor, div)}</duration></backup>`)
      firstStream = false
      cursor = ZERO
      for (const ev of stream) {
        if (ev.offset.compare(cursor) > 0) {
          out.push(`<forward><duration>${durationUnits(ev.offset.sub(cursor), div)}</duration><voice>${voiceNumber}</voice>${staffNumber ? `<staff>${staffNumber}</staff>` : ''}</forward>`)
          cursor = ev.offset
        } else if (ev.offset.compare(cursor) < 0) {
          out.push(`<backup><duration>${durationUnits(cursor.sub(ev.offset), div)}</duration></backup>`)
          cursor = ev.offset
        }
        if (ev.kind === 'clef') out.push(`<attributes>${clefXml(ev.clef, staffNumber)}</attributes>`)
        else if (ev.kind === 'key') out.push(`<attributes>${keyXml(ev.key)}</attributes>`)
        else if (ev.kind === 'direction') out.push(directionXml(ev, { voiceNumber, staffNumber }))
        else {
          const ctx = { div, voiceNumber, staffNumber, stem: ev.stem ?? stem }
          if (ev.kind === 'rest') out.push(noteXml(ev, null, 0, ctx))
          else ev.notes.forEach((note, i) => out.push(noteXml(ev, note, i, ctx)))
          if (!ev.grace) cursor = cursor.add(ev.duration)
        }
      }
    }
  })
  out.push(rightBarline(meta, m === model.measures.length - 1))
  out.push('</measure>')
  return out.join('')
}

export function writeMusicXml(model, { title } = {}) {
  const div = divisionsFor(model)
  const workTitle = title || model.title
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
  ]
  if (workTitle) out.push(`<work><work-title>${escapeXml(workTitle)}</work-title></work>`)
  const creators = Object.entries(model.creators).filter(([, v]) => v)
  out.push('<identification>')
  for (const [type, value] of creators) out.push(`<creator type="${type}">${escapeXml(value)}</creator>`)
  out.push(`<encoding><software>Harmonic MuseScore import (mscx ${escapeXml(model.version)})</software></encoding>`)
  out.push('</identification>')
  out.push('<part-list>')
  for (const part of model.parts) {
    out.push(
      `<score-part id="${part.id}"><part-name>${escapeXml(part.name)}</part-name>${part.abbreviation ? `<part-abbreviation>${escapeXml(part.abbreviation)}</part-abbreviation>` : ''}</score-part>`,
    )
  }
  out.push('</part-list>')
  model.parts.forEach((part, partIndex) => {
    const keys = new Map()
    out.push(`<part id="${part.id}">`)
    for (let m = 0; m < model.measures.length; m++) out.push(writeMeasure(model, part, partIndex, m, div, keys))
    out.push('</part>')
  })
  out.push('</score-partwise>')
  return out.join('\n')
}
