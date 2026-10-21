#!/usr/bin/env bash
# Start the arranger worker in a tmux session (`harmonic-arranger`), logging
# to ~/.local/state/harmonic-arranger.log, with its settings from
# ~/.config/harmonic-arranger.env. Run again to restart it. For starting at
# boot without root: `crontab -e` → @reboot /path/to/run.sh
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE="${ARRANGER_ENV:-$HOME/.config/harmonic-arranger.env}"
LOG="$HOME/.local/state/harmonic-arranger.log"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 1; }
mkdir -p "$(dirname "$LOG")"
export PATH="$HOME/.local/bin:$PATH"
tmux kill-session -t harmonic-arranger 2>/dev/null || true
tmux new-session -d -s harmonic-arranger \
  "set -a; . '$ENV_FILE'; set +a; while true; do node --import ./register.js worker.js >> '$LOG' 2>&1; echo \"\$(date -Is) worker exited (\$?), restarting in 10 s\" >> '$LOG'; sleep 10; done"
echo "started; tail -f $LOG"
