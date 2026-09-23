#!/usr/bin/env bash
# secrets_gate — HARD. blocks publishing obvious secrets. bash 3.2 safe, fail-closed.
set -u

# --- fail-closed prologue (2026-08-11) ---
# 스캔이 '안 돌아간 것'과 스캔해서 '못 찾은 것'은 다르다. 없는 경로·읽을 수 없는 경로를
# "시크릿 없음"으로 접으면 게이트가 조용히 무력화된다. gpt-5.6-sol-1m 교차검증에서 실측됨.
__SG_ROOT="${1:-$(pwd)}"; case "$__SG_ROOT" in --*) __SG_ROOT="$(pwd)";; esac
[ -d "$__SG_ROOT" ] || { echo "FAIL[secrets]: 스캔 대상이 디렉토리가 아니다: $__SG_ROOT"; exit 1; }
[ -r "$__SG_ROOT" ] || { echo "FAIL[secrets]: 읽을 수 없는 경로: $__SG_ROOT"; exit 1; }
ROOT="${1:-$(pwd)}"
RC=0
PAT='(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})'
HITS="$(grep -rIlE "$PAT" "$ROOT" \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=fixtures \
  --exclude-dir=.next --exclude-dir=dist --exclude='*.bak*' 2>/dev/null)"
GREP_RC=$?
[ "$GREP_RC" -gt 1 ] && { echo "FAIL[secrets]: grep 오류 (exit $GREP_RC) — 스캔 미완료"; exit 1; }
if [ -n "$HITS" ]; then
  echo "FAIL[secrets]: secret-like pattern found in:"
  printf '%s\n' "$HITS"
  RC=1
else
  echo "PASS[secrets]: no obvious secrets in tracked tree"
fi
exit "$RC"
