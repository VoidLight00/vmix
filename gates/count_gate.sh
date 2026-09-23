#!/usr/bin/env bash
# count_gate — HARD. "있어야 할 것이 실제로 몇 개인가"를 센다 — '조용히 빈손인 조회' 차단.
# Why: 지배적 결함 패턴 — 이름 규칙이 실제와 어긋나 0건을 찾고, 0은 오류가 아니라서 통과한다
#      (webtoonize 한 세션에서 같은 모양 8건 실증. 로그는 전부 정상으로 보였다 — 세어봐야 드러난다).
# 계약: gates/expected_counts.tsv 각 행 "<min><TAB><root 상대 glob>" 에 대해 매치 파일 수 >= min.
#   tsv 없음/유효 행 0개 = FAIL (측정 없는 통과 금지). '#' 주석 허용.
#   주의: bash 3.2 라 '**' 재귀 glob 없음 — 깊은 경로는 명시적으로 (예: out/*/*.png).
# macOS bash 3.2 safe, fail-closed.
set -u
ROOT="${1:-$(pwd)}"; case "$ROOT" in --*) ROOT="$(pwd)";; esac
G="$(cd "$(dirname "$0")" && pwd)"
TSV="$G/expected_counts.tsv"
RC=0
fail(){ RC=1; printf 'FAIL[count]: %s\n' "$1" >&2; }

[ -f "$TSV" ] || { fail "expected_counts.tsv 없음 — 셀 것을 정의하라 (빈손 계약 금지)"; exit 1; }

rows=0
while IFS=$'\t' read -r min glob; do
  case "${min:-}" in ''|'#'*) continue;; esac
  case "$min" in *[!0-9]*) fail "형식 오류: min이 숫자가 아님 ('$min')"; continue;; esac
  [ -n "${glob:-}" ] || { fail "형식 오류: glob 없음 (min=$min)"; continue; }
  rows=$((rows+1))
  n=$(cd "$ROOT" 2>/dev/null && {
        shopt -s nullglob 2>/dev/null || true
        set -- $glob
        c=0; for f in "$@"; do [ -e "$f" ] && c=$((c+1)); done; echo "$c"
      })
  [ "${n:-0}" -ge "$min" ] || fail "'$glob' 실측 ${n:-0}개 < 기대 최소 $min — 조용한 빈손 의심"
done < "$TSV"

[ "$rows" -ge 1 ] || fail "유효 카운트 행 0개 — 셀 것이 없다"
[ "$RC" -eq 0 ] && printf 'PASS[count]: %d개 카운트 계약 전수 충족\n' "$rows"
exit "$RC"
