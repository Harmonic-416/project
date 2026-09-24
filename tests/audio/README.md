# Audio spikes (exploratory — not product code)

Client-side audio experiments live here, separate from the backend integration
tests in `../backend/`.

- **Pitch detection** — owned by the `audio-pipeline` capability (F19, N1, N2)
  in the `add-frontend-experience` change. Prototype Pitchy (McLeod pitch
  method) here; the contract every analyzer must meet is emitting
  `{note, timestamp, confidence}` events.
- **Word enunciation** — **not yet in any OpenSpec spec.** Run `/opsx:propose`
  before promoting anything here to product code. Until then this folder is
  the sanctioned sandbox.

Nothing in this folder may import Supabase: real-time audio analysis is
client-side only, and only derived results ever reach the backend.

## Guitar capture + tuner check (N1, N2 — `add-guitar-foundation` task 4.4)

Shared AudioWorklet capture (`app/src/audio/capture/`) feeding the tuner.

| Device / browser | How | Result |
|---|---|---|
| Windows, desktop Chrome, production build (`vite preview`) | Fake microphone playing generated WAVs (`--use-file-for-fake-audio-capture`) | ✅ 2026-09-23 — 110 Hz → "A2 · In tune"; 115 Hz → "+77¢ sharp"; 82.4 Hz with a louder 2nd harmonic → "E2 · In tune"; silence → "Play a string"; permission denied → error message, no crash |
| iPhone, Safari (iOS 14.5+) | Open the app over HTTPS, Guitar → Tuner → Start, pluck each open string | ⏳ to do — needs an HTTPS URL (deployment, or `npx cloudflared tunnel --url http://localhost:5173` with the host added to `server.allowedHosts`) |

Go/no-go for iPhone: **go** if the worklet starts after the tap and each open
string reads the right name within a second; **no-go** (fall back to
desktop-first for guitar, per the roadmap's slip rules) if the worklet fails
to start or low E is misread.
