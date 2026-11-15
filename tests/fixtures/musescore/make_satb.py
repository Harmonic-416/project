#!/usr/bin/env python3
"""
Writes satb-features.musicxml: a small SATB + piano score that exercises what
the .mscz importer (app/src/tabs/vocal/notation/musescore/) has to handle —
a pickup, repeats with 1st/2nd endings, key / time / tempo changes, triplets,
ties across barlines, slurred melismas, two verses, dynamics and a hairpin,
a fermata, a breath mark, a bass clef and a treble-8vb tenor clef, and a
two-staff piano part with two voices on its upper staff.

Dev-time only. The .mscz fixtures and their reference MusicXML come from the
MuseScore 4 CLI (see make-fixtures.sh); nothing here ships with the app.
"""
import sys

DIV = 12  # divisions per quarter: eighths = 6, triplet eighths = 4, 16ths = 3
TYPES = {48: ('whole', 0), 36: ('half', 1), 24: ('half', 0), 18: ('quarter', 1), 12: ('quarter', 0),
         9: ('eighth', 1), 6: ('eighth', 0), 3: ('16th', 0)}
STEPS = 'CDEFGAB'


def note(spec, lyr=None, **kw):
    """'G4 q', 'Bb3 e.', 'r h', 'F#4 e3' (triplet eighth); kw: tie, slur, lyr2, fermata, breath, chord."""
    pitch, dur = spec.split()
    base = {'w': 48, 'h': 24, 'q': 12, 'e': 6, 's': 3}[dur[0]]
    if '.' in dur:
        base = base * 3 // 2
    trip = dur.endswith('3')
    d = base * 2 // 3 if trip else base
    return dict(pitch=pitch, dur=d, base=base, trip=trip, lyr=lyr, **kw)


def pitch_xml(p):
    step, rest = p[0], p[1:]
    alter = rest.count('#') - rest.count('b')
    octave = rest.strip('#b')
    a = f'<alter>{alter}</alter>' if alter else ''
    return f'<pitch><step>{step}</step>{a}<octave>{octave}</octave></pitch>'


def lyric_xml(text, number):
    if text is None:
        return ''
    syl = 'single'
    if text.endswith('_'):
        text, extend = text[:-1], '<extend/>'
    else:
        extend = ''
    if text.startswith('-') and text.endswith('-'):
        syl, text = 'middle', text[1:-1]
    elif text.endswith('-'):
        syl, text = 'begin', text[:-1]
    elif text.startswith('-'):
        syl, text = 'end', text[1:]
    return f'<lyric number="{number}"><syllabic>{syl}</syllabic><text>{text}</text>{extend}</lyric>'


def note_xml(n, voice=1, staff=None):
    t, dots = TYPES[n['base']]
    out = ['<note>']
    if n.get('chord'):
        out.append('<chord/>')
    out.append('<rest/>' if n['pitch'] == 'r' else pitch_xml(n['pitch']))
    out.append(f'<duration>{n["dur"]}</duration>')
    tie = n.get('tie')
    if tie in ('start', 'both'):
        out.append('<tie type="start"/>')
    if tie in ('stop', 'both'):
        out.append('<tie type="stop"/>')
    out.append(f'<voice>{voice}</voice><type>{t}</type>' + '<dot/>' * dots)
    if n['trip']:
        out.append('<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>')
    if staff:
        out.append(f'<staff>{staff}</staff>')
    nots = []
    if tie in ('stop', 'both'):
        nots.append('<tied type="stop"/>')
    if tie in ('start', 'both'):
        nots.append('<tied type="start"/>')
    if n.get('slur'):
        nots.append(f'<slur type="{n["slur"]}"/>')
    if n.get('tup'):
        nots.append(f'<tuplet type="{n["tup"]}"/>')
    if n.get('fermata'):
        nots.append('<fermata type="upright"/>')
    if n.get('breath'):
        nots.append('<articulations><breath-mark/></articulations>')
    if nots:
        out.append('<notations>' + ''.join(nots) + '</notations>')
    out.append(lyric_xml(n.get('lyr'), 1))
    out.append(lyric_xml(n.get('lyr2'), 2))
    out.append('</note>')
    return ''.join(out)


