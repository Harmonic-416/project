# Arranger worker

Arranges the YouTube links queued in `arrangement_job` (migration
`0011_arrangement_jobs.sql`) with the Vocal tab's own arranger
(`app/src/tabs/vocal/arrange/`), so a team member can paste a link
instead of finding the audio. One job at a time, oldest first:

1. `yt-dlp` fetches the video's best audio stream into a temporary folder;
2. `ffmpeg` decodes it (the browser's Web Audio does this in the app);
3. `arrangeAudio` — the same code the browser runs — isolates the singer,
   hears the melody and the chords, finds the beat and writes the parts;
4. the MusicXML goes to `arrangements/<user>/<job>.musicxml`, the job is
   marked done, and the audio is deleted.

Stage and progress are written to the job as it goes; the app polls them.

## Setup (no root needed)

Node 22+, ffmpeg and yt-dlp on the PATH (static builds in `~/.local/bin`
are fine), and this repo checked out. Then:

```bash
worker/arranger/setup.sh
cat > ~/.config/harmonic-arranger.env <<'ENV'
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
WORKER_NAME=eduardo-vm
ENV
chmod 600 ~/.config/harmonic-arranger.env
worker/arranger/run.sh            # tmux session harmonic-arranger
tail -f ~/.local/state/harmonic-arranger.log
```

`run.sh` restarts the worker if it exits; add `@reboot <path>/run.sh` to
`crontab -e` to start it at boot. A job interrupted by a restart goes back
in the queue.

To try the pipeline without Supabase:

```bash
cd worker/arranger && npm run once -- <YouTube id | audio file> out.musicxml ttbb
```

## Who can use it

Only users in `arranger_access`, kept by hand with the service role
(Supabase SQL editor):

```sql
insert into arranger_access (user_id, note)
select id, 'Harmonic team' from auth.users where email = 'someone@example.com';
```

Each may queue ten a day, two at a time (`arrangement_job_limits`).
YouTube's terms forbid downloading, so keep the list to the team; empty it
or stop the worker to switch the feature off.

## Speed

On a 16-core VM without a GPU, a 2½-minute song takes about two minutes,
most of it separating the vocals. Basic Pitch runs on TensorFlow.js's
WebAssembly backend (`setup.sh` installs it next to the app's
TensorFlow.js); `tfjs-node` needs AVX, which a Proxmox VM with the default
CPU type doesn't expose — set the VM's CPU type to `host` to allow it.

## Notes

- `register.js` / `hooks.js` let plain Node load the app's modules as Vite
  does (`@tonejs/midi`'s exports, `import.meta.env`).
- `onnxruntime-node` has no Intel-Mac build; there the worker falls back
  to the app's `onnxruntime-web`.
- When YouTube changes and yt-dlp starts failing (HTTP 403, "confirm
  you're not a bot"), update it: `yt-dlp -U` for the standalone build.
