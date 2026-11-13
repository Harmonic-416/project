#!/usr/bin/env bash
#
# THE GATE. The loop's stop condition.
#
# `npm run ci` tells you the code compiles and the tests that ran passed. That is
# not enough to trust an unattended change: it cannot tell you the suite still
# RAN, that polish moved forward rather than back, or that a tolerance was not
# quietly loosened to go green. This adds those assertions.
#
#   ./scripts/gate.sh          # everything
#   ./scripts/gate.sh --fast   # skip the app build (use while iterating)
#
# Exit 0 means a human can review the diff. It does not mean the change is good:
# anything touching practice still needs a person with an instrument, per the
# test plan's definition of done.
set -euo pipefail

cd "$(dirname "$0")/.."
FAST=${1:-}

step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

step '1. lint, typecheck, tests, build'
if [ "$FAST" = '--fast' ]; then
  npm run lint
  npm run typecheck
  npm test
  npm --prefix app run lint
  npm --prefix app test
else
  npm run ci
fi

step '2. the polish ratchet (and the anti-skip test count)'
# Each metric may only move in its committed direction. The loop's job is to
# drive these to their floor; "done" is when they arrive. Re-record an
# improvement with: node scripts/assert-baseline.mjs --write
node scripts/assert-baseline.mjs --all

step '3. frozen files — judged by ear, never by a loop'
# A FILE list, not a directory freeze: song/follow/ also holds presentation and
# player-command code that polish work legitimately needs. See
# scripts/frozen-files.txt for what is frozen and why.
while read -r path; do
  case "$path" in ''|\#*) continue ;; esac
  [ -e "$path" ] || continue
  if ! git diff --quiet --exit-code -- "$path"; then
    echo "FAIL: $path is frozen but was modified."
    echo "      Its behaviour was tuned by ear against real playing. A loop"
    echo "      cannot tell whether a change made it better. Mark the item"
    echo "      BLOCKED and escalate (PROMPT.md)."
    exit 1
  fi
done < scripts/frozen-files.txt

step '4. never-touch paths'
# Migrations are applied to the LIVE Supabase project by CD on merge to main.
# The specs are the contract. The design documents are graded artifacts.
for path in supabase/migrations .github/workflows openspec/specs harmonic-design-document package-lock.json; do
  [ -e "$path" ] || continue
  if ! git diff --quiet --exit-code -- "$path"; then
    echo "FAIL: $path must not be modified by the loop."
    echo "      If the spec is wrong, write a spec-change request and stop (PROMPT.md)."
    exit 1
  fi
  # `git diff` cannot see a file that was never added, and "write a brand new
  # migration" is exactly the dangerous case, so check for new files too.
  #
  # scripts/gate-allowlist.txt names untracked files that are a human's, not the
  # agent's, so they can sit uncommitted without blocking every run. Anything
  # NOT listed there still fails: a migration the loop invents is still caught.
  untracked=$(git ls-files --others --exclude-standard -- "$path")
  if [ -n "$untracked" ] && [ -s scripts/gate-allowlist.txt ]; then
    untracked=$(printf '%s\n' "$untracked" | grep -vxF -f scripts/gate-allowlist.txt || true)
  fi
  untracked=$(printf '%s' "$untracked" | sed '/^$/d')
  if [ -n "$untracked" ]; then
    echo "FAIL: new file(s) under the never-touch path $path:"
    echo "$untracked" | sed 's/^/        /'
    echo "      A loop must not create files here. If these are yours and pre-date"
    echo "      the loop, commit them first, so the gate can tell your work from"
    echo "      the agent's."
    exit 1
  fi
done

step '5. scope — Guitar: Songs, Learn, Exercises only'
# The loop's remit is the Guitar tab's Songs, Learn and Exercises (and
# practice/, which IS Learn's implementation). Everything else — vocal, home,
# social, fretboard, tuner, src/lib, the worker — is out of bounds for now, so
# that guitar can become the reference the other tab is later brought up to.
# Tests, the backlog and the loop's own log are always writable.
OUT_OF_SCOPE=$(git diff --name-only HEAD -- app src worker tests \
  | grep -vE '^app/tests/' \
  | grep -vE '^app/src/tabs/guitar/(GuitarTab|song/|learn/|exercises/|practice/|notation/)' \
  || true)
# Pre-existing dirt is not the loop's fault: the same allowlist that covers
# untracked files in never-touch paths also covers files a human already had
# modified when the loop started.
if [ -n "$OUT_OF_SCOPE" ] && [ -s scripts/gate-allowlist.txt ]; then
  OUT_OF_SCOPE=$(printf '%s\n' "$OUT_OF_SCOPE" | grep -vxF -f scripts/gate-allowlist.txt || true)
fi
OUT_OF_SCOPE=$(printf '%s' "$OUT_OF_SCOPE" | sed '/^$/d')
if [ -n "$OUT_OF_SCOPE" ]; then
  echo 'FAIL: changes outside the Guitar Songs/Learn/Exercises scope:'
  echo "$OUT_OF_SCOPE" | sed 's/^/        /'
  echo '      This iteration is scoped to the Guitar tab. If the item genuinely'
  echo '      needs a shared or vocal file, it is misclassified: mark it BLOCKED'
  echo '      and escalate (PROMPT.md).'
  exit 1
fi

step '6. no placeholders left behind'
if git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -qE '\.(js|jsx|ts|tsx|css)$'; then
  if git diff --cached -- '*.js' '*.jsx' '*.ts' '*.tsx' '*.css' | grep -nE '^\+.*(TODO|FIXME|XXX|placeholder)' ; then
    echo 'FAIL: the diff adds a TODO/FIXME/placeholder. Finish it or leave it out.'
    exit 1
  fi
fi

printf '\n\033[32m✓ GATE GREEN\033[0m — a human may now review the diff.\n'
printf '  Anything touching practice still needs physical testing before merge.\n'
