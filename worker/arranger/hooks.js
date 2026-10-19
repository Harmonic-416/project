// Module hooks for register.js:
//   - `@tonejs/midi` → a module re-exporting its CommonJS build's `Midi`;
//   - the app's files get Vite's `import.meta.env` (BASE_URL '/'): they
//     build model URLs from it, which the worker never fetches (it hands
//     the models over itself, models.js).
const SHIM = 'harmonic-shim:tonejs-midi'
const APP_SRC = new URL('../../app/src/', import.meta.url).href
const ENV = JSON.stringify({ BASE_URL: '/', MODE: 'production', DEV: false, PROD: true, SSR: true })

export async function resolve(specifier, context, next) {
  if (specifier === '@tonejs/midi') {
    const real = await next(specifier, context) // the CommonJS build (its "main")
    return { url: `${SHIM}?${encodeURIComponent(real.url)}`, shortCircuit: true }
  }
  return next(specifier, context)
}

export async function load(url, context, next) {
  if (url.startsWith(`${SHIM}?`)) {
    const real = decodeURIComponent(url.slice(SHIM.length + 1))
    return { format: 'module', source: `import pkg from ${JSON.stringify(real)}\nexport const { Midi } = pkg\nexport default pkg\n`, shortCircuit: true }
  }
  const loaded = await next(url, context)
  if (url.startsWith(APP_SRC) && loaded.format === 'module' && loaded.source) {
    const source = String(loaded.source)
    if (source.includes('import.meta.env')) return { ...loaded, source: source.replaceAll('import.meta.env', `(${ENV})`) }
  }
  return loaded
}
