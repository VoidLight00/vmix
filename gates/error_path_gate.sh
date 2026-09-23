#!/usr/bin/env bash
# error_path_gate — HARD (R2). Missing registry, broken JSON, missing provider, dead proxy,
# dead router and a wrong answering model must each fail loudly with a next step.
set -u
ROOT="${1:-$(pwd)}"; case "$ROOT" in --*) ROOT="$(pwd)";; esac
F="$ROOT/tests/error-paths.test.mjs"
[ -f "$F" ] || { echo "FAIL[error_path]: $F missing"; exit 1; }
n=$(grep -c '^test(' "$F")
[ "$n" -ge 6 ] || { echo "FAIL[error_path]: expected >= 6 error-path tests, found $n"; exit 1; }
node --test "$F" > /dev/null 2>&1 || { echo "FAIL[error_path]: error-path tests failed"; exit 1; }
echo "PASS[error_path]: $n error-path tests"
