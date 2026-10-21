/**
 * Lyrics for an arrangement: the sung words, timed, under the tune's notes
 * as syllables (MusicXML <lyric>, which MuseScore and the Vocal tab show).
 *   alignLyrics  Whisper's timed words (often misheard when sung) lined up
 *                with the song's published lyrics, when there are any: the
 *                published words, in their published lines' times when
 *                known, each timed by the heard word it matches, or
 *                between its neighbours where nothing matched;
 *   syllables    a word split for singing, by its vowel sounds;
 *   placeLyrics  each word's syllables on the notes sung while it is:
 *                one a note, a held syllable over any notes left (a
 *                melisma), and syllables run together when a word has
 *                fewer notes than syllables.
 *
 *   word: { text, start, end (seconds) }
 *   lyric: { text, syllabic: 'single' | 'begin' | 'middle' | 'end' }
 *
 * Pure; unit-tested in app/tests/lyrics.test.js.
 */

const norm = (word) => word.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]/g, '')

/** How alike two normalised words are, 0 … 1 (1 - edit distance / longer length). */
function likeness(a, b) {
  if (a === b) return 1
  if (!a || !b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = up
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length)
}

const MATCH = 0.6 // words at least this alike count as the same word

/** The published lyrics' words, in order, each with its line's index (blank and [Chorus] lines skipped). */
function publishedWords(text) {
  const words = []
  text.split('\n').forEach((line, index) => {
    if (/^\s*[([].*[)\]]\s*$/.test(line)) return
    for (const raw of line.split(/\s+/)) {
      const text = raw.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')
      if (norm(text)) words.push({ text, line: index })
    }
  })
  return words
}

/**
 * Which of `heard` each of `texts` (normalised words) is: the index of its
 * heard word, or -1. A global alignment (Needleman–Wunsch) where similar
 * words pair up and the rest are skipped on either side.
 */
function matchWords(texts, heard) {
  const b = heard.map((w) => norm(w.text))
  const n = texts.length
  const m = b.length
  const GAP = -0.3
  const score = Array.from({ length: n + 1 }, () => new Float64Array(m + 1))
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)) // 1 pair, 2 skip a published word, 3 skip a heard one
  for (let i = 1; i <= n; i += 1) {
    score[i][0] = i * GAP
    move[i][0] = 2
  }
  for (let j = 1; j <= m; j += 1) {
    score[0][j] = j * GAP
    move[0][j] = 3
  }
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const like = likeness(texts[i - 1], b[j - 1])
      const options = [score[i - 1][j - 1] + (like >= MATCH ? like : GAP), score[i - 1][j] + GAP, score[i][j - 1] + GAP]
      const best = options.indexOf(Math.max(...options))
      score[i][j] = options[best]
      move[i][j] = best + 1
    }
  }
  const pairs = new Array(n).fill(-1)
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const step = move[i][j]
    if (step === 1) {
      if (likeness(texts[i - 1], b[j - 1]) >= MATCH) pairs[i - 1] = j - 1
      i -= 1
      j -= 1
    } else if (step === 2) i -= 1
    else j -= 1
  }
  return pairs
}

/**
 * `words` ({ text } in order) timed from `times` (a { start, end } or null
 * each), between `from` and `to` seconds: untimed runs spread evenly
 * between the timed words around them (or the bounds), and every time kept
 * in order and inside the bounds.
 */
function fillTimes(words, times, from, to) {
  const out = []
  let previous = from
  for (let i = 0; i < words.length; ) {
    if (times[i] && times[i].start >= previous && times[i].start < to) {
      out.push({ text: words[i].text, start: times[i].start, end: Math.min(times[i].end, to) })
      previous = times[i].start
      i += 1
      continue
    }
    let j = i
    while (j < words.length && !(times[j] && times[j].start >= previous && times[j].start < to)) j += 1
    const until = j < words.length ? times[j].start : to
    // After a timed word, the run starts a step later; at the start of the stretch, right on it.
    const after = out.length > 0
    const step = (until - previous) / (j - i + (after ? 1 : 0))
    for (let k = i; k < j; k += 1) {
      const start = previous + step * (k - i + (after ? 1 : 0))
      out.push({ text: words[k].text, start, end: start + step * 0.8 })
    }
    previous = out.at(-1).start
    i = j
  }
  return out
}