def triplet(*notes):
    notes = list(notes)
    notes[0]['tup'] = 'start'
    notes[-1]['tup'] = 'stop'
    return notes


def dyn(mark):
    return f'<direction placement="below"><direction-type><dynamics><{mark}/></dynamics></direction-type></direction>'


def wedge(kind):
    return f'<direction placement="below"><direction-type><wedge type="{kind}"/></direction-type></direction>'


def tempo(bpm):
    return (f'<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>'
            f'<per-minute>{bpm}</per-minute></metronome></direction-type><sound tempo="{bpm}"/></direction>')


# Measure plan (number: key fifths, time, extras). Measure 0 is the pickup.
#   0 pickup (1 beat) | 1-4 repeated, 1st ending on 4 | 5 2nd ending | 6 Bb major, 3/4, slower
#   7 triplets | 8-9 tie across the barline | 10 6/8 | 11 final, fermata
S = {
    0: [dyn('p'), tempo(90), note('D4 q', 'O_', lyr2='Through_')],
    1: [note('G4 q', 'come,'), note('A4 q', 'all', lyr2='ma-'), note('B4 q', 'ye', lyr2='-ny'), note('D5 q', 'faith-', lyr2='dan-')],
    2: [wedge('crescendo'), note('C5 h', '-ful', lyr2='-gers'), note('B4 e', 'joy-', slur='start', lyr2='toils_'),
        note('A4 e', None, slur='stop'), note('G4 q', '-ful', lyr2='and')],
    3: [note('A4 h.', 'and', lyr2='snares', tie='start'), wedge('stop'), note('A4 q', None, tie='stop')],
    4: [note('G4 h', 'tri-', lyr2='we'), note('F#4 q', '-um-', lyr2='have'), note('r q')],
    5: [note('G4 w', 'phant', lyr2='come', breath=True)],
    6: [dyn('f'), tempo(72), note('Bb4 q', 'Come'), note('C5 q', 'and'), note('D5 q', 'be-')],
    7: [*triplet(note('Eb5 e3', '-hold'), note('D5 e3', None), note('C5 e3', None)), note('D5 q', 'him'), note('r q')],
    8: [note('F5 h', 'born', tie='start'), note('F5 q', None, tie='both')],
    9: [note('F5 h.', None, tie='stop')],
    10: [note('D5 q.', 'King'), note('C5 e', 'of'), note('Bb4 e', 'an-'), note('A4 e', '-gels')],
    11: [note('Bb4 h.', 'come', fermata=True)],
}
A = {
    0: [dyn('p'), note('D4 q', 'O')],
    1: [note('D4 q', 'come,'), note('D4 q', 'all'), note('G4 q', 'ye'), note('F#4 q', 'faith-')],
    2: [note('E4 h', '-ful'), note('D4 q', 'joy-'), note('D4 q', '-ful')],
    3: [note('E4 h', 'and'), note('D4 h', None)],
    4: [note('D4 h', 'tri-'), note('D4 q', '-um-'), note('r q')],
    5: [note('D4 w', 'phant')],
    6: [dyn('f'), note('F4 q', 'Come'), note('F4 q', 'and'), note('F4 q', 'be-')],
    7: [note('G4 q', '-hold'), note('F4 q', 'him'), note('r q')],
    8: [note('D4 h.', 'born', tie='start')],
    9: [note('D4 h.', None, tie='stop')],
    10: [note('F4 q.', 'King'), note('F4 e', 'of'), note('F4 e', 'an-'), note('Eb4 e', '-gels')],
    11: [note('D4 h.', 'come', fermata=True)],
}
T = {
    0: [dyn('p'), note('B3 q', 'O')],
    1: [note('B3 q', 'come,'), note('C4 q', 'all'), note('D4 q', 'ye'), note('A3 q', 'faith-')],
    2: [note('G3 h', '-ful'), note('G3 q', 'joy-'), note('B3 q', '-ful')],
    3: [note('C4 h', 'and'), note('C4 q', None), note('C4 q', None)],
    4: [note('B3 h', 'tri-'), note('A3 q', '-um-'), note('r q')],
    5: [note('B3 w', 'phant')],
    6: [dyn('f'), note('D4 q', 'Come'), note('C4 q', 'and'), note('Bb3 q', 'be-')],
    7: [*triplet(note('Bb3 e3', '-hold'), note('Bb3 e3', None), note('A3 e3', None)), note('Bb3 q', 'him'), note('r q')],
    8: [note('Bb3 h.', 'born')],
    9: [note('A3 h.', None)],
    10: [note('Bb3 q.', 'King'), note('A3 e', 'of'), note('D4 e', 'an-'), note('C4 e', '-gels')],
    11: [note('Bb3 h.', 'come', fermata=True)],
}
B = {
    0: [dyn('p'), note('G3 q', 'O')],
    1: [note('G3 q', 'come,'), note('F#3 q', 'all'), note('G3 q', 'ye'), note('D3 q', 'faith-')],
    2: [note('C3 h', '-ful'), note('G3 q', 'joy-'), note('G2 q', '-ful')],
    3: [note('A2 h', 'and'), note('D3 h', None)],
    4: [note('G2 h', 'tri-'), note('D3 q', '-um-'), note('r q')],
    5: [note('G2 w', 'phant')],
    6: [dyn('f'), note('Bb2 q', 'Come'), note('A2 q', 'and'), note('G2 q', 'be-')],
    7: [note('C3 q', '-hold'), note('F3 q', 'him'), note('r q')],
    8: [note('Bb2 h.', 'born')],
    9: [note('F2 h.', None)],
    10: [note('Bb2 q.', 'King'), note('F3 e', 'of'), note('D3 e', 'an-'), note('F3 e', '-gels')],
    11: [note('Bb2 h.', 'come', fermata=True)],
}

