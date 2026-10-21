import { register } from 'node:module'

/**
 * Lets plain Node load the app's modules the way Vite and Vitest do: the
 * one package they import a name from that Node can't read as ESM
 * (@tonejs/midi's ESM build is .js in a CommonJS package) is served from
 * its CommonJS build instead. Loaded with `node --import ./register.js`.
 */
register('./hooks.js', import.meta.url)
