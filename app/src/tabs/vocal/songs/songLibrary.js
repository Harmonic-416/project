// __SONG_FILES__ is injected by vite.config.js from the contents of
// public/midi-files/ at config-load time. Drop a .mid/.midi/.musicxml/.mxl
// file in there (restart the dev server, or rebuild) and it shows up here.
/* global __SONG_FILES__ */
import { titleFromFilename } from '../notation/loadNotation.js'

export const songLibrary = __SONG_FILES__.map((filename) => ({
  id: filename,
  filename,
  title: titleFromFilename(filename),
  url: `/midi-files/${filename}`,
})).sort((a, b) => a.title.localeCompare(b.title))