TIME = {0: (4, 4), 6: (3, 4), 10: (6, 8), 11: (3, 4)}
KEY = {0: 1, 6: -2}
CLEF = {'S': ('G', 2, 0), 'A': ('G', 2, 0), 'T': ('G', 2, -1), 'B': ('F', 4, 0)}
NAMES = {'S': 'Soprano', 'A': 'Alto', 'T': 'Tenor', 'B': 'Bass'}


def measure_len(m):
    if m == 0:
        return DIV
    beats, bt = next(TIME[k] for k in sorted(TIME, reverse=True) if k <= m)
    return beats * DIV * 4 // bt


def attributes(m, clefs):
    parts = []
    if m == 0:
        parts.append(f'<divisions>{DIV}</divisions>')
    if m in KEY:
        parts.append(f'<key><fifths>{KEY[m]}</fifths></key>')
    if m in TIME:
        parts.append(f'<time><beats>{TIME[m][0]}</beats><beat-type>{TIME[m][1]}</beat-type></time>')
    if m == 0:
        if len(clefs) > 1:
            parts.append(f'<staves>{len(clefs)}</staves>')
        for i, (sign, line, octv) in enumerate(clefs, start=1):
            num = f' number="{i}"' if len(clefs) > 1 else ''
            oc = f'<clef-octave-change>{octv}</clef-octave-change>' if octv else ''
            parts.append(f'<clef{num}><sign>{sign}</sign><line>{line}</line>{oc}</clef>')
    return '<attributes>' + ''.join(parts) + '</attributes>' if parts else ''


