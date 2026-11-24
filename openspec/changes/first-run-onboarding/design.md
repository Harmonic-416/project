# Design: First-run Onboarding and Feature Tips

## Context

Onboarding reaches across the app shell (`App.jsx`), both instrument tabs, Home and Social, and it must stand in front of the microphone without touching the listening code that is frozen (`useGuitarListener.js`, `useLessonListening.js`, `app/src/audio/`). The one shipped precedent is `TuneUpPrompt` (F39): a non-blocking banner with two buttons and a dismissal remembered per session. That is the register this change follows: small, polite, always escapable.

## Goals / Non-goals

**Goals:** one welcome screen, a reason before the mic prompt, one tip per core surface, a "?" that replays them, a passive stuck indicator, teaching empty states. All of it local, the same on both instruments, and never in the way of practice.

**Non-goals:** a tour engine, a carousel, account sync, analytics, personalisation questions (see proposal).

## Decisions

### 1. One provider, one store, one catalogue — all in `app/src/ui/onboarding/`

- `onboardingStore.js` holds the seen-state as pure functions over a versioned localStorage record, `harmonic.onboarding.v1` = `{ welcome: 'done' | 'dismissed' | null, seen: string[], micAccepted: boolean }`. Unreadable JSON or a missing key reads as the empty record. Every write is wrapped so that a storage failure (private mode, quota) leaves the app running.
- `tips.js` is the catalogue: `{ id, surface, instrument: 'guitar' | 'vocal' | null, title, body, mainAction }`. Text lives here only. The components never branch on instrument (invariant 7).
- `OnboardingProvider.jsx` is mounted once in `App.jsx`. It exposes `useTip(id, { anchorRef, ready })`, `primeMicrophone()`, `markActive()` (for the stuck timer), and the help-menu actions. It also enforces "one tip at a time": a queue keyed by surface, plus a single `busy` flag that runs set while counting in, playing or listening.

*Alternative rejected:* a tour library (React Joyride, Driver.js). It is a new dependency, which the project forbids inside a change. It is also built around sequential tours, the pattern the research advises against.

### 2. Tips are anchored popovers, not overlays

A tip renders beside its anchor with no backdrop, using `position: fixed` coordinates from the anchor's `getBoundingClientRect()`, recomputed on resize and scroll. Below the narrow breakpoint in `tokens.css`, it docks as a bottom sheet instead. It is announced as a polite live region, with `role="note"` labelled by its title. It does not take focus, so typing and playing keep working, but **Got it** is reachable by Tab and Escape closes it. All colours, spacing and the breakpoint come from `tokens.css`; there are no hex literals.

*Why not a dimmed spotlight:* it blocks the screen, which the spec forbids, and NN/g found coach-mark overlays make apps feel harder.

### 3. Microphone priming wraps the button, never the listener

The frozen hooks own `getUserMedia`. Priming happens one step earlier, in the click handler of the control that starts listening (Wait for me / Trouble spots Play, a lesson's Start, the Vocal record and warm-up starts):

```
onClick = async () => { if (await primeMicrophone()) start() }
```

`primeMicrophone()` resolves `true` without showing anything when:
- `navigator.permissions.query({ name: 'microphone' })` reports `granted`, or
- the store says the card was already accepted in this browser (for Safari, where that query is unavailable).

Otherwise it shows the card and resolves on Allow (`true`) or Not now (`false`). A `denied` state shows the settings directions instead. The listener is then started exactly as today, so its thresholds and timing are untouched.

### 4. "Stuck" is idleness on a practice surface, and only lights the "?"

Each practice surface declares its main action. The provider starts a 30-second timer when the surface mounts and clears it on `markActive()`, which the main action calls. On expiry, it sets a `stuck` flag that the help control renders as a dot, with a one-time polite announcement. Nothing opens by itself, which honours the soft-gate spirit: guidance offers, it never acts. 30 seconds is a starting value kept in one constant (`STUCK_MS`), to be tuned after real use.

*Alternative rejected:* re-opening a dismissed tip when stuck. It interrupts, and it contradicts "never reappears automatically".

### 5. The welcome is a modal `<dialog>`, the only modal

The welcome uses the native `<dialog>`, the same element as the section picker's dialogs. It is modal because it is the one moment the player has nothing else to do yet. Escape and the close button dismiss it. `App.jsx` shows it only when the record's `welcome` is null and the URL carries no shared-attempt or invite parameter; `App.jsx` already reads both with `readSharedAttemptId` and `readInviteCode`. The choice routes through the existing `setActiveTab` with a target section. This needs the Guitar tab to accept an initial view (Tuner) and the Vocal tab an initial section (Learn, on the warm-up).

### 6. The help control lives in `PracticeHeaderControls`

`tabs/shared/PracticeHeaderControls.jsx` is already the one header block both instruments render. It is the natural home for "?", and placing it there guarantees the same position on both tabs. Home and Social use the same help control in their own page headers. Home subpages keep help available beside their page title.

## Tip catalogue (first cut — the text is the implementer's to polish)

| id | Surface | Anchor | Main action (for "stuck") |
|---|---|---|---|
| `home.overview` | Home | streak / "Working on" | open a song |
| `guitar.songs` | Guitar Songs library | the song list | open a song |
| `guitar.song.modes` | Guitar song: mode cards | Listen / Wait for me / Trouble spots | Play |
| `guitar.song.section` | Guitar song: Practice section | the section picker | — (not a practice surface) |
| `guitar.learn` | Guitar Learn list | the lesson list | open a lesson |
| `guitar.learn.lesson` | A guided lesson | Hint / Skip / Unlock anyway | Start |
| `guitar.exercises` | Guitar Exercises | the exercise list | open an exercise |
| `guitar.tuner` | Tuner | the string readout | play a string (tuner listening) |
| `vocal.songs` | Vocal Songs library | the song list | open a song |
| `vocal.song.modes` | Vocal song: mode cards | Listen / Wait for me / Trouble spots | Play |
| `vocal.learn` | Vocal Learn | the course list | open an activity |
| `vocal.compose` | Vocal Compose | the arrange panel | start an arrangement |
| `social.overview` | Social | friends / shared runs | — |

The guitar and vocal Songs, song-modes and Learn rows are deliberate pairs (invariant 7).

## Additional surfaces

The same catalogue and components also cover Home’s files, activity, working list and account views, both song searches and session histories, Guitar transcription and fretboard, individual Guitar exercises and strum practice, and the Vocal warm-up, pitch, harmony, rhythm, and solfège activities.

## Risks / Trade-offs

- **Tip fatigue.** Thirteen tips is a lot over a first week. Mitigations: one at a time, none during runs, and each shown only on first reach. If testing shows fatigue, the catalogue is the single place to cut.
- **Anchors that move.** The song workspace re-lays out on resize and its side panel scrolls. Tips re-measure on resize and scroll, and hide while their anchor is out of view.
- **Safari permissions.** Without `navigator.permissions`, a player who granted the mic in another session may see the card once more in a new browser profile. This is acceptable, and the store remembers acceptance.
- **Loop scope.** Implementation touches files outside the Guitar-only scope (see proposal Impact). The tasks are ordered so the shared pieces and Guitar wiring come first, while the Vocal, Home and Social wiring is grouped for a human to unlock.

## Open Questions

1. Should seen-state sync to the account (a column on the profile, so a second device doesn't replay tips)? This needs a migration, so it is deferred.
2. Which F#/N# id should onboarding carry? None exists in the requirements today.
3. Is the Vocal warm-up the right first step for Voice, or should Voice open Songs like Guitar Songs?
4. Is 30 s the right stuck threshold? Tune it after watching real first sessions.
