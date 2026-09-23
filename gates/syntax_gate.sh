#!/usr/bin/env bash
# syntax_gate — HARD. Shell scripts parse, JS parses, every shipped JSON is valid.
set -u
ROOT="${1:-$(pwd)}"; case "$ROOT" in --*) ROOT="$(pwd)";; esac
RC=0
fail() { RC=1; echo "FAIL[syntax]: $1"; }
for f in "$ROOT/bin/vmix" "$ROOT/install.sh" "$ROOT"/gates/*.sh; do
  bash -n "$f" 2>/dev/null || fail "bash -n $f"
done
for f in "$ROOT/bin/vmix-registry.mjs" "$ROOT/bin/vmix-default-guard.mjs" "$ROOT/ccr/custom-router.js" "$ROOT"/tests/*.mjs; do
  node --check "$f" 2>/dev/null || fail "node --check $f"
done
for f in "$ROOT"/config/*.json "$ROOT"/ccr/*.json; do
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$f" 2>/dev/null || fail "invalid JSON $f"
done
[ -x "$ROOT/bin/vmix" ] && [ -x "$ROOT/bin/vmix-registry.mjs" ] && [ -x "$ROOT/bin/vmix-default-guard.mjs" ] && [ -x "$ROOT/install.sh" ] || fail "vmix entry points and install.sh must be executable"
[ "$RC" -eq 0 ] && echo "PASS[syntax]: shell, JS and JSON parse"
exit "$RC"