def barlines(m):
    left = right = ''
    if m == 1:
        left = '<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>'
    if m == 4:
        left = '<barline location="left"><ending number="1" type="start">1.</ending></barline>'
        right = ('<barline location="right"><bar-style>light-heavy</bar-style>'
                 '<ending number="1" type="stop"/><repeat direction="backward"/></barline>')
    if m == 5:
        left = '<barline location="left"><ending number="2" type="start">2.</ending></barline>'
        right = '<barline location="right"><ending number="2" type="discontinue"/></barline>'
    if m == 11:
        right = '<barline location="right"><bar-style>light-heavy</bar-style></barline>'
    return left, right


def items_xml(items, voice=1, staff=None):
    out = []
    for it in items:
        if isinstance(it, str):
            out.append(it)
        else:
            out.append(note_xml(it, voice, staff))
    return ''.join(out)


def voice_part(pid, key):
    music = {'S': S, 'A': A, 'T': T, 'B': B}[key]
    out = [f'<part id="{pid}">']
    for m in range(12):
        left, right = barlines(m)
        attrs = ' implicit="yes"' if m == 0 else ''
        out.append(f'<measure number="{m}"{attrs}>{left}{attributes(m, [CLEF[key]])}{items_xml(music[m])}{right}</measure>')
    out.append('</part>')
    return '\n'.join(out)


def strip(items):
    """Piano doubles the voices without lyrics / dynamics / slurs."""
    res = []
    for it in items:
        if isinstance(it, str):
            continue
        c = dict(it)
        c['lyr'] = c['lyr2'] = None
        c['slur'] = None
        c['breath'] = None
        res.append(c)
    return res


def piano_part(pid):
    out = [f'<part id="{pid}">']
    for m in range(12):
        left, right = barlines(m)
        length = measure_len(m)
        attrs = ' implicit="yes"' if m == 0 else ''
        body = [left, attributes(m, [('G', 2, 0), ('F', 4, 0)])]
        body.append(items_xml(strip(S[m]), 1, 1))
        body.append(f'<backup><duration>{length}</duration></backup>')
        body.append(items_xml(strip(A[m]), 2, 1))
        body.append(f'<backup><duration>{length}</duration></backup>')
        # Left hand: tenor + bass as two-note chords in one voice where the
        # rhythms agree, otherwise a whole-measure rest.
        lh = []
        pairs = list(zip(strip(T[m]), strip(B[m])))
        if len(strip(T[m])) == len(strip(B[m])) and all(
                t['dur'] == b['dur'] and t.get('tup') == b.get('tup') and (t['pitch'] == 'r') == (b['pitch'] == 'r')
                for t, b in pairs):
            for t, b in pairs:
                lh.append(note_xml(b, 5, 2))
                if b['pitch'] != 'r':
                    lh.append(note_xml(dict(t, chord=True), 5, 2))
        else:
            lh.append(f'<note><rest measure="yes"/><duration>{length}</duration><voice>5</voice><staff>2</staff></note>')
        body.extend(lh)
        body.append(right)
        out.append(f'<measure number="{m}"{attrs}>' + ''.join(body) + '</measure>')
    out.append('</part>')
    return '\n'.join(out)


def main():
    parts = [('P1', 'S'), ('P2', 'A'), ('P3', 'T'), ('P4', 'B')]
    xml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" '
           '"http://www.musicxml.org/dtds/partwise.dtd">',
           '<score-partwise version="4.0">',
           '<work><work-title>Adeste Test</work-title></work>',
           '<identification><creator type="composer">Test Fixture</creator></identification>',
           '<part-list>']
    for pid, key in parts:
        xml.append(f'<score-part id="{pid}"><part-name>{NAMES[key]}</part-name></score-part>')
    xml.append('<score-part id="P5"><part-name>Piano</part-name></score-part>')
    xml.append('</part-list>')
    for pid, key in parts:
        xml.append(voice_part(pid, key))
    xml.append(piano_part('P5'))
    xml.append('</score-partwise>')
    sys.stdout.write('\n'.join(xml) + '\n')


if __name__ == '__main__':
    main()
