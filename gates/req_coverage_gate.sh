#!/usr/bin/env bash
# req_coverage_gate — HARD. 스펙의 모든 R행이 '실존하는 검증 수단'에 연결됐는지 강제 (spec→check 전수 매핑).
# Why: 잔존 결함의 최대 단일 원천은 과소명세(실과제 38.3%, DOSSIER-CERTAINTY §2) —
#      "적혀만 있고 검증 안 되는 요구"와 "빈손 스펙"을 산문이 아니라 exit code로 차단한다.
# 계약:
#   - REQUIREMENTS.md 에 | R<n>(또는 임의 접두+숫자 id) | 요구 | ... | 검증수단 | 표가 1행 이상.
#   - 검증수단 셀(마지막 칸): 스크립트 토큰(*.sh|*.py|*.mjs|*.js|*.ts|*.bats)이 리포에 실존해야 PASS.
#   - 의도적 판단행은 'mesh' 또는 'human' 표기 — 통과하되 판단 표면 개수로 보고된다(측정 가능하게).
#   - placeholder(채우기/<gate>/TBD/TODO) 잔존 = FAIL. 새 스캐폴드가 빨간불로 시작하는 것이 정상이다.
# macOS bash 3.2 safe, fail-closed.
set -u
ROOT="${1:-$(pwd)}"; case "$ROOT" in --*) ROOT="$(pwd)";; esac
REQ="$ROOT/REQUIREMENTS.md"
RC=0
fail(){ RC=1; printf 'FAIL[req_coverage]: %s\n' "$1" >&2; }

[ -f "$REQ" ] || { fail "REQUIREMENTS.md 없음 — 스펙 없는 하네스"; exit 1; }

ROWS_FILE="$(mktemp)" || { fail "mktemp 실패"; exit 1; }
trap 'rm -f "$ROWS_FILE"' EXIT
grep -E '^\|[[:space:]]*[A-Za-z]+[0-9]+[[:space:]]*\|' "$REQ" > "$ROWS_FILE" || true
total=$(grep -c . "$ROWS_FILE")
[ "$total" -ge 1 ] || fail "R행 0개 — 스펙 없는 하네스 (빈손 생성 금지)"

judgment=0
while IFS= read -r line; do
  id=$(printf '%s' "$line" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2}')
  cell=$(printf '%s' "$line" | awk -F'|' '{n=NF-1; gsub(/^[ \t]+|[ \t]+$/,"",$n); print $n}')
  case "$line" in
    *채우기*|*'<gate>'*|*TBD*|*TODO*) fail "$id: placeholder 잔존 — 스펙을 실제로 채워라"; continue;;
  esac
  # 토큰 추출을 먼저 — "mesh_core_gate.sh" 의 mesh 가 판단행으로 오분류되는 것 방지 (2026-08-19 실측 버그)
  toks=$(printf '%s' "$cell" | grep -oE '[A-Za-z0-9_.-]+\.(sh|py|mjs|js|ts|bats)' || true)
  if [ -z "$toks" ]; then
    # 스크립트 토큰이 없는 행만 판단행 후보 (mesh/human)
    if printf '%s' "$cell" | grep -qiE '(^|[^a-z])(mesh|human)([^a-z]|$)'; then
      judgment=$((judgment+1)); continue
    fi
    fail "$id: 검증 수단 없음 — 스크립트 토큰도 mesh/human 표기도 없다 ('$cell')"; continue
  fi
  found_any=0
  for t in $toks; do
    hit="$(find "$ROOT" -maxdepth 4 -name "$t" -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -1)"
    [ -n "$hit" ] && found_any=1
  done
  [ "$found_any" -eq 1 ] || fail "$id: 참조한 검증 스크립트가 리포에 없음 ($toks)"
done < "$ROWS_FILE"

[ "$judgment" -gt 0 ] && printf 'INFO[req_coverage]: 판단행(mesh/human) %d개 — 사람/메시가 볼 표면은 정확히 이만큼이다\n' "$judgment"
[ "$RC" -eq 0 ] && printf 'PASS[req_coverage]: R행 %d개 전수 검증수단 연결 (판단행 %d)\n' "$total" "$judgment"
exit "$RC"
