/**
 * Solfège lyrics: rewrite a partwise MusicXML score so every sung note's
 * lyric is its movable-do syllable (do re mi fa so la ti, with di ri fi si li
 * going up and ra me se le te coming down), for the Vocal tab's Solfège toggle.
 *
 * Do is the major tonic of the key signature, so a minor key sings from la
 * (la-based minor). The written key is used, key changes included, unless
 * the notes clearly don't fit it (a MIDI file with no key signature arrives
 * as C major): then do comes from the notes themselves.
 *
 * Chromatic notes take their syllable from how they're spelled (G♯ in C is
 * si, A♭ is le) when the spelling can be trusted. MIDI files are converted
 * with every black key spelled as a sharp, so for those (`trustSpelling:
 * false`) a chromatic note gets the usual choice instead: di me fi le te,
 * and si rather than le in a minor song.
 *
 * Plain string handling, like partFilter.js, so it runs in Node tests too.
 */

const PART_RE = /(<part\s[^>]*>)([\s\S]*?)(<\/part>)/g
const TOKEN_RE = /<attributes\b[^>]*>[\s\S]*?<\/attributes>|<note\b[^>]*>[\s\S]*?<\/note>/g
const LYRIC_RE = /\s*<lyric\b[^>]*\/>|\s*<lyric\b[^>]*>[\s\S]*?<\/lyric>/g

const LETTERS = 'CDEFGAB'
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11]
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const DIATONIC = ['do', 're', 'mi', 'fa', 'so', 'la', 'ti']
// By scale degree: the note a half step above it (raised) and below it (lowered).
const RAISED = ['di', 'ri', null, 'fi', 'si', 'li', null]
const LOWERED = [null, 'ra', 'me', null, 'se', 'le', 'te']
// By half steps above do, when the spelling can't say.
const CHROMATIC = { 1: 'di', 3: 'me', 6: 'fi', 8: 'le', 10: 'te' }

// How close (as a share of the notes) the written key must fit compared with the best key.
const WRITTEN_KEY_SLACK = 0.03

const mod12 = (n) => ((n % 12) + 12) % 12

/** The major tonic of a key signature: { pc, letter, name } (name like 'E♭'). */
export function tonicOfFifths(fifths) {
  const letter = 'CGDAEBF'[((fifths % 7) + 7) % 7]
  const pc = mod12(fifths * 7)
  const alter = mod12(pc - LETTER_PC[LETTERS.indexOf(letter)] + 6) - 6
  return { pc, letter, name: letter + (alter > 0 ? '♯'.repeat(alter) : '♭'.repeat(-alter)) }
}

/** The key signature (−5…6 fifths) whose major tonic is pitch class `pc`. */
function fifthsOfPc(pc) {
  const f = mod12(pc * 7)
  return f > 6 ? f - 12 : f
}

