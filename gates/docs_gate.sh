#!/usr/bin/env bash
# docs_gate — HARD (R12). Both READMEs keep the tutorial promise: prerequisites, every step,
# maintenance and troubleshooting, the tested router version, and no dangling local links.
set -u
ROOT="${1:-$(pwd)}"; case "$ROOT" in --*) ROOT="$(pwd)";; esac
RC=0
fail() { RC=1; echo "FAIL[docs]: $1"; }
for f in README.md README.ko.md; do
  p="$ROOT/$f"
  [ -f "$p" ] || { fail "$f missing"; continue; }
  for cmd in "./install.sh" "vmix doctor" "vmix smoke" "vmix sync" "vmix models" "ccr restart" \
             "@musistudio/claude-code-router@2.0.0" "@anthropic-ai/claude-code" "automazeio/vibeproxy" "tailscale"; do
    grep -qiF -- "$cmd" "$p" || fail "$f does not mention '$cmd'"
  done
  steps=$(grep -cE '^### [1-7]\. ' "$p")
  [ "$steps" -eq 7 ] || fail "$f has $steps tutorial steps, expected 7"
  grep -qE 'claude-code-router(@latest)?"?$|claude-code-router$' "$p" && fail "$f installs an unpinned claude-code-router"
  for link in $(grep -oE '\]\((assets/[^)]+|LICENSE|README(\.ko)?\.md)\)' "$p" | sed -E 's/^\]\(|\)$//g'); do
    [ -e "$ROOT/$link" ] || fail "$f links to missing $link"
  done
done
for sub in models doctor sync smoke; do
  grep -qE "^  $sub\)" "$ROOT/bin/vmix" || grep -qE "^  $sub\|" "$ROOT/bin/vmix" || fail "README documents 'vmix $sub' but bin/vmix has no such subcommand"
done
[ "$RC" -eq 0 ] && echo "PASS[docs]: both READMEs cover the full tutorial and every local link resolves"
exit "$RC"
