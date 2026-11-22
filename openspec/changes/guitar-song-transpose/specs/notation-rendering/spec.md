## Purpose

Keep displayed guitar pitches and synthesized playback consistent under a uniform shift.

## ADDED Requirements

### Requirement: Uniform semitone shift for guitar playback and notation

Guitar Songs SHALL apply the selected semitone shift to standard notation and synthesized pitched playback, including included accompaniment. For fret-based parts it SHALL display the adjusted string tuning and preserve the written string and fret assignments. It SHALL preserve timing, bar positions, and unpitched percussion. Unsupported shifts SHALL leave the previous setup intact.

#### Scenario: Practice a semitone down

- **WHEN** the player selects −1 for a song with an open low E string
- **THEN** the tab still shows fret zero on that string, the displayed tuning and sounding notation reflect E-flat, and synthesized playback sounds a semitone lower