function readNote(xml) {
  const pitch = xml.match(/<pitch\b[^>]*>([\s\S]*?)<\/pitch>/)?.[1]
  if (!pitch) return null // a rest, or unpitched
  const step = pitch.match(/<step>\s*([A-G])\s*<\/step>/)?.[1]
  if (!step) return null
  const alter = Math.round(Number(pitch.match(/<alter>\s*([-\d.]+)\s*<\/alter>/)?.[1] ?? 0)) || 0
  const ties = [...xml.matchAll(/<tie\b[^>]*\btype=["'](start|stop)["']/g)].map((m) => m[1])
  return {
    letter: LETTERS.indexOf(step),
    pc: mod12(LETTER_PC[LETTERS.indexOf(step)] + alter),
    weight: Number(xml.match(/<duration>\s*([\d.]+)\s*<\/duration>/)?.[1] ?? 0) || 0,
    // Only the first note of a chord, and not the held half of a tie or a grace note, gets a syllable.
    sung: !/<chord\s*\/>/.test(xml) && !/<grace\b/.test(xml) && !(ties.includes('stop') && !ties.includes('start')),
  }
}

/** Each part's tokens in order, with the key signature (and mode) in force at every note. */
function readParts(xml) {
  const parts = []
  for (const [, , body] of xml.matchAll(PART_RE)) {
    const notes = []
    let fifths = 0
    let minor = false
    for (const [token] of body.matchAll(TOKEN_RE)) {
      if (token.startsWith('<attributes')) {
        const key = token.match(/<key\b[^>]*>([\s\S]*?)<\/key>/)?.[1]
        const written = key?.match(/<fifths>\s*(-?\d+)\s*<\/fifths>/)?.[1]
        if (written !== undefined) {
          fifths = Number(written)
          minor = /<mode>\s*minor\s*<\/mode>/.test(key)
        }
        continue
      }
      const note = readNote(token)
      if (note) notes.push({ ...note, fifths, minor })
    }
    parts.push(notes)
  }
  return parts
}

/** Share of the sung notes' length on each half step above `doOf(note)`: 12 numbers. */
function profile(notes, doOf) {
  const shares = new Array(12).fill(0)
  let total = 0
  for (const n of notes) {
    const w = n.weight || 1
    total += w
    shares[mod12(n.pc - doOf(n))] += w
  }
  return total ? shares.map((w) => w / total) : shares
}

/** How much of a profile is in the major scale. */
const fit = (shares) => MAJOR.reduce((sum, offset) => sum + shares[offset], 0)
/** Whether a profile leans on la-do-mi (minor) more than do-mi-so (major). */
const leansMinor = (shares) => shares[9] + shares[0] + shares[4] > shares[0] + shares[4] + shares[7]

/**
 * Where do is: { fifths, written, minor } for the whole score, or null for a
 * score without notes. `written` true means each note's own written key is
 * used (key changes and all); otherwise do is fixed at `fifths`' tonic.
 */
export function findDo(xml) {
  const notes = readParts(xml).flat().filter((n) => n.sung)
  if (!notes.length) return null
  const written = profile(notes, (n) => tonicOfFifths(n.fifths).pc)
  let best = null
  for (let pc = 0; pc < 12; pc += 1) {
    // Near-ties (a tune that never uses one of the notes fits two keys) go to
    // the key whose home chord, do-mi-so or la-do-mi, it leans on most, then
    // to the one with fewer sharps or flats.
    const shares = profile(notes, () => pc)
    const fifths = fifthsOfPc(pc)
    const home = Math.max(shares[0] + shares[4] + shares[7], shares[9] + shares[0] + shares[4])
    const score = fit(shares) + home * 0.004 - Math.abs(fifths) * 1e-5
    if (!best || score > best.score) best = { score, fifths, shares }
  }
  if (fit(written) >= fit(best.shares) - WRITTEN_KEY_SLACK) {
    // Named by the key it starts in.
    return { fifths: notes[0].fifths, written: true, minor: notes.at(-1).minor || leansMinor(written) }
  }
  return { fifths: best.fifths, written: false, minor: leansMinor(best.shares) }
}

/** The syllable for a note `n` with do on `tonic` ({ pc, letter }). */
export function syllable(n, tonic, { trustSpelling = true, minor = false } = {}) {
  const offset = mod12(n.pc - tonic.pc)
  const degree = MAJOR.indexOf(offset)
  if (degree >= 0) return DIATONIC[degree]
  if (trustSpelling) {
    const d = (n.letter - LETTERS.indexOf(tonic.letter) + 7) % 7
    const diff = mod12(offset - MAJOR[d] + 6) - 6
    const spelled = diff === 1 ? RAISED[d] : diff === -1 ? LOWERED[d] : null
    if (spelled) return spelled
  }
  return offset === 8 && minor ? 'si' : CHROMATIC[offset]
}

function lyricXml(text) {
  return `<lyric number="1"><syllabic>single</syllabic><text>${text}</text></lyric>`
}

/** Put `lyric` (or nothing) in place of a <note>'s lyrics, where MusicXML wants it: after <notations>, before <play>/<listen>. */
function setLyric(noteXml, lyric) {
  const bare = noteXml.replace(LYRIC_RE, '')
  if (!lyric) return bare
  const at = bare.search(/<(play|listen)\b|<\/note>/)
  return `${bare.slice(0, at)}${lyric}${bare.slice(at)}`
}

/**
 * `xml` with every sung note's lyric replaced by its solfège syllable (and
 * other notes' lyrics removed), and where do is: { content, doName } —
 * doName like 'E♭', or null (and `xml` unchanged) when there's nothing to sing.
 */
export function withSolfege(xml, { trustSpelling = true } = {}) {
  const key = findDo(xml)
  if (!key) return { content: xml, doName: null }
  const fixedTonic = tonicOfFifths(key.fifths)
  const content = xml.replace(PART_RE, (whole, open, body, close) => {
    let fifths = 0
    const rewritten = body.replace(TOKEN_RE, (token) => {
      if (token.startsWith('<attributes')) {
        const written = token.match(/<key\b[^>]*>[\s\S]*?<fifths>\s*(-?\d+)\s*<\/fifths>/)?.[1]
        if (written !== undefined) fifths = Number(written)
        return token
      }
      const note = readNote(token)
      if (!note) return token
      const tonic = key.written ? tonicOfFifths(fifths) : fixedTonic
      return setLyric(token, note.sung && lyricXml(syllable(note, tonic, { trustSpelling, minor: key.minor })))
    })
    return `${open}${rewritten}${close}`
  })
  return { content, doName: fixedTonic.name }
}

const STORAGE_KEY = 'harmonic.solfege'

/** Whether the Solfège toggle was left on, in this browser. */
export function loadSolfegeOn() {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function saveSolfegeOn(on) {
  try {
    if (on) globalThis.localStorage.setItem(STORAGE_KEY, 'on')
    else globalThis.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private window or blocked storage: the toggle lasts until reload.
  }
}
