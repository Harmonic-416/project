#!/bin/sh
# Rebuilds the MuseScore fixtures used by app/tests/museScoreImport.test.js.
# Dev-time only: needs the MuseScore 4 CLI (macOS path below, or set MSCORE).
# The *.ref.musicxml files are MuseScore's own MusicXML export of each score,
# the reference the in-browser importer is compared against.
# (amazing-grace.mscz / .mxl / .mid were saved and exported by hand in MuseScore 4.)
set -e
cd "$(dirname "$0")"
MSCORE=${MSCORE:-"/Applications/MuseScore 4.app/Contents/MacOS/mscore"}

python3 make_satb.py > satb-features.musicxml
"$MSCORE" -o satb-features.mscz satb-features.musicxml
"$MSCORE" -o satb-features.ref.musicxml satb-features.mscz

python3 make_ms3.py > hymn-ms3.mscx
"$MSCORE" -o hymn-ms3.ref.musicxml hymn-ms3.mscx

"$MSCORE" -o ode-to-joy.mscx ../musicxml/ode-to-joy.musicxml
"$MSCORE" -o ode-to-joy.ref.musicxml ode-to-joy.mscx

"$MSCORE" -o amazing-grace.ref.musicxml amazing-grace.mscz

# Saving a bare .mscx also writes MuseScore's side files next to it; drop them.
rm -rf audiosettings.json automation.json score_style.mss viewsettings.json META-INF Thumbnails