/**
 * `heard` (Whisper's words) with the words of `official` ({ text, synced:
 * [{ time, line }] or null }, or null):
 *   - with timed lines (synced): each line's words between its start and
 *     the next line's, each timed by the heard word it matches within that
 *     stretch, the rest spread evenly — so a misheard or repeated chorus
 *     can't pull words into the wrong line;
 *   - with the text alone: one alignment over the whole song, times kept
 *     in order;
 *   - with neither: the heard words as they are.
 * Whisper's non-words ("[Music]", "♪") are dropped. Returns { words,
 * source: 'official' | 'heard' }.
 */
export function alignLyrics(heard, official) {
  const clean = heard.filter((w) => norm(w.text) && !/^[[(].*[\])]$/.test(w.text.trim()))
  if (!official?.text) return { words: clean.map((w) => ({ ...w })), source: 'heard' }
  const timesOf = (texts, pool) => matchWords(texts, pool).map((j) => (j >= 0 ? { start: pool[j].start, end: pool[j].end } : null))

  const lines = (official.synced ?? []).map((l) => ({ time: l.time, words: publishedWords(l.line) })).filter((l) => l.words.length)
  if (lines.length) {
    const words = lines.flatMap((line, i) => {
      const to = Math.min(lines[i + 1]?.time ?? line.time + 8, line.time + 12)
      const pool = clean.filter((w) => w.start >= line.time - 0.5 && w.start < to)
      return fillTimes(line.words, timesOf(line.words.map((w) => norm(w.text)), pool), line.time, to)
    })
    return { words, source: 'official' }
  }

  const published = publishedWords(official.text)
  if (!published.length) return { words: clean.map((w) => ({ ...w })), source: 'heard' }
  const times = timesOf(published.map((w) => norm(w.text)), clean)
  const first = times.find(Boolean)
  const last = times.findLast(Boolean)
  if (!first) return { words: clean.map((w) => ({ ...w })), source: 'heard' }
  // Words before the first heard one and after the last can't be placed.
  const from = times.indexOf(first)
  const to = times.lastIndexOf(last)
  return { words: fillTimes(published.slice(from, to + 1), times.slice(from, to + 1), first.start, last.end + 0.01), source: 'official' }
}

// ── Syllables ────────────────────────────────────────────────────────────

