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
