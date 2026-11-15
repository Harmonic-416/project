# Vocal tab: what singers want from practice tools

*Research notes, 2026-11-15. Scope: hobby singers, choir and a cappella members, voice students. Focus: (1) how on/off-pitch feedback is shown while singing, (2) reading sheet music on screen while singing.*

**Method and caveats.** I read Reddit threads in r/singing and r/Choir (through the Arctic Shift Reddit archive, since reddit.com blocks automated fetches), the Hacker News "OnKey" thread (237 points, 108 comments), App Store reviews, forums (Sing.Salon for Smule, EarMaster, MuseScore), barbershop and choir-practice guides, and two peer-reviewed studies. Many app-comparison blogs are written by competing apps (Singing Carrots, Pitch Pilot, Vocal Habit). I only use those for feature descriptions, never as evidence of what users complain about. I did not find any r/acappella or r/choralmusic threads worth citing (the archive timed out on those).

**Harmonic today (from the code, for context).** The live `PitchMeter` is a tuner lane: a ±200¢ range, a 50¢ in-tune band, "close" up to 100¢, and an octave fold that says "Right note, other octave". The pitch trail drawn on the score (`audio/useSheetOverlay.js`) *assumes a treble clef*. Part practice is `PartTabs` plus a two-way "By myself / With all parts" toggle. There is tempo control and a count-in. There is no loop, no song transposition and no per-part volume.

---

## (a) Top 10 pain points (ranked by frequency × intensity)

