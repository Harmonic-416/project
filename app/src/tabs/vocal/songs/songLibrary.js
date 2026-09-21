// __MIDI_SONG_FILES__ is injected by vite.config.js from the contents of
// public/midi-files/ at config-load time. Drop a .mid/.midi file in there
// (restart the dev server, or rebuild) and it shows up here automatically.
/* global __MIDI_SONG_FILES__ */

function titleFromFilename(filename) {
  const base = filename.replace(/\.(mid|midi)$/i, '')
  return base.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export const songLibrary = __MIDI_SONG_FILES__.map((filename) => ({
  id: filename,
  title: titleFromFilename(filename),
  url: `/midi-files/${filename}`,
})).sort((a, b) => a.title.localeCompare(b.title))
