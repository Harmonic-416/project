#!/usr/bin/env node
/**
 * The polish ratchet.
 *
 * Measures one metric about the repo and compares it to the committed value in
 * scripts/baselines.json. A metric may only move in its allowed direction, so
 * "polished" becomes a stop condition instead of an opinion: the loop's job is
 * to drive these numbers to their floor, and done is when they arrive.
 *
 *   node scripts/assert-baseline.mjs --key hexLiterals --direction down-or-equal
 *   node scripts/assert-baseline.mjs --all          # report every metric
 *   node scripts/assert-baseline.mjs --write        # re-record (humans only)
 *
 * Exits non-zero when a metric moved the wrong way. When a metric improves, it
 * prints the new value and tells you to re-record it, which tightens the
 * ratchet for the next iteration.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINES = join(ROOT, 'scripts', 'baselines.json')

/**
 * THE SCOPE. The loop may only work on the Guitar tab's Songs, Learn and
 * Exercises, so every metric measures only those paths. Measuring the whole
 * app would make the floor unreachable and "improved" meaningless.
 *
 * `practice/` is in scope because it IS Learn's implementation (the chord
 * lesson screens). `song/follow/` is excluded because it holds the judge
 * thresholds, which are tuned by ear and frozen (CLAUDE.md).
 */
export const SCOPE = [
  'app/src/tabs/guitar/GuitarTab',
  'app/src/tabs/guitar/song/',
  'app/src/tabs/guitar/learn/',
  'app/src/tabs/guitar/exercises/',
  'app/src/tabs/guitar/practice/',
  'app/src/tabs/guitar/notation/',
]

/**
 * Nothing in scope is excluded from the metrics any more. The ear-tuned files
 * are frozen per-file in scripts/frozen-files.txt, and none of them is a
 * stylesheet — so song/follow/GuitarFollow.css is polish work like any other
 * and must be counted, or 179 lines of hardcoded colour hide from the ratchet.
 */
export const SCOPE_EXCLUDE = []

/** Is this repo-relative path inside the loop's scope? */
export function inScope(rel) {
  const p = rel.split('\\').join('/')
  if (SCOPE_EXCLUDE.some((x) => p.startsWith(x))) return false
  return SCOPE.some((s) => p.startsWith(s))
}

/** Every in-scope .css file. */
function cssFiles() {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.css')) out.push(full)
    }
  }
  walk(join(ROOT, 'app', 'src', 'tabs', 'guitar'))
  return out.filter((f) => inScope(f.slice(ROOT.length + 1)))
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g

/**
 * Each metric returns a number. Keep them cheap: the gate runs them every
 * iteration, and a slow gate is a gate people stop running.
 */
const METRICS = {
  /** Hex colour literals outside the token file. Target: 0. */
  hexLiterals() {
    let n = 0
    for (const file of cssFiles()) {
      if (file.includes(join('styles', 'tokens.css'))) continue
      n += (readFileSync(file, 'utf8').match(HEX) ?? []).length
    }
    return n
  },

  /** Stylesheets that set colours but carry no dark-mode handling. Target: 0. */
  untokenisedSheets() {
    let n = 0
    for (const file of cssFiles()) {
      if (file.includes(join('styles', 'tokens.css'))) continue
      const css = readFileSync(file, 'utf8')
      const setsColour = HEX.test(css) || /\b(color|background)\s*:/.test(css)
      HEX.lastIndex = 0
      if (setsColour && !css.includes('prefers-color-scheme') && !css.includes('var(--')) n += 1
    }
    return n
  },

  /** Distinct max-width breakpoints. Target: 3, all from tokens.css. */
  breakpointVariants() {
    const seen = new Set()
    for (const file of cssFiles()) {
      for (const m of readFileSync(file, 'utf8').matchAll(/@media[^{]*?(\d+)px/g)) seen.add(m[1])
    }
    return seen.size
  },

  /**
   * App test files. May only grow — this is the anti-skip assertion, and it is
   * deliberately whole-app: the loop must not break a vocal test to pass a
   * guitar one.
   */
  appTestFiles() {
    return readdirSync(join(ROOT, 'app', 'tests')).filter((f) => f.includes('.test.')).length
  },

  /**
   * Lines in the two oversized in-scope components. GuitarSong.jsx is 849
   * lines; splitting it along the seams its sections already imply is task A6.
   */
  largestInScopeComponent() {
    let worst = 0
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (name.endsWith('.jsx') && inScope(full.slice(ROOT.length + 1))) {
          worst = Math.max(worst, readFileSync(full, 'utf8').split('\n').length)
        }
      }
    }
    walk(join(ROOT, 'app', 'src', 'tabs', 'guitar'))
    return worst
  },
}

const argv = process.argv.slice(2)
const arg = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? null : argv[i + 1]
}

const baselines = JSON.parse(readFileSync(BASELINES, 'utf8'))

if (argv.includes('--write')) {
  const next = { ...baselines, measured: new Date().toISOString().slice(0, 10) }
  for (const [key, fn] of Object.entries(METRICS)) next[key] = { ...baselines[key], value: fn() }
  writeFileSync(BASELINES, `${JSON.stringify(next, null, 2)}\n`)
  console.log('baselines re-recorded:')
  for (const key of Object.keys(METRICS)) console.log(`  ${key}: ${next[key].value}`)
  process.exit(0)
}

const keys = argv.includes('--all') ? Object.keys(METRICS) : [arg('key')]
let failed = false

for (const key of keys) {
  if (!key || !METRICS[key]) {
    console.error(`unknown metric: ${key}\nknown: ${Object.keys(METRICS).join(', ')}`)
    process.exit(2)
  }
  const entry = baselines[key]
  if (!entry) {
    console.error(`no baseline recorded for ${key} — run --write`)
    process.exit(2)
  }
  const direction = arg('direction') ?? entry.direction
  const actual = METRICS[key]()
  const want = entry.value
  const worse = direction === 'down-or-equal' ? actual > want : actual < want
  const better = direction === 'down-or-equal' ? actual < want : actual > want

  if (worse) {
    console.error(`FAIL ${key}: ${actual} (baseline ${want}, must be ${direction}) — ${entry.target}`)
    failed = true
  } else if (better) {
    console.log(`PASS ${key}: ${actual} — improved from ${want}. Re-record with --write.`)
  } else {
    console.log(`PASS ${key}: ${actual}`)
  }
}

process.exit(failed ? 1 : 0)