**1. Octave errors: "it says I'm wrong when I sing it an octave down."** This is the most common complaint, and the most corrosive to trust.
- Yousician singing: "it has trouble listening to the notes because i've an octave lower then the note it wants me to hit which should be fine but it says the note is wr[o]ng" ([r/singing](https://reddit.com/r/singing/comments/awt1fw/yousician_now_has_singing/)).
- "I was misled by the Nail the Pitch app… It apparently measures things an octave higher at times. In my case, nearly every time." ([r/singing](https://reddit.com/r/singing/comments/1r2xh5l/i_was_misled_by_the_nail_the_pitch_app_i_regret/))
- Simply Sing: "It says I'm a bass when I'm clearly a tenor… always registered too high" ([App Store](https://apps.apple.com/us/app/id1592900217?see-all=reviews)).
- OnKey's author: "sometimes it gets a note an octave off", so the app "intentionally ignores octaves when scoring so that you can sing inside of your range" ([HN](https://news.ycombinator.com/item?id=50195488)).

**2. Scores that feel arbitrary or too generous, so nobody trusts them.**
- Smule: "I deliberately sang out of tune and had the same score." "If you harmonize, it may give you a low score, even though you may sound like a dream." ([Sing.Salon](https://sing.salon/forums/topic/783-smule-score-what-is-it-and-how-do-they-arrive-at-this-score/))
- OnKey: "the app keeps saying to the singer GREAT and PERFECT but the coordination is all over the place" ([HN](https://news.ycombinator.com/item?id=50195488)).
- Nail the Pitch: "The app is lenient—it says that both out-of-tune notes AND in-tune notes are in-tune" ([r/singing](https://reddit.com/r/singing/comments/1vadn9a/ive_got_a_question_i_use_nail_the_pitch_to_see/)).
- Simply Sing was "pretty much impossible to fail", yet it will also "ding your score for singing what it hears as the 'wrong' notes" ([American Songwriter](https://americansongwriter.com/simply-sing-review/)).

**3. A display that snaps to the nearest note looks like "correct".** The Nail the Pitch developer had to explain this publicly: "The orange block simply shows the note closest to that pitch… It should not be interpreted as confirmation that the note is in tune. To determine whether you are on pitch, you first need to know which note you are intending to sing." A commenter added: "the blocks make it look like you started on an G# and ended on an F#. A quarter tone is still pretty significantly out of key" ([r/singing](https://reddit.com/r/singing/comments/1vadn9a/ive_got_a_question_i_use_nail_the_pitch_to_see/)). In short, a pitch display without a target and a direction actively misleads.

**4. The indicator jitters, picks up noise, and falls to the bottom when you stop.** "the pointer is still jumping up and down by over an octave"; "when I want to take a pause… it moves all the way down to octave 0"; "kept picking up my heating vent as an A0". Requests include "a sensitivity adjuster" and "a pause button so I can go back and see what notes I hit" ([Nail the Pitch reviews](https://justuseapp.com/en/app/1486640549/nail-the-pitch-vocal-monitor/reviews)). In a controlled UI test, users rated a *steadier* indicator (larger buffer, about 190 ms update) higher than the most responsive one ([Lin et al., ICMC 2014](https://speech.di.uoa.gr/ICMC-SMC-2014/images/VOL_2/1693.pdf)).

**5. The song is in the wrong key for my voice.**
- "as a contralto is kinda impossible to sing along sometimes" ([r/singing](https://reddit.com/r/singing/comments/1wn4c1g/do_you_use_any_apps_to_practice_singing/)).
- "Support transposition and maybe a range finder…" ([HN](https://news.ycombinator.com/item?id=50195488)).
- Adjusting the key "helped me move from thinking I was Alto to realizing I was a Mezzo!" ([App Store](https://apps.apple.com/us/app/id1592900217?see-all=reviews)).
- Auto-picked keys can still be wrong: Simply Sing chose a key from a female demo, and the reviewer lowered it again ([American Songwriter](https://americansongwriter.com/simply-sing-review/)).

**6. "Learn my part" needs my part *louder*, not alone.**
- "A single vocal part isn't all that helpful when they arrive in rehearsal and suddenly hear all the other voices… We do part dominant over the other voices and accompaniment. Yes, with metronome (not too loud!!)" ([r/Choir](https://reddit.com/r/Choir/comments/1hqxiw9/what_are_useful_variations_of_practice_tracks/)).
- Another singer: "I use a part dominant track… when learning, then… a balanced voices track when I am more confident" (same thread).
- "The ability to playback & alter the volume on different parts is so helpful" ([r/Choir](https://reddit.com/r/Choir/comments/1woacrw/app_that_can_teach_my_harmony_line/)).
- The Barbershop Harmony Society's method moves from your part alone, to the full mix, to *the other parts only* while you sing yours ([barbershop.org](https://www.barbershop.org/using-learning-tracks-effectively)).

**7. I can't slow down, loop, or get back to the hard bar.**
- "You used to be able to slow down or speed up the song so you could take the time to learn it" ([App Store](https://apps.apple.com/us/app/id1592900217?see-all=reviews)).
- A voice teacher found "no pause, rewind, or skip ahead options" during lessons ([Singwell](https://singwell.eu/karaoke-apps/)).
- r/singing users run AnyTune "for slowing down and nailing parts of the songs" alongside their pitch app ([r/singing](https://reddit.com/r/singing/comments/1wn4c1g/do_you_use_any_apps_to_practice_singing/)).
- Choir tools treat slow-down plus loop as table stakes ([Soundslice](https://www.soundslice.com/practice-choir/), [PartPerfect](https://partperfect.tech/)).

**8. Watching a meter competes with listening.**
- "Part of the struggle is really listening to yourself, and learning how to pick up on your own mistakes" ([HN](https://news.ycombinator.com/item?id=50195488)).
- "singing into a pitch meter/app isn't going to make you sing in tune, but instead make you squeeze and force the pitch… until the meter reads it as 'in tune'" ([r/singing](https://reddit.com/r/singing/comments/1sz8cbg/how_to_make_pitch_training_fun/)).
- The research agrees. In [Wilson et al. 2008](https://unipub.uni-graz.at/jims/download/pdf/14496257), visual feedback improved pitch accuracy after training, but every group sang *less* accurately *while* watching it, because of the extra cognitive load.

**9. Reading the score on a screen: too small, scrolling, losing your place.**
- "scrolling notation is just horrendous to read… it will interfere with the user developing 'chunking'… I'd rather see at least four bars of notation stay in place with the caret moving" ([r/Choir](https://reddit.com/r/Choir/comments/1wz5nvh/i_made_a_free_sightreading_trainer_endless_sheet/)).
- MuseScore's player is "too small", and its switch to a scrolling layout made the music "significantly harder to quickly navigate" ([MuseScore forum](https://musescore.org/en/node/339302)).
- Choir singers who don't read music mostly use the score for lyrics and melodic shape, and they warn "don't slip onto the wrong part" at system breaks ([Chris Rowbury](https://blog.chrisrowbury.com/2013/10/how-to-cope-with-sheet-music-if-you.html)).
- One singer re-exports her scores to make "the lyrics bright blue… My old eyes appreciate this" ([r/Choir](https://reddit.com/r/Choir/comments/1woacrw/app_that_can_teach_my_harmony_line/)).

**10. Tolerance that ignores how singing works (vibrato, scoops, cents anxiety).**
- "A lot of the simple 'correct pitch' apps ding you for using vibrato" ([HN](https://news.ycombinator.com/item?id=50195488)).
- "Resonance and vibrato can distort a perfectly warm pitch and make it appear sharp or flat; I NEVER use a tuner" ([r/singing](https://reddit.com/r/singing/comments/1r2xh5l/i_was_misled_by_the_nail_the_pitch_app_i_regret/)).
- Singers stress over "consistently 20 cents sharp". Replies note that "20 cents is the amount most non-musicians can spot something wrong" but also that "Very few notes that people sing are going to be exact down to the cent" ([r/singing](https://reddit.com/r/singing/comments/1umvvxl/consistently_20_cents_sharp/), [r/singing](https://reddit.com/r/singing/comments/7tuv6e/how_many_cents_is_off_pitch/)).

*Honourable mentions:* Bluetooth headphone lag ruins sync and recording ([BandLab](https://help.bandlab.com/hc/en-us/articles/360025805834-Fixing-Bluetooth-Distortion-and-Latency), [Sing.Salon](https://sing.salon/forums/topic/1091-has-anyone-tried-using-apple-airpods-pro-with-smule/)). A synthetic guide voice should favour accuracy over realism: "a neutral 'ah' MIDI track avoids" learning odd pronunciations ([r/Choir](https://reddit.com/r/Choir/comments/1qowfkv/im_building_a_tool_to_generate_singing_voice/)). A detector needs a quiet room ([Singing Start Guide](https://www.singingstartguide.com/simply-sing-review/)).

---

## (b) Ways apps show on-pitch and off-pitch

| Pattern | Who uses it | Pros | Cons |
|---|---|---|---|
| **Karaoke piano roll**: target note bars scroll past, the sung pitch is drawn over them | SingStar/UltraStar ([UltraStar](https://en.wikipedia.org/wiki/UltraStar)), Smule, Yousician, Simply Sing ("similar to… Rock Band"), OnKey | Shows upcoming notes and timing; no notation literacy needed; game-like | Not sheet music, so it doesn't build reading; scrolling motion; lyrics sit apart from the notes |
| **Continuous pitch trail on a grid or keyboard** (a target band may or may not be shown) | Vocal Pitch Monitor, Nail the Pitch, Singscope, Sing&See grid | Gives context (where you've been, the gap to the target). In Wilson et al., the contextual display helped novices most | Jitter; a "nearest note" highlight misreads as correct (pain point 3); needs smoothing |
| **Tuner needle or strip with cents** | Instrument tuners, PartPerfect ("Flat −30c"), Harmonic's `PitchMeter` | Precise and directional; great for held notes and warm-ups | One note at a time with no musical context; numbers feed cents anxiety; eyes leave the score |
| **Highlighted piano key** for the current pitch | Wilson et al. "Keyboard" display, Singing Carrots virtual piano | Familiar to pianists; experienced singers did best with it | Shows no history and no degree of error; weak for novices |
| **Right/wrong colour on the note head or block** | Yousician (binary, per [Singing Carrots](https://singingcarrots.com/blog/yousician-vs-singing-carrots/)), Stackapella ("your notes light up as you hit them", [r/Choir](https://reddit.com/r/Choir/comments/1xixvfj/we_just_launched_stackapella_learn_your_part_by/)), Music Wrench "intonation colors" | Lives *on the score*; near-zero reading cost | Binary feedback has no direction; red/green fails colour-blind users; can feel harsh |
| **Three tiers marked on the staff after the take**: pitch curve, up/down arrows, ✓ / yellow / red | EarMaster: a red arrow means the note "deviated more than a quarter tone"; yellow means "partially correct" ([forum](https://earmaster.com/forum/viewtopic.php?p=15509)) | Directional and graded; given after singing, so no dual-task penalty; teaches the size of the error | Not live; needs a review step |
| **Words or arrows** ("a bit higher", ⇈) | Harmonic, SingStar-style arrow (patent) | Easy to act on mid-phrase | Easily ignored while singing; flickers if it isn't debounced |
| **Trouble-spot list with cents** | PartPerfect ("TROUBLE SPOTS FOUND… flat 30¢") | Turns a take into a to-do list | Only useful if each spot links to loop and replay |
| **Aural feedback**: reference tone, drone, your part alone in one ear | Barbershop practice, pitch pipes, "aural not visual" idea on [HN](https://news.ycombinator.com/item?id=50195488) | Trains the ear without needing a screen | Requires headphones; harder to make "game-like" |

**Tolerances in the wild.** EarMaster calls a note correct within a ¼ tone (50¢) on average. Listeners' just-noticeable difference is roughly 5–10¢, and about 20¢ is audible to most people. Harmonic's 50¢ "in-tune" band is therefore on the lenient end, which is fine for beginners but reads as "lenient" to trained singers.

---

## (c) Recommendations for Harmonic's Vocal tab (prioritized)

### Pitch feedback: top 3

**P1. Put the feedback on the staff in the right clef, and grade each note after it ends.** Make the score itself the main display. Draw a smoothed sung-pitch trail through the target note heads. When each note finishes, mark its head with three tiers: green ✓ (on), amber with an arrow (close: sharp or flat), red with an arrow (off). Use shape plus colour, never colour alone. Demote the separate `PitchMeter` lane to an optional "Tuner" view for warm-ups and held notes. **Fix first:** `useSheetOverlay.js` assumes a treble clef, so bass-clef parts and treble-8 tenor parts get trails drawn at the wrong height. The new TTBB and solo+TTBB arrangements make this the common case.
*Why:* contextual feedback helps novices most (Wilson et al.). EarMaster's arrows-plus-tiers design avoids the "nearest note looks correct" trap (pain point 3). Low voices are the first to break (pain point 1).

**P2. Treat octaves kindly, and say so.** Default to octave-agnostic grading. Show a calm "You're an octave below — that counts" chip, not a warning state. Set the octave once from the voice-part picker or range test (S/A/T/Bar/B) so that targets display in the singer's octave. Store `octaveAgnosticAccuracy` (already computed) as the headline number, with strict octave as an option.
*Why:* this is the number-one complaint across Yousician, Nail the Pitch, Simply Sing and OnKey (pain point 1).

**P3. Make tolerance honest, steady and selectable.** Judge a note on its *median* pitch after a short onset grace period. This ignores scoops and centres vibrato instead of punishing it. Ship three strictness levels and show the active one on screen: **Relaxed** (±50¢, today's behaviour), **Standard** (green ≤25¢, amber 25–50¢), **Choir** (green ≤15¢). Smooth the live trail over about 150–200 ms. Hold the last value or hide the trail in silence rather than dropping it to the floor.
*Why:* pain points 2, 4 and 10; users preferred a stable indicator in the ICMC tests; trained singers distrust lenient apps.

### Song and score screen: top 3

**S1. Keep the systems still and move the cursor.** Use a page or line layout where the current system stays fixed and a cursor moves across it. Swap in the next system before the cursor reaches the end of the line (or show the next line below). Never scroll continuously. Highlight the singer's own staff and dim the others. Render lyrics large and high-contrast, with the current syllable highlighted. Provide fit-width and zoom on phones.
*Why:* pain point 9 (the "chunking" argument, MuseScore complaints, "don't slip onto the wrong part", "lyrics bright blue").

**S2. Replace the "By myself / With all parts" toggle with a part-mix ladder.** Offer four steps: **My part only → My part louder → Others only (I sing mine) → Everyone equal**. Add an expandable per-part volume control and a quiet metronome toggle. Remember the step per song.
*Why:* this matches how choir and barbershop singers actually learn (pain point 6: r/Choir, barbershop.org, Learn My Part's three modes, MuseScore mixer workarounds).

**S3. Add loop, transpose and tempo for the bar you're stuck on.** Drag across bars on the score to loop them. Add a "Loop this" button on every trouble spot. Add key shift (±6 semitones) that moves playback *and* the targets together. Keep the existing tempo control next to them, labelled "Speed".
*Why:* pain points 5 and 7. Loop and slow-down are standard in every choir tool; transposition is the top wish for contraltos and low voices.

### Further recommendations

4. **Make the per-take review the hero, and keep live feedback light.** Add a "focus run" option that hides live meters and shows the graded staff afterwards. Fade live feedback as a singer's accuracy on a song rises. *Evidence:* the dual-task penalty in Wilson et al.; "listen to yourself" (HN); the warning about "squeeze and force" singing (r/singing).
5. **Summarize a take in plain sentences, with actions.** For example: "Flat on the high notes in bars 9–12 (≈ −30¢). [Loop] [Hear target] [Hear me]". Add an A/B button that plays your take and the reference at the same spot. *Evidence:* PartPerfect's trouble spots; "pause… go back and see what notes I hit".
6. **Make the Duolingo layer honest.** Tie stars to the stated accuracy thresholds and show the number. Never show "Perfect!" below the green tier. Mute sfx while the mic is live and celebrate *after* the take. *Evidence:* pain point 2. Arbitrary praise destroys trust, and sounds during singing compete with listening.
7. **Give a starting pitch and a drone.** Add a one-tap "starting note" (an arpeggiated chord, then your note) before each run, plus an optional tonic drone in Trouble spots. *Evidence:* r/Choir ("starting notes for each part… all of them arpeggiated"); PartPerfect's pitch pipe.
8. **Handle mic, noise and latency.** Add a "We can't hear you / too noisy" state and a sensitivity slider. Detect Bluetooth output and suggest wired headphones or offer tap-along latency calibration. Already done well: the "Rest — breathe" state. *Evidence:* the Nail the Pitch reviews; BandLab and Voloco calibration help pages.
9. **Recommend a key from the range test, and let the user override it.** Pre-fill the key and voice part from Practice → voice-part picker. Always show "Key: −2 (recommended)" with the controls to change it. *Evidence:* Simply Sing's auto-range is praised but sometimes wrong.
10. **Add reading levels for non-readers.** Offer Notes · Notes + solfège (already exists) · Lyrics + contour. The last one is a simple melody line under large lyrics. *Evidence:* non-readers use the score "for the lyrics" and for melodic shape (Rowbury); rote and reading coexist in choirs (r/Choir "Reading vs. Rote").
11. **Offer a guide-sound option.** Let the singer choose a piano tone or a neutral "ah/doo" voice for their part (the arranger already produces doo/ah). Keep the guide accurate rather than realistic. *Evidence:* r/Choir SightSinger thread.
12. **Clarify "Wait for me" for singers.** When the song stops at a note, play that note's tone once. Show the target note head pulsing on the staff, not only in the meter. Allow "skip note" after a few seconds so a singer can't get stuck. *Evidence:* wait modes in Yousician (instruments) and Melodics; pain point 7.
13. **Fix accessibility basics.** Every pitch state should carry an arrow or shape plus text (the `aria-live` words already exist). Use a colour-blind-safe palette for the tiers. Add a high-contrast lyrics option.
