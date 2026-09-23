#!/usr/bin/env bash
# test_gate — HARD. Every offline test (registry, router, launcher, installer, error paths) must pass.
set -u
ROOT="${1:-$(pwd)}"; case "$ROOT" in --*) ROOT="$(pwd)";; esac
cd "$ROOT" || { echo "FAIL[test]: cannot enter $ROOT"; exit 1; }
set -- tests/*.test.mjs
[ -e "$1" ] || { echo "FAIL[test]: no tests found"; exit 1; }
[ "$#" -ge 5 ] || { echo "FAIL[test]: expected at least 5 test files, found $#"; exit 1; }
if node --test "$@" > "${TMPDIR:-/tmp}/vmix-test-gate.log" 2>&1; then
  echo "PASS[test]: $(grep -E '^ℹ pass' "${TMPDIR:-/tmp}/vmix-test-gate.log" | head -1)"
else
  grep -E '^(✖|not ok)' "${TMPDIR:-/tmp}/vmix-test-gate.log" | head -20
  echo "FAIL[test]: node --test failed"
  exit 1
fi
