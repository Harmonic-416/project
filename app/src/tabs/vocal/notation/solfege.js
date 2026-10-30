/**
 * Solfège labels (do re mi fa sol la ti) under the notes, for singers who
 * read that way. addSolfege hands the viewer a copy of a partwise MusicXML
 * score with one more lyric line on every pitched note, under any words the
 * score already has; the score itself (exports, sharing) is never touched.
 *
 * Movable do: do is the tonic of the major key the key signature names, so a
 * minor key reads la-based (A minor starts on la), the way most choirs learn
 * it. Notes outside the key take the chromatic syllables, raised (di ri fi si
 * li) or lowered (ra me se le te) as spelled. A key change mid-score moves do.
 *
 * MIDI files often carry no key signature (it converts as C major), which
 * would turn a song in D into a string of di ri fi. So when the notes fit the
 * signature badly and another key well, scoreKey works do out from the notes.
 *
 * Plain string handling, like partFilter.js, so it runs in Node tests too.
 */

const PART_RE = /(<part\s[^>]*>)([\s\S]*?)(<\/part>)/g
// A <key> (inside <attributes>) or a note, in document order.
const KEY_OR_NOTE_RE = /<key(?=[\s>])[^>]*>[\s\S]*?<\/key>|<note\b[^>]*>[\s\S]*?<\/note>/g

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11]
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
export const SYLLABLES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti']
// Scale degree raised / lowered a semitone. Mi and ti raised are fa and do;
// do and fa lowered are ti and mi.
const RAISED = ['di', 'ri', 'fa', 'fi', 'si', 'li', 'do']
const LOWERED = ['ti', 'ra', 'me', 'mi', 'se', 'le', 'te']
// The chromatic notes by semitones above do, named the way they usually turn up.
const USUAL_CHROMATIC = { 1: 'di', 3: 'me', 6: 'fi', 8: 'si', 10: 'te' }

/** The pitch class (0 = C) of the major key with `fifths` sharps (negative: flats). */
function tonicPc(fifths) {
  return (((Math.round(fifths) * 7) % 12) + 12) % 12
}

/** The key signature of the major key on pitch class `pc` (F#, not Gb; Db, not C#). */
function fifthsOf(pc) {
  const f = (pc * 7) % 12
  return f > 6 ? f - 12 : f
}

