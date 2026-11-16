#!/usr/bin/env python3
"""
Writes hymn-ms3.mscx: a closed-score hymn (one "Choir" part, two staves,
S/A and T/B as voices 1/2) in MuseScore 3.02's file layout, hand-built
because only MuseScore 4 is installed here. It uses what MuseScore 3 files
do differently: no header clef elements (the bass clef comes from the
staff's <defaultClef>), <KeySig><accidental>, melismas as <ticks>, plus a
<location> gap in a voice, a grace note, an explicit natural, a key change,
a repeat and two verses. MuseScore 4 opens it as a 3.x file
(make-fixtures.sh exports the reference MusicXML from it).
"""
import sys

TPC = {'C': 14, 'D': 16, 'E': 18, 'F': 13, 'G': 15, 'A': 17, 'B': 19}
SEMI = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
DUR = {'h.': ('half', 1), 'h': ('half', 0), 'q': ('quarter', 0), 'e': ('eighth', 0)}


def pitch(p):
    step, acc, octave = p[0], p[1:-1], int(p[-1])
    alter = acc.count('#') - acc.count('b')
    return (octave + 1) * 12 + SEMI[step] + alter, TPC[step] + 7 * alter


def chord(p, d, lyr=(), tie=None, natural=False, grace=False, ticks=None, extra=''):
    t, dots = DUR[d]
    midi, tpc = pitch(p)
    out = ['<Chord>']
    if grace:
        out.append('<acciaccatura/>')
    if dots:
        out.append(f'<dots>{dots}</dots>')
    out.append(f'<durationType>{t}</durationType>')
    for no, text in enumerate(lyr):
        if not text:
            continue
        syl = None
        if text.endswith('-') and text.startswith('-'):
            syl, text = 'middle', text[1:-1]
        elif text.endswith('-'):
            syl, text = 'begin', text[:-1]
        elif text.startswith('-'):
            syl, text = 'end', text[1:]
        body = (f'<no>{no}</no>' if no else '') + (f'<syllabic>{syl}</syllabic>' if syl else '')
        if ticks and no == 0:
            body += f'<ticks>{ticks}</ticks>'
        out.append(f'<Lyrics>{body}<text>{text}</text></Lyrics>')
    out.append(extra)
    out.append('<Note>')
    if natural:
        out.append('<Accidental><subtype>accidentalNatural</subtype></Accidental>')
    if tie in ('start',):
        out.append(f'<Spanner type="Tie"><Tie></Tie><next><location>{tie_loc}</location></next></Spanner>')
    if tie in ('stop',):
        out.append(f'<Spanner type="Tie"><prev><location>{tie_prev}</location></prev></Spanner>')
    out.append(f'<pitch>{midi}</pitch><tpc>{tpc}</tpc></Note></Chord>')
    return ''.join(out)


tie_loc = tie_prev = ''


def rest(d):
    t, dots = DUR[d]
    return f'<Rest>{f"<dots>{dots}</dots>" if dots else ""}<durationType>{t}</durationType></Rest>'


def head(m, staff):
    if m == 0:
        return '<KeySig><accidental>2</accidental></KeySig><TimeSig><sigN>3</sigN><sigD>4</sigD></TimeSig>' + (
            '<Tempo><tempo>1.5</tempo><followText>1</followText><text><sym>metNoteQuarterUp</sym> = 90</text></Tempo>'
            '<Dynamic><subtype>mp</subtype><velocity>64</velocity></Dynamic>' if staff == 1 else '')
    if m == 6:
        return '<KeySig><accidental>1</accidental></KeySig>' + (
            '<Dynamic><subtype>mf</subtype><velocity>80</velocity></Dynamic>'
            '<Tempo><tempo>1</tempo><followText>1</followText><text><sym>metNoteQuarterUp</sym> = 60</text></Tempo>'
            if staff == 1 else '')
    return ''


SLUR_START = '<Spanner type="Slur"><Slur></Slur><next><location><fractions>1/8</fractions></location></next></Spanner>'
SLUR_END = '<Spanner type="Slur"><prev><location><fractions>-1/8</fractions></location></prev></Spanner>'
TRIPLET = ('<Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes><baseNote>eighth</baseNote>'
           '<Number><style>Tuplet</style><text>3</text></Number></Tuplet>')
TIE_TO_NEXT_BAR = '<measures>1</measures><fractions>-1/4</fractions>'
TIE_FROM_PREV_BAR = '<measures>-1</measures><fractions>1/4</fractions>'
TIE_TO_NEXT_BAR_0 = '<measures>1</measures>'
TIE_FROM_PREV_BAR_0 = '<measures>-1</measures>'


def tied(p, d, kind, loc, **kw):
    global tie_loc, tie_prev
    if kind == 'start':
        tie_loc = loc
    else:
        tie_prev = loc
    return chord(p, d, tie=kind, **kw)


