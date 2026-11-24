# Tasks

The cross-app onboarding change was implemented outside the Guitar-only iteration loop, as described in the proposal. (M) is must and (S) is should.

## 1. onboarding

- [x] 1.1 (M) `app/src/ui/onboarding/onboardingStore.js`: read and write `harmonic.onboarding.v1` (`welcome`, `seen`, `micAccepted`), with `isSeen`, `markSeen`, `resetTips`, `setWelcome` and `shouldShowWelcome(url)` (false when a shared-attempt or invite parameter is present). A missing or corrupt record reads as empty, and a failed write never throws.
  Verified by: `app/tests/onboardingStore.test.js` (round-trip, corrupt JSON → empty, write failure tolerated, link suppresses welcome).
- [x] 1.2 (M) `app/src/ui/onboarding/tips.js`: the catalogue in design.md (13 entries), each with a title and a body of at most two sentences, plus `STUCK_MS = 30000`.
  Verified by: a catalogue test checking that ids are unique, every body is at most two sentences, and each Guitar Songs / song-modes / Learn tip has its Vocal pair.
- [x] 1.3 (M) `OnboardingProvider.jsx` + `useTip(id, { anchorRef, ready })`: one tip at a time (queue), no tip while `busy` (run counting in, playing or listening), help-requested tips shown even if seen.
  Verified by: provider tests (two eligible tips → one shown, the second after closing; `busy` defers a due tip until cleared; a seen tip does not reopen).
- [x] 1.4 (M) `Tip.jsx` + `Tip.css`: an anchored popover with no backdrop and `role="note"`, polite announcement, **Got it**, close button, and Escape. It is positioned from the anchor rect, re-measured on resize and scroll, hidden while the anchor is off-screen, and docks as a bottom sheet below the narrow breakpoint. Tokens only.
  Verified by: component test (Escape and Got it close and mark seen; controls under the tip still receive clicks; no focus moved on open). The gate's hex-literal check stays green.
- [x] 1.5 (M) `MicPrimer.jsx` + `primeMicrophone()`: resolves at once when permission is `granted` or previously accepted; otherwise shows the card (Allow / Not now), or settings directions when `denied`.
  Verified by: tests with `navigator.permissions` stubbed to granted / prompt / denied / absent, asserting `getUserMedia` is never called by the primer itself and that Not now resolves false.
- [x] 1.6 (M) `Welcome.jsx` on `<dialog>`: four area lines, Guitar / Voice / Just look around, close and Escape dismiss; records `done` or `dismissed`.
  Verified by: component test for each choice's callback and both dismissals.
- [x] 1.7 (M) `HelpControl.jsx`: "?" button with a menu (this screen's tip, Replay welcome, Reset tips) and the stuck dot, which is announced once and has no animation under `prefers-reduced-motion`.
  Verified by: component test (menu actions call the provider; the dot renders from `stuck`; no tip opens from the dot alone).
- [x] 1.8 (M) Stuck timer in the provider: starts on surface mount, `markActive()` clears it, and expiry sets `stuck` only.
  Verified by: a fake-timer test (29 s → no dot, 30 s → dot, main action → cleared, nothing else dispatched).
- [x] 1.9 (M) Shell: mount `OnboardingProvider` in `App.jsx` and show `Welcome` when `shouldShowWelcome`. Guitar routes to the Tuner view, Voice to Vocal Learn's warm-up, and look-around to Home. `GuitarTab` takes an initial view and `VocalTab` an initial section.
  Verified by: an App test (first open → welcome; shared-attempt URL → no welcome; Guitar choice lands on the Tuner).
- [x] 1.10 (M) Help control in `tabs/shared/PracticeHeaderControls.jsx`, in the same position on both instruments.
  Verified by: a test rendering both tabs and finding the "?" in the header of each.
- [ ] 1.11 (M) Guitar wiring: `useTip` anchors for `guitar.songs`, `guitar.song.modes`, `guitar.song.section`, `guitar.learn`, `guitar.learn.lesson`, `guitar.exercises` and `guitar.tuner`; `busy` set from the song and lesson run state; `markActive` on each main action; `primeMicrophone()` in front of Wait for me / Trouble spots Play, lesson Start and the tuner's start. No frozen file is edited.
  Verified by: tests (first visit to Guitar Songs shows its tip; no tip during a playing run; Play in Wait mode on a fresh browser shows the primer before any listener starts). The app-wide gate must pass, including the frozen-file step.
- [ ] 1.12 (M) Guidance never gates: a test closes the welcome and every tip unread, then opens each Guitar section, a lesson and a song mode, and asserts that the soft gate's Hint, Skip and Unlock anyway are present and the lesson position is unchanged by opening and closing a tip.

## 2. Vocal, Home, and Social

- [x] 2.1 (M) Vocal wiring: `vocal.songs`, `vocal.song.modes`, `vocal.learn`, `vocal.compose` tips; `busy` from vocal run state; `primeMicrophone()` before the record and warm-up starts.
  Verified by: the Vocal Wait for me primer and listening-state tests in `app/tests/onboarding.test.jsx`. Vocal warm-up plays a guide track, so it only primes the microphone in activities that listen.
- [x] 2.2 (M) Home and Social: `home.overview` and `social.overview` tips, plus teaching empty states for "Working on", practice sessions, friends and My Files. Cloud-only actions are hidden when signed out, with a sign-in line instead.
  Verified by: tests for each empty view signed in and signed out.
- [x] 2.3 (M) Parity check: the welcome, tips, primer, help control and stuck dot look and behave the same on Guitar and Vocal.
  Verified by: one test rendering the paired tips on both tabs and comparing the component and placement. Manual check at the narrow and wide breakpoints.

## 3. Integration

- [x] 3.1 (M) `bash scripts/gate.sh --onboarding` passes, including `npm run ci`, the frozen-file checks, and the test-count check.
- [ ] 3.2 (M) Manual first-run pass in a fresh browser profile, on desktop Chrome and on a tablet-width window: welcome → Guitar → Tuner tip → mic primer → tune → Songs tip → open a song → modes tip → Wait for me primer skipped (already allowed) → stuck dot after 30 s idle → "?" shows the tip again → Reset tips works.
- [ ] 3.3 (S) Decide the open questions in design.md (account sync, F# id, Voice's first step, the stuck threshold).

## Verification notes

- Guitar Wait for me waits for primer approval before calling the listener. The app-wide onboarding gate passed all six steps, including the 850-line size check and the frozen-file check.
- Lesson coverage checks that dismissing the tip preserves the chord and the available soft-gate actions. The full section-by-section walkthrough remains open.
- Chrome verified both welcome destinations, the shared help placement, and tip layout at desktop, tablet, and narrow widths. The full hardware microphone and instrument pass remains open.
