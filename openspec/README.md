# OpenSpec — Harmonic

Spec-driven development home for **Harmonic** (CSE 416): a music-learning PWA — "Learn the instrument and the language at the same time." Guitar + Voice in v1 (Piano future).

**`specs/` is the current truth; `changes/` holds proposed/in-flight work.** Each change carries `proposal.md`, `design.md`, `tasks.md` (build checklist), and spec *deltas* under `specs/<capability>/spec.md`. When implemented, its deltas sync into the canonical `specs/` tree and the change is archived.

## Layout

```
openspec/
  config.yaml                     # schema: spec-driven (v1.13)
  specs/<capability>/spec.md      # canonical capability specs (current truth)
  changes/<change-id>/            # active change proposals (the v1 build plan)
    proposal.md  design.md  tasks.md
    specs/<capability>/spec.md    # deltas (## ADDED/MODIFIED/... Requirements)
  changes/archive/                # completed changes
```

## Area → Capability → Owning change

| Area     | Capability (specs/<path>)  | Owning change              |
|----------|----------------------------|----------------------------|
| Frontend | `specs/ui`                 | `add-frontend-experience`  |
| Frontend | `specs/audio-pipeline`     | `add-frontend-experience`  |
| Frontend | `specs/notation-rendering` | `add-frontend-experience`  |
| Frontend | `specs/scoring-engine`     | `add-frontend-experience`  |
| Frontend | `specs/tuner`              | `add-guitar-foundation`    |
| Backend  | `specs/auth`               | `add-backend-services`     |
| Backend  | `specs/progress-tracking`  | `add-backend-services`     |
| Backend  | `specs/song-storage`       | `add-backend-services`     |
| DevOps   | `specs/pwa-infra`          | `add-devops-infrastructure`|
| DevOps   | `specs/deployment`         | `add-devops-infrastructure`|

`add-guitar-foundation` (M2) adds the `tuner` capability (F39), the shared AudioWorklet capture, and alphaTab rendering plus tab ↔ MIDI conversion for guitar. The three area `add-*` changes are the active v1 build plan; their `tasks.md` files are the per-area build checklists. (Greenfield: specs were seeded by syncing the pure-ADDED deltas; changes stay open until implemented, then get archived.)

## Workflow

1. **Propose** — `/opsx:propose` (skill `openspec-propose`): creates `changes/<id>/` with proposal, design, tasks, and spec deltas.
2. **Apply** — `/opsx:apply`: work through `tasks.md`, implementing the change.
3. **Sync** — `/opsx:sync`: fold deltas into `specs/` without archiving.
4. **Archive** — `/opsx:archive`: finalize a completed change into `changes/archive/`.

CLI (from repo root):

```bash
npx --yes @fission-ai/openspec@latest list      # active changes
npx --yes @fission-ai/openspec@latest validate  # check specs + deltas
npx --yes @fission-ai/openspec@latest show <change-id>
```

Authoritative product/architecture source docs live in `../specifications/` (separate read-only repo): requirements (F1–F39, N1–N6), v1 scope, tech stack, rough architecture, design philosophy, division of labor.
