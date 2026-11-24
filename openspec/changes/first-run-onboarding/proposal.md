# First-run Onboarding and Feature Tips

## Why

Harmonic has grown into four areas (Home, Guitar, Vocal, Social), each with several sections and three practice modes, and nothing in the app tells a first-time player what any of it is for. The only first-use guidance shipped today is the "Tune first?" banner above guitar Songs (`TuneUpPrompt`, F39). A new player lands on Home with no idea that the Guitar tab has a tuner, that Wait for me waits for them, or that the microphone is how they get judged. When they get lost later, there is nowhere to ask.

The research we looked at (NN/g's tutorial study; tour-completion benchmarks from Chameleon and Appcues; Yousician, Fender Play, Simply Guitar, Duolingo, Figma and Notion) points the same way. Up-front slide decks do not help people perform tasks and make apps feel harder. Short tours that the user starts finish far more often than long ones that open by themselves. What works is:

- one short choice up front;
- the setup step taught as the first real activity;
- a reason given right before the microphone is requested;
- a single contextual tip the first time someone reaches a feature;
- a help control that replays any of it on demand.

This change takes the simplest version of each.

## What Changes

- **Welcome (one screen, not a deck):** on the first open of the app, one screen names the four areas in a line each and asks "What do you want to practise?" with **Guitar**, **Voice** and **Just look around**. Guitar opens the Tuner; Voice opens the Vocal warm-up (each instrument's setup step, taught as the first activity, as Simply Guitar does). Just look around goes to Home. It can always be skipped, and it can be replayed from the help control. It never interrupts a shared-run or invite link.
- **Microphone priming:** the first time a player starts anything that listens, a short card first says what the microphone is for and that live audio never leaves the device. It offers **Allow microphone** and **Not now**. If the browser has blocked the microphone, the card says how to turn it back on instead of failing silently.
- **Feature tips:** each core surface (listed in design.md) has exactly one tip of one or two sentences: what this is and the first thing to do. A tip shows the first time the player reaches that surface, anchored to the control it describes. It never blocks the screen, closes with **Got it**, and is not shown again. At most one tip is visible at a time, and no tip opens during a live run.
- **Help control ("?"):** a button in the header both instruments already share (beside sound and streak) shows the current screen's tip again and offers **Replay welcome** and **Reset tips**. When a player seems stuck (on a practice surface for 30 seconds without taking its main action), the button gains a small dot. The dot does not open anything by itself.
- **Empty states that teach:** the empty "Working on", practice-sessions, friends and My Files views each say what will appear there and offer the one action that fills them.
- Tips and the welcome are one shared component set in `app/src/ui/`, with the same shape on both instruments. Seen and dismissed state is kept in this browser (localStorage), works signed out, and needs no backend.

## Capabilities

### New Capabilities

- `onboarding`: the first-run welcome and instrument choice, microphone priming, one-time feature tips, the help control with its "stuck" indicator, teaching empty states, and the per-browser record of what has been seen.

### Modified Capabilities

None. The F31 lesson **Hint** (`ui`) is a different thing and keeps its name and behaviour; onboarding calls its guidance *tips* so the two never get confused.

## Impact

- **New code:** `app/src/ui/onboarding/`, containing the welcome, tip, mic-priming card, help control, the tip catalogue, and the seen-state store, with tests in `app/tests/`.
- **Changed code:**
  - `App.jsx` (shows the welcome, routes the instrument choice);
  - `tabs/shared/PracticeHeaderControls.jsx` (hosts the help control);
  - the surfaces that anchor a tip or show an empty state: Guitar and Vocal section views, Home, Social;
  - the Start and Play buttons that first open the microphone, which get priming before they call the existing listeners.
- **Not touched:**
  - the frozen listening files (`useGuitarListener.js`, `useLessonListening.js`, `app/src/audio/`) — priming runs before they are called, never inside them;
  - `src/lib/`, `worker/`, migrations.
- **No new dependencies:** no tour library; the components are hand-written.
- **Loop scope:** this change spans Home, Vocal, Social and the shell, which sit outside the current Guitar-only loop scope in CLAUDE.md (gate step 5). It needs a human to widen that scope for the change, or to implement it outside the loop.
- **Requirement id:** no F#/N# for onboarding exists, so the requirements carry none until one is assigned.

## Non-goals

- Anything on the v1 OUT list: CV finger placement (F25), live group sessions (F26, shipped as asynchronous sharing), YouTube play-along scoring (F27), piano. Changes mode (F38) is already built and is only *described* by a tip here.
- A multi-step guided tour or welcome carousel. The research says they underperform, and this change deliberately has one welcome screen.
- A mascot, video lessons or a personalised learning path questionnaire (level, genre, goals).
- Syncing seen tips to the account. That needs a migration; this change is local-only, and syncing stays an open question in design.md.
- Changing the soft gate, the F31 Hint, or anything the microphone judges. Onboarding never advances a lesson and never starts listening on its own.
