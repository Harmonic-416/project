# Guitar exercise studio review

Implemented on `feat/guitar-polish-loop`. Preview: http://127.0.0.1:5180/ → Guitar → Exercises.

## Selection and research

Selected three complementary skills for Harmonic's existing open-chord curriculum. This is a product-fit choice, not a claim of an industry-wide ranking.

- **Name that shape:** eight untimed diagram recognition questions with a chosen chord pool, retries, hints, sound on request and review.
- **Build a chord:** rebuild every string position, including muted/open strings; check explicitly, correct individual strings and revisit missed shapes.
- **Rhythm studio:** quarter-note down-strums, half-note space, alternating eighths and an offbeat pattern. Four count-in beats and four practice bars; adjustable tempo; tap/keyboard by default with optional on-device muted-string detection.

[Yousician's official Tools guide](https://support.yousician.com/hc/en-us/articles/4419296622993-Tools-tab) describes diagram quizzes and rebuilding chord shapes. [Fender's official strumming course](https://www.fender.com/play/guitar/collections/week-1-practice-exercises/courses/set-good-habits-strumming?course-number=2) uses note-value strumming drills. These informed the exercise choices; Harmonic's implementation uses its own diagrams, colors, lesson pool and interaction flow.

Existing Ear training remains available. New results are held only for the current activity visit and do not unlock lessons or write backend progress. Missed chord shapes are weighted for extra practice within that visit. Rhythm scoring uses the existing timing tolerance; extra strikes reduce the result, so playing through rests is not rewarded. Arrows teach direction; microphone scoring measures timing, not down/up direction or chord correctness.

## Verification

- App tests: 94 files passed, 3 skipped; 732 tests passed, 7 skipped. Includes 12 new logic and interaction checks.
- App lint and production build passed. Vite reports its existing large-bundle advisory.
- Baseline assertions and diff whitespace checks passed.
- Protected-file hashes match the saved manifest; specs and frozen audio/detection files were not changed.
- Browser: wrong/correct quiz feedback; complete six-string C major check; optional chord audio startup without an error; rhythm count-in through automatic results; pattern changes; responsive layouts at 1280×800, 1024×700, 768×1024 and 390×844.
- Physical guitar microphone accuracy was not measured. Permission cancellation, audio failures, timing, keyboard strikes and cleanup are covered by automated tests.

Screenshots: `hub.jpg`, `name-that-shape.jpg`, `build-a-chord.jpg`, `rhythm-studio.jpg`, `rhythm-tablet.jpg`, `rhythm-phone.jpg`.

Unrelated pre-existing backend/config/spec/document/migration work was left untouched. No database changes, commit or push were performed for this task.
