/**
 * The file formats the Guitar tab opens, by extension. Kept apart from
 * loadGuitarNotation.js so Home (My files) can offer the right file picker
 * without loading alphaTab, which the loader brings along.
 */
export const EXTENSION_FORMATS = {
  gp: 'guitar-pro',
  gp3: 'guitar-pro',
  gp4: 'guitar-pro',
  gp5: 'guitar-pro',
  gpx: 'guitar-pro',
  alphatex: 'alphatex',
  atex: 'alphatex',
  musicxml: 'musicxml',
  xml: 'musicxml',
  mxl: 'mxl',
  mid: 'midi',
  midi: 'midi',
}

export const GUITAR_NOTATION_EXTENSIONS = Object.keys(EXTENSION_FORMATS)
export const GUITAR_NOTATION_ACCEPT = GUITAR_NOTATION_EXTENSIONS.map((ext) => `.${ext}`).join(',')
