#!/usr/bin/env bash
# leak_gate — HARD (R9). Nothing personal may ship: home paths, private VPN addresses,
# e-mail addresses, or any word listed in the local, git-ignored .github/publish-denylist.txt.
set -u
ROOT="${1:-$(pwd)}"; case "$ROOT" in --*) ROOT="$(pwd)";; esac
[ -d "$ROOT" ] || { echo "FAIL[leak]: not a directory: $ROOT"; exit 1; }
SELF="$(basename "$0")"
RC=0
scan() { # scan <label> <extended regex>
  hits="$(grep -rInE "$2" "$ROOT" --exclude-dir=.git --exclude-dir=node_modules \
    --exclude="$SELF" --exclude=publish-denylist.txt --exclude='*.png' 2>/dev/null)"
  [ -z "$hits" ] && return 0
  RC=1
  echo "FAIL[leak]: $1"
  printf '%s\n' "$hits" | cut -c1-160 | head -10
}
scan "absolute home path" '/Users/[A-Za-z]|/home/[a-z][a-z0-9_-]+/'
scan "Tailscale (CGNAT) address" '(^|[^0-9.])100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]{1,3}\.[0-9]{1,3}([^0-9]|$)'
scan "e-mail address" '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}' 
DENY="$ROOT/.github/publish-denylist.txt"
if [ -f "$DENY" ]; then
  while IFS= read -r word; do
    case "$word" in ''|'#'*) continue ;; esac
    hits="$(grep -rIlF --exclude-dir=.git --exclude-dir=node_modules --exclude="$SELF" --exclude=publish-denylist.txt -- "$word" "$ROOT" 2>/dev/null)"
    [ -n "$hits" ] && { RC=1; echo "FAIL[leak]: denylisted word found in: $hits"; }
  done < "$DENY"
fi
[ "$RC" -eq 0 ] && echo "PASS[leak]: no home paths, VPN addresses, e-mails or denylisted words"
exit "$RC"
