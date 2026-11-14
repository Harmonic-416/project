# Harmonic — agent instructions

Music-practice PWA. Two instruments (guitar, voice), one app. Live microphone judging runs **on the
device**. React 19 + Vite front end, Supabase as the only backend service, one Node worker for the
arranger.

## Commands

```bash
npm run ci                  # lint + typecheck + backend tests + app lint + app tests + app build
npm --prefix app test       # app tests only (vitest)
npm --prefix app run lint   # oxlint
npm test                    # backend tests only
bash scripts/gate.sh        # THE GATE — must be green before any commit
bash scripts/gate.sh --fast # same, without the app build, while iterating
```

This is a Windows machine. Run the gate through `bash` (Git Bash is installed);
`./scripts/gate.sh` does not work from PowerShell, and `chmod` does not exist here.

## Layout

| Path | What |
|---|---|
| `app/src/tabs/{guitar,vocal,home}/` | the four tabs |
| `app/src/ui/` | **shared presentation components** — anything used by both instruments |
| `app/src/styles/tokens.css` | the only place a colour, spacing step, radius or breakpoint is defined |
| `src/lib/` | the TypeScript layer that talks to Supabase from the browser. There is no API server |
| `app/tests/*.test.js` | app tests live here, **not** beside sources |
| `tests/backend/` | backend tests, run against a local Supabase stack |
| `openspec/specs/<capability>/spec.md` | the contract. **Read-only.** |
| `worker/arranger/` | the one process that runs outside the browser |

Import alias: `@backend/*`. Lint is oxlint; tests are vitest.

## Invariants — inviolable; changing one requires a human decision, not a commit

1. **Live audio never leaves the device.** Only finished runs, their recordings and progress upload.
2. **Scoring never branches on instrument.** Analyzers emit one normalized event shape; the scoring
   engine must not know which produced it.
3. **One transport clock.** Playback, cursor, judging and the metronome read one score, so changing
   tempo never moves a note.
4. **The soft gate always offers a way out.** Hint, Skip and Unlock anyway are always present, and
   the microphone never advances a lesson on its own. There is **no auto-skip** — it was removed on
   purpose after testing.
5. **Right over fast.** Never emit a verdict on noise, a click or a ringing string, even if that
   makes the verdict slower. A strum settles for 0.2 s; a note must ring 0.3 s before judgement.
6. **A run never goes out silent.** Sending a run waits for its recording to upload.
7. **One app, not two.** Any control, summary, history view or share surface that exists for one
   instrument must have the same shape for the other. Shared components go in `app/src/ui/`, never
   inside one instrument's folder. While the loop is guitar-scoped (below), guitar is the
   **reference implementation**: build the shape you would want both tabs to have, because vocal
   will be brought up to it afterwards. Do not reach into vocal to do it.

## Scope — Guitar: Songs, Learn, Exercises

The current iteration cycle touches the Guitar tab only. Writable:

```
app/src/tabs/guitar/GuitarTab.*
app/src/tabs/guitar/song/**        (including song/follow/, minus the frozen files)
app/src/tabs/guitar/learn/**
app/src/tabs/guitar/exercises/**
app/src/tabs/guitar/practice/**    (this IS Learn's implementation)
app/src/tabs/guitar/notation/**
app/src/styles/tokens.css
app/tests/**
fix_plan.md, loop-log.md
```

Out of bounds: vocal, home, social, fretboard, tuner, `src/lib/`, `worker/`.
`scripts/gate.sh` step 5 fails the build if a diff touches them. If an item seems to need one, it is
misclassified: mark it `BLOCKED` and stop.

**Frozen files, listed in `scripts/frozen-files.txt`** — readable, never writable. These carry
behaviour tuned by ear against real playing (`noteJudge.js`, `waitListening.js`, `listenWindows.js`,
`troubleTracker.js`, `waitState.js`, `easyMode.js`, `songClock.js`, `useGuitarListener.js`,
`matchTranscription.js`, `refineWithBasicPitch.js`, `chordDetect.js`, `useLessonListening.js`,
`strumHearing.js`, and all of `app/src/audio/`). A loop cannot tell whether a change to them made
real playing better, and no test will catch it.

It is a **file** list, not a folder freeze, on purpose: `song/follow/` also holds the mode screens,
the loop/seek player commands (`playerControls.js`) and `GuitarFollow.css`, all of which polish work
legitimately needs. Changing a mode screen is allowed; changing a threshold inside one is not.

## Never touch

- `supabase/migrations/**` — CD applies these to the **live** project on merge to `main`
- `.github/workflows/**`, `vercel.json`, `package-lock.json`
- `openspec/specs/**` — the contract. When it is wrong, write a spec-change request and stop
- `harmonic-design-document/**` — graded artifacts
- the files in `scripts/frozen-files.txt` — tuned by ear against real playing (see Scope above).
  This is a file list, not a folder freeze: the rest of `song/follow/` is writable
- `app/src/audio/` — the shared capture

## Conventions

- No new features. Every task is parity, consistency, continuity or correctness against a spec that
  already exists.
- Search before writing: a component that does this probably exists already.
- No placeholders, no `TODO`, no commented-out code left behind.
- New logic gets a test in `app/tests/`. The gate enforces that the test count never drops.
- Colours, spacing and breakpoints come from `tokens.css`. A hex literal in any other file fails the
  gate.
- Comments explain *why*, and the codebase's existing comments are thorough — match that register.