function pitchClass(step, alter) {
  const s = STEPS.indexOf(step.toUpperCase())
  return s < 0 ? null : (((STEP_SEMITONES[s] + (Number(alter) || 0)) % 12) + 12) % 12
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

/** The note do falls on in the major key with `fifths` sharps: 'D', 'Eb'. */
export function doName(fifths) {
  return (fifths < 0 ? FLAT_NAMES : SHARP_NAMES)[tonicPc(fifths)]
}

/**
 * The solfège syllable for a note spelled `step` (C…B) + `alter`, in the major
 * key with `fifths` sharps (negative: flats). A note outside the key is raised
 * when spelled sharp, lowered when spelled flat; a natural one is lowered in a
 * sharp key (F in G major is te) and raised in a flat key (B in F major is fi).
 * When the spelling means nothing (`spelled` false: a MIDI file read in a key
 * worked out from its notes) it takes the usual name: di me fi si te.
 */
export function solfegeSyllable(step, alter, fifths, spelled = true) {
  const pc = pitchClass(step, alter)
  if (pc === null) return null
  const fromDo = (pc - tonicPc(fifths) + 12) % 12
  const degree = MAJOR_SCALE.indexOf(fromDo)
  if (degree >= 0) return SYLLABLES[degree]
  if (!spelled) return USUAL_CHROMATIC[fromDo]
  const a = Number(alter) || 0
  const raised = a > 0 || (a === 0 && fifths < 0)
  return raised ? RAISED[MAJOR_SCALE.indexOf(fromDo - 1)] : LOWERED[MAJOR_SCALE.indexOf(fromDo + 1)]
}

/**
 * The key solfège should read the whole score in: { fifths, inferred }, the
 * signature's own key when the notes fit it (inferred false), or the major key
 * the notes fit best when they don't (inferred true). Null for a score that
 * changes key: its signatures are followed as written.
 */
export function scoreKey(xml) {
  const signatures = new Set()
  for (const [key] of xml.matchAll(/<key(?=[\s>])[^>]*>[\s\S]*?<\/key>/g)) {
    const f = Number(tagText(key, 'fifths'))
    if (Number.isFinite(f)) signatures.add(f)
  }
  if (signatures.size > 1) return null
  const signed = signatures.size ? [...signatures][0] : 0
  // How long each pitch class sounds, over every part.
  const weight = new Array(12).fill(0)
  for (const [note] of xml.matchAll(/<note\b[^>]*>[\s\S]*?<\/note>/g)) {
    if (!/<pitch\b/.test(note) || /<grace\b/.test(note)) continue
    const pitch = tagText(note, 'pitch') ?? ''
    const pc = pitchClass(tagText(pitch, 'step') ?? '', tagText(pitch, 'alter') ?? 0)
    if (pc !== null) weight[pc] += Number(tagText(note, 'duration')) || 1
  }
  const total = weight.reduce((sum, w) => sum + w, 0)
  if (!total) return { fifths: signed, inferred: false }
  const fit = (tonic) => MAJOR_SCALE.reduce((sum, d) => sum + weight[(tonic + d) % 12], 0) / total
  // A short tune can fit two keys equally (Eb F Gb Ab is in Db and in Gb): then
  // the key whose home chord, major (do mi sol) or minor (la do mi), sounds most wins.
  const home = (tonic) =>
    Math.max(...[[0, 4, 7], [9, 0, 4]].map((triad) => triad.reduce((sum, d) => sum + weight[(tonic + d) % 12], 0)))
  const signedFit = fit(tonicPc(signed))
  let best = tonicPc(signed)
  for (let pc = 0; pc < 12; pc += 1) {
    const gain = fit(pc) - fit(best)
    if (gain > 1e-9 || (Math.abs(gain) <= 1e-9 && home(pc) > home(best))) best = pc
  }
  // A few accidentals (a raised leading note, a borrowed chord) don't overrule the signature.
  if (signedFit >= 0.9 || fit(best) - signedFit < 0.1) return { fifths: signed, inferred: false }
  return { fifths: fifthsOf(best), inferred: true }
}

function tagText(xml, tag) {
  return xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.trim()
}

/** The lyric line number the solfège goes on: one past the highest the score uses. */
function solfegeLine(xml) {
  let max = 0
  for (const [, n] of xml.matchAll(/<lyric\b[^>]*\bnumber=["'](\d+)["']/g)) max = Math.max(max, Number(n))
  if (!max && /<lyric\b/.test(xml)) max = 1 // lyrics without numbers are line 1
  return max + 1
}

function labelNote(note, fifths, line, spelled) {
  if (!/<pitch\b/.test(note) || /<rest\b/.test(note)) return note
  if (/<chord\s*\/>/.test(note)) return note // a chord gets one label, on its first note
  if (/<grace\b/.test(note)) return note
  // A tied-over note keeps sounding the label it started with.
  if (/<tie\b[^>]*type=["']stop["']/.test(note) && !/<tie\b[^>]*type=["']start["']/.test(note)) return note
  const pitch = tagText(note, 'pitch') ?? ''
  const syllable = solfegeSyllable(tagText(pitch, 'step') ?? '', tagText(pitch, 'alter') ?? 0, fifths, spelled)
  if (!syllable) return note
  const lyric = `<lyric number="${line}" name="solfege"><syllabic>single</syllabic><text>${syllable}</text></lyric>`
  // A lyric goes after any other lyrics and before <play>/<listen>, the last elements a note may hold.
  const tail = note.search(/<(play|listen)\b|<\/note>/)
  return note.slice(0, tail) + lyric + note.slice(tail)
}

/**
 * `xml` with a solfège syllable under every pitched note of every part, read
 * in `key` (scoreKey's answer, for the whole score when `xml` is one part of
 * it) or, when that's null, in each key signature as it comes.
 */
export function addSolfege(xml, key = xml ? scoreKey(xml) : null) {
  if (!xml) return xml
  const line = solfegeLine(xml)
  return xml.replace(PART_RE, (whole, open, body, close) => {
    let fifths = key?.fifths ?? 0
    const labelled = body.replace(KEY_OR_NOTE_RE, (element) => {
      if (element.startsWith('<key')) {
        const f = Number(tagText(element, 'fifths'))
        if (!key && Number.isFinite(f)) fifths = f
        return element
      }
      return labelNote(element, fifths, line, !key?.inferred)
    })
    return open + labelled + close
  })
}

const STORAGE_KEY = 'harmonic.vocal.solfege'

/** Whether this device shows solfège (off unless turned on; storage may be blocked). */
export function loadSolfegeSetting() {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function saveSolfegeSetting(on) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Private window or blocked storage: the setting lasts until reload.
  }
}