def soprano(m):
    return {
        0: chord('A4', 'q', ['Praise', 'All']),
        1: chord('D5', 'q', ['God', 'peo-']) + chord('C#5', 'q', ['from', '-ple']) + chord('B4', 'q', ['whom', 'that']),
        2: chord('A4', 'q', ['all', 'on']) + chord('B4', 'e', ['bless-', 'earth'], ticks=240, extra=SLUR_START)
           + chord('A4', 'e', extra=SLUR_END) + chord('G4', 'q', ['-ings', 'do']),
        3: TRIPLET + chord('F#4', 'e', ['flow,', 'dwell,']) + chord('G4', 'e') + chord('A4', 'e') + '<endTuplet/>'
           + tied('B4', 'h', 'start', TIE_TO_NEXT_BAR),
        4: tied('B4', 'q', 'stop', TIE_FROM_PREV_BAR) + chord('C#5', 'e', grace=True)
           + chord('A4', 'q', ['Praise', 'Sing']) + chord('G4', 'q', ['him', 'to']),
        5: chord('F#4', 'h', ['all', 'the']) + rest('q'),
        6: chord('C5', 'q', ['crea-', 'Lord'], natural=True) + chord('B4', 'q', ['-tures', 'with']) + chord('A4', 'q', ['here', 'cheer-']),
        7: '<Fermata><subtype>fermataAbove</subtype></Fermata>' + chord('G4', 'h.', ['be-low', '-ful voice'])
           + '<BarLine><subtype>end</subtype></BarLine>',
    }[m]


def alto(m):
    gap = '<location><fractions>1/4</fractions></location>'
    return {
        0: chord('F#4', 'q'),
        1: chord('F#4', 'q') + gap + chord('G4', 'q'),
        2: chord('F#4', 'h') + chord('E4', 'q'),
        3: chord('D4', 'q') + tied('D4', 'h', 'start', TIE_TO_NEXT_BAR),
        4: tied('D4', 'q', 'stop', TIE_FROM_PREV_BAR) + chord('D4', 'q') + chord('E4', 'q'),
        5: chord('D4', 'h') + rest('q'),
        6: chord('E4', 'q') + chord('D4', 'q') + chord('D4', 'q'),
        7: chord('D4', 'h.'),
    }[m]


def tenor(m):
    return {
        0: chord('D4', 'q'),
        1: chord('A3', 'q') + chord('A3', 'q') + chord('D4', 'q'),
        2: chord('D4', 'h') + chord('C#4', 'q'),
        3: chord('A3', 'h.'),
        4: chord('G3', 'h.'),
        5: chord('A3', 'h') + rest('q'),
        6: chord('A3', 'q') + chord('G3', 'q') + chord('F#3', 'q'),
        7: chord('B3', 'h.') + '<BarLine><subtype>end</subtype></BarLine>',
    }[m]


def bass(m):
    return {
        0: chord('D3', 'q'),
        1: chord('D3', 'q') + chord('E3', 'q') + chord('G3', 'q'),
        2: chord('D3', 'h') + chord('A2', 'q'),
        3: chord('D3', 'h.'),
        4: chord('G2', 'h.'),
        5: chord('D3', 'h') + rest('q'),
        6: chord('A2', 'q') + chord('B2', 'q') + chord('D3', 'q'),
        7: chord('G2', 'h.'),
    }[m]


def staff(sid, v1, v2):
    out = [f'<Staff id="{sid}">']
    if sid == 1:
        out.append('<VBox><height>10</height><Text><style>Title</style><text>Old Hundredth Test</text></Text></VBox>')
    for m in range(8):
        attr = ' len="1/4"' if m == 0 else ''
        flags = '<irregular>1</irregular>' if m == 0 else ''
        flags += '<startRepeat/>' if m == 1 else ''
        flags += '<endRepeat>2</endRepeat>' if m == 5 else ''
        out.append(f'<Measure{attr}>{flags}<voice>{head(m, sid)}{v1(m)}</voice><voice>{v2(m)}</voice></Measure>')
    out.append('</Staff>')
    return ''.join(out)


def main():
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
<programVersion>3.6.2</programVersion>
<programRevision>3224f34</programRevision>
<Score>
<LayerTag id="0" tag="default"></LayerTag>
<currentLayer>0</currentLayer>
<Division>480</Division>
<Style><Spatium>1.75</Spatium></Style>
<showInvisible>1</showInvisible>
<showUnprintable>1</showUnprintable>
<showFrames>1</showFrames>
<showMargins>0</showMargins>
<metaTag name="composer">Louis Bourgeois</metaTag>
<metaTag name="workTitle">Old Hundredth Test</metaTag>
<Part>
<Staff id="1"><StaffType group="pitched"><name>stdNormal</name></StaffType><bracket type="1" span="2" col="0"/><barLineSpan>1</barLineSpan></Staff>
<Staff id="2"><StaffType group="pitched"><name>stdNormal</name></StaffType><defaultClef>F</defaultClef></Staff>
<trackName>Choir</trackName>
<Instrument>
<longName>Choir</longName>
<shortName>Ch.</shortName>
<trackName>Choir</trackName>
<minPitchP>36</minPitchP><maxPitchP>84</maxPitchP><minPitchA>36</minPitchA><maxPitchA>84</maxPitchA>
<instrumentId>voice.choir</instrumentId>
<clef staff="2">F</clef>
<Articulation><velocity>100</velocity><gateTime>100</gateTime></Articulation>
<Channel><program value="52"/><synti>Fluid</synti></Channel>
</Instrument>
</Part>
{staff(1, soprano, alto)}
{staff(2, tenor, bass)}
</Score>
</museScore>
'''
    sys.stdout.write(xml)


if __name__ == '__main__':
    main()
