# Design Document for Harmonic

**Last Updated: Milestone 2 Review (Wednesday, September 30, 2026)**

---

## 1. Introduction

Harmonic is an installable progressive web application (React JS + Vite) that can convert MIDI, MusicXML, MXL, and Guitar Pro files into sheet music for users to hear and sing/play along to. In Version 1 (V1), Harmonic supports two instruments: vocals and guitar. When a user opens a song, Harmonic will render it as music notation and play it back in sync with a moving cursor. When a user sings or strums guitar strings, his/her device’s microphone will detect the pitch or chord in real time. This analysis is completed locally on the user’s device.

Harmonic also employs a Supabase backend to store a shared catalog of songs and handle user accounts, including authentication, progress tracking, and personal library maintenance.

---

## 2. User Interface

### 2.1 Design

The user interface (UI) is a thin reactive shell that renders any content provided by the scoring engine and notation renderer. Moreover, it dispatches user actions (skip, hint, tempo change) back down. The shell doesn't own any music logic itself. Three features define nearly the entire user experience: guided lessons, live practice runs, and run-through summaries.

### 2.2 Guided Lessons

Lessons sit on an unlocking map, and a new lesson becomes available to users only once its prerequisites are met (e.g. all previous lessons are completed). Each lesson node walks the user through three stages in order: a concrete explanation of the notation, an instrument-free drill, and a played exercise on the actual instrument.

During the played exercise, the notation cursor leads the user through the piece, holding onto each note or chord until it's verified as being played correctly. After three failed attempts on the same note or chord, the lesson advances anyway rather than stall the user indefinitely, but it still logs the miss. Two controls stay visible throughout this stage: a skip/override button for users who want to move faster, and a hint button that plays the expected note or chord once and, for guitar, animates the correct fingering onto the fretboard diagram. Pressing either dispatches an intent to the guided-mode state machine that lives in the scoring engine that changes its state. In these cases, the UI simply renders the new state that the machine reports back.

This design lets users fail without getting stuck on a single note or lesson. The soft gate (holding onto each note or chord until it's verified) provides users with real-time feedback while keeping practice moving. At the same time, every miss, skip, and auto-advance is logged in the notation, providing users and their instructors alike with visibility into pain points within a single passage.

### 2.3 Live Practice Runs

Live practice runs are uninterrupted run throughs of a passage. Once a user starts singing or playing, a live-feedback session shows what the microphone is picking up against what the score expects, and both are updated continuously as the run through proceeds. For vocals, the detected and expected notes are displayed, and for guitar, the chord and the state of each string is visualized. For guitar, strings that are under-pressed or muted are also flagged whenever that data is available. If the user input is too quiet to make a reliable call, the app shows an explicit "couldn't hear you" state instead of logging the moment as a miss.

This design supports scalability because the live feedback mechanism isn’t instrument-specific. Every detection analyzer — pitch for voice, chord-FFT for guitar — emits the same normalized event, so the UI simply renders the response it's given without further processing. Additional instruments can be added to the application with little to no modifications to this mechanism.

### 2.4 Run-through Summaries

When a user finishes a live practice run, the scoring engine produces a summary of the attempt and analyzes it note by note, chord by chord. Pitches are labelled verified, wrong, or not-heard, and rhythmic accuracy is measured as early, on-time, or late. All this feedback is marked directly on the rendered notation, providing users with a clear roadmap of what went wrong and where.

Each attempt is added to the passage’s history, and only the most recent score surfaces back on the lesson map. In this way, all attempts become part of a visible trend, facilitating progress tracking. To support this, attempt history and song storage features were designed to live in the backend, separate from the scoring engine and notation renderer capabilities of the frontend.

---

## 3. Software Stack

### 3.1 Frontend Framework

The client is a React app built with Vite. This structure was chosen for its fast iteration loop and wide tooling support. It's packaged as an installable progressive web application (PWA), which offers a strong foundation for fast deployment and doesn't require a new native build pipeline for every platform.

Within this shell, notation rendering is handled differently by each instrument. Voice employs the OpenSheetMusicDisplay (OSMD) library because rendering MusicXML through it also provides users a cursor iterator. This iterator acts as a source of truth for playback timing and expected notes, therefore requiring no additional timing model to be developed separately. Guitar, on the other hand, leverages the alphaTab library, the only web renderer that draws tabs alongside standard notation. This library also plays and exports what it renders via alphaSynth and Guitar Pro. Since both read MusicXML, the song library stays in one format.

Both renderers hand off to a single playback layer driven by Tone.js, a web audio framework consisting of a master clock and sound generator capable of playing notes. This master clock feature also enables live microphone input and rendered notation to stay on the same timeline.

For audio processing, the Pitchy McLeod library conducts pitch detection directly in the browser, keeping every real-time computation on-device. By not round-tripping audio to a server, latency is minimized. Underneath this, microphone capture is enabled by AudioWorklet, a Web Audio API feature that sees every sample on an audio thread and won't miss inputs because of polling intervals.

### 3.2 Backend Structure

The backend is Supabase, in which authentication, per-user data, and private file storage come governed and secured out of the box. Since V1 demands only CRUD capabilities in the form of authentication, saving scores and progress, and serving song files, no additional custom logic is required in the backend. GitHub Actions combined with the Supabase CLI enable CI/CD.

---

## 4. Architecture Rationale

Four decisions shaped the majority of the codebase's design and implementation.

### 4.1 Scalability

Every audio analyzer emits an identical, normalized event, timestamped by the same transport clock that also drives playback, the cursor, and the countdown. The scoring engine captures these events without any visibility into which analyzer produced them, which keeps the scoring logic lean and ensures every event remains consistent on a single shared timeline. As a result, support for another instrument can be added with little to no modification to this mechanism.

### 4.2 Real-Time Responsiveness

The microphone feeds an AudioWorklet that produces raw PCM, and every stage of analysis runs entirely client-side. Only scores, progress data, and a compressed recording (optional) are ever sent to Supabase. This design eliminates network latency as a concern, enabling real-time feedback during guided lessons and live practice runs. Beyond maximizing the user experience with a native-app feel as a PWA, this design also keeps the backend minimal, with no real-time processing burden of its own.

### 4.3 Standardization

Because licensing restrictions prevent the app from hosting copyrighted music on its own servers, any file a user uploads must instead be processed and stored locally on their device. This requires the app to accept music files in any common format. To keep the experience consistent across formats and features, every uploaded file is converted to and stored as MusicXML regardless of its original format. This standardization allows a single stored file to serve multiple renderers across instruments, and establishes that file as the sole source of truth, from which playback timing is derived directly from the rendered score itself.

### 4.4 Code Leanness

The application requires no custom server, no dedicated runtime environment, and no additional custom APIs. Although it is front-end heavy, computation occurs primarily on the client side, with the Supabase backend being pre-built and requiring configuration only. Authorization is handled similarly: every table is governed by row-level security policies scoped to the authenticated user, meaning that access control lives in the database and doesn’t require more application code. Combined with standardized music files and a scalable scoring engine, this keeps the system's operating overhead minimal.

---

## 5. Frontend and Backend Interaction

### 5.1 XXX

XXX

### 5.2 XXX

XXX
