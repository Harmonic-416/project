#!/usr/bin/env bash
# Install what the arranger worker needs, from the repo root's worker/arranger:
#   - the app's dependencies (the worker runs the app's arranger code), plus
#     TensorFlow.js's WebAssembly backend next to the app's TensorFlow.js;
#   - the worker's own (supabase-js, onnxruntime-node).
# Node 22+, ffmpeg and yt-dlp must be on the PATH (or in FFMPEG / YT_DLP).
set -euo pipefail
cd "$(dirname "$0")"
for tool in node npm ffmpeg yt-dlp; do
  command -v "$tool" >/dev/null || { echo "missing: $tool" >&2; exit 1; }
done
npm --prefix ../../app ci --omit=dev --ignore-scripts --no-audit --no-fund
npm --prefix ../../app install --no-save --no-audit --no-fund @tensorflow/tfjs-backend-wasm@3.21.0
npm install --no-audit --no-fund
echo "ready: put SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ~/.config/harmonic-arranger.env, then ./run.sh"