const VOWEL = /[aeiouy]/
const ONSET_PAIRS = new Set(['ch', 'sh', 'th', 'ph', 'wh', 'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'sc', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw', 'wr', 'qu'])
// Between two vowels, s + consonant splits (yes-ter, sis-ter); the other pairs start the next syllable (ta-ble, a-gree).
const SPLIT_PAIRS = new Set(['sc', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw'])
const CODA_PAIRS = new Set(['ck', 'ng', 'nk', 'ght'])

/**
 * A word split into sung syllables: one per vowel sound, a silent final
 * "e" (love, time) or "-ed"/"-es" (dreamed, takes) adding none, a lone
 * consonant starting the next syllable (o-ver, ba-by), and two or more
 * split after the first (yes-ter), or after a pair that ends a syllable
 * (sing-ing) or before one that starts it (a-gree, no-thing). Apostrophes stay with their
 * syllable (don't, I'm).
 */
export function syllables(word) {
  // A contraction's ending stays on the last syllable (love's, you're, I'll).
  const contraction = word.match(/^(.*[a-z].*?)(['’](?:s|re|ll|ve|d|m|t)|n['’]t)([^a-z]*)$/i)
  if (contraction) {
    const parts = syllables(contraction[1])
    parts[parts.length - 1] += contraction[2] + contraction[3]
    return parts
  }
  const lower = word.toLowerCase()
  if (lower.replace(/[^a-z]/g, '').length <= 3) return [word]
  // Vowel groups: [start, end) of each run of vowels ("y" starting the word is a consonant).
  const groups = []
  for (let i = 0; i < lower.length; ) {
    if (VOWEL.test(lower[i]) && !(lower[i] === 'y' && i === 0)) {
      let j = i
      while (j < lower.length && VOWEL.test(lower[j])) j += 1
      groups.push([i, j])
      i = j
    } else i += 1
  }
  const last = groups.at(-1)
  if (groups.length > 1 && last) {
    const tail = lower.slice(last[0])
    const before = lower[last[0] - 1]
    const silentE = tail === 'e' && !(before === 'l' && !VOWEL.test(lower[last[0] - 2] ?? 'a'))
    const silentEdEs = (tail === 'ed' && !/[td]/.test(before)) || (tail === 'es' && !/[szxg]|ch|sh/.test(lower.slice(last[0] - 2, last[0])))
    if (silentE || silentEdEs) groups.pop()
  }
  if (groups.length <= 1) return [word]
  // A final consonant + "le" is a syllable of its own (twin-kle, lit-tle, ta-ble).
  const end = groups.at(-1)[0]
  const consonantLe = lower.slice(end) === 'e' && lower[end - 1] === 'l' && !VOWEL.test(lower[end - 2] ?? 'a')
  const cuts = []
  for (let g = 1; g < groups.length; g += 1) {
    const from = groups[g - 1][1]
    const to = groups[g][0]
    const cluster = lower.slice(from, to).replace(/'/g, '')
    let cut
    if (consonantLe && g === groups.length - 1 && to - 2 > from) cut = to - 2
    else if (cluster.length <= 1) cut = from
    else if ([...CODA_PAIRS].some((p) => cluster.startsWith(p))) cut = from + [...CODA_PAIRS].find((p) => cluster.startsWith(p)).length
    else if (cluster.length === 2 && ONSET_PAIRS.has(cluster) && !SPLIT_PAIRS.has(cluster)) cut = from
    else if (ONSET_PAIRS.has(cluster.slice(-2)) && cluster.length >= 3) cut = to - 2
    else cut = from + 1
    cuts.push(cut)
  }
  const parts = []
  let at = 0
  for (const cut of cuts) {
    parts.push(word.slice(at, cut))
    at = cut
  }
  parts.push(word.slice(at))
  return parts.filter(Boolean)
}

// ── Under the notes ──────────────────────────────────────────────────────

const syllabic = (i, count) => (count === 1 ? 'single' : i === 0 ? 'begin' : i === count - 1 ? 'end' : 'middle')

/**
 * `melody` (events on the sixteenth grid) with a `lyric` on the notes the
 * `words` are sung on; `toSlot(seconds)` places a word on the grid. A
 * word takes the notes starting from a little before it until the next
 * word starts; a word with no note of its own is left out.
 */
export function placeLyrics(melody, words, toSlot) {
  const out = melody.map((e) => ({ ...e }))
  const placed = words.map((w) => ({ ...w, slot: toSlot(w.start), until: toSlot(w.end) }))
  let n = 0
  placed.forEach((word, w) => {
    const next = placed[w + 1]?.slot ?? Infinity
    while (n < out.length && out[n].start < word.slot - 1) n += 1
    const notes = []
    let k = n
    while (k < out.length && out[k].start < Math.max(word.slot + 1, Math.min(next - 1, word.until + 4))) notes.push(out[k++])
    if (!notes.length) return
    n = k
    const parts = syllables(word.text)
    const count = Math.min(parts.length, notes.length)
    // More syllables than notes: the last note takes the rest.
    const sung = count === parts.length ? parts : [...parts.slice(0, count - 1), parts.slice(count - 1).join('')]
    sung.forEach((text, i) => {
      notes[i].lyric = { text, syllabic: syllabic(i, sung.length) }
    })
  })
  return out
}
