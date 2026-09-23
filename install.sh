#!/usr/bin/env bash
# install.sh — install vmix for the current user. Safe to re-run.
#   ./install.sh                         proxy on this machine (127.0.0.1)
#   ./install.sh --proxy-host 10.0.0.5   proxy on another machine (LAN or VPN address)
# Never overwrites an existing ~/.config/vmix/models.json; backs up anything it replaces.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="${VMIX_BIN_DIR:-$HOME/.local/bin}"
CFG_DIR="${VMIX_CONFIG_DIR:-$HOME/.config/vmix}"
CCR_DIR="${VMIX_CCR_DIR:-$HOME/.claude-code-router}"
PROXY_HOST="127.0.0.1"
STAMP="$(date +%Y%m%d%H%M%S)"

die() { printf 'install: %s\n' "$1" >&2; exit 1; }
say() { printf 'install: %s\n' "$1"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --proxy-host) [ $# -ge 2 ] || die "--proxy-host needs a value"; PROXY_HOST="$2"; shift 2 ;;
    --proxy-host=*) PROXY_HOST="${1#*=}"; shift ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done
# The host ends up inside a URL in the router config — accept hostnames and IPv4 only.
printf '%s' "$PROXY_HOST" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$' || die "invalid --proxy-host: $PROXY_HOST"

command -v node >/dev/null 2>&1 || die "Node.js 20+ is required: https://nodejs.org"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || die "Node.js 20+ is required (found $(node -v))"
command -v claude >/dev/null 2>&1 || die "Claude Code is missing: npm install -g @anthropic-ai/claude-code"
command -v ccr >/dev/null 2>&1 || die "claude-code-router is missing: npm install -g @musistudio/claude-code-router@2.0.0"
# vmix relies on CUSTOM_ROUTER_PATH, verified on claude-code-router 2.x. 3.x is a rewrite
# (desktop app + new gateway) and has not been tested; set VMIX_ALLOW_ANY_CCR=1 to try it anyway.
CCR_VERSION="$(ccr -v 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
case "$CCR_VERSION" in
  2.*) ;;
  *) [ "${VMIX_ALLOW_ANY_CCR:-0}" = "1" ] || die "claude-code-router ${CCR_VERSION:-unknown} found; vmix is tested with 2.x: npm install -g @musistudio/claude-code-router@2.0.0" ;;
esac

mkdir -p "$BIN_DIR" "$CFG_DIR" "$CCR_DIR"
if [ -e "$BIN_DIR/vmix" ] || [ -L "$BIN_DIR/vmix" ]; then
  cp -pPR "$BIN_DIR/vmix" "$BIN_DIR/vmix.bak.$STAMP"
fi
install -m 0755 "$ROOT/bin/vmix" "$BIN_DIR/vmix"
install -m 0755 "$ROOT/bin/vmix-registry.mjs" "$BIN_DIR/vmix-registry.mjs"
install -m 0755 "$ROOT/bin/vmix-default-guard.mjs" "$BIN_DIR/vmix-default-guard.mjs"
say "installed vmix into $BIN_DIR"

if [ -f "$CFG_DIR/models.json" ]; then
  say "kept your existing registry: $CFG_DIR/models.json"
else
  install -m 0644 "$ROOT/config/models.example.json" "$CFG_DIR/models.json"
  say "created registry: $CFG_DIR/models.json"
fi

ROUTER="$CCR_DIR/custom-router.js"
if [ -f "$ROUTER" ] && ! cmp -s "$ROUTER" "$ROOT/ccr/custom-router.js"; then
  cp "$ROUTER" "$ROUTER.bak.$STAMP"
  say "backed up previous router: $ROUTER.bak.$STAMP"
fi
install -m 0644 "$ROOT/ccr/custom-router.js" "$ROUTER"

CONFIG="$CCR_DIR/config.json"
[ -f "$CONFIG" ] && cp "$CONFIG" "$CONFIG.bak.$STAMP"
# Create the CCR config from the example, or merge into an existing one:
# point CUSTOM_ROUTER_PATH at the vmix router and add providers that are missing.
node - "$ROOT/ccr/config.example.json" "$CONFIG" "$ROUTER" "$PROXY_HOST" <<'NODE'
const fs = require("node:fs");
const [examplePath, configPath, routerPath, proxyHost] = process.argv.slice(2);
const render = (text) => text.replaceAll("PROXY_HOST", proxyHost).replaceAll("CUSTOM_ROUTER_PATH_PLACEHOLDER", routerPath);
const example = JSON.parse(render(fs.readFileSync(examplePath, "utf8")));
const current = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : null;
let next = example;
if (current) {
  const providers = current.Providers || [];
  const names = new Set(providers.map((provider) => provider.name));
  next = {
    ...current,
    CUSTOM_ROUTER_PATH: routerPath,
    Providers: [...providers, ...example.Providers.filter((provider) => !names.has(provider.name))],
    Router: current.Router || example.Router,
  };
}
fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
NODE
say "wired claude-code-router: $CONFIG"

VMIX_CCR_CONFIG="$CONFIG" VMIX_REGISTRY="$CFG_DIR/models.json" node "$BIN_DIR/vmix-registry.mjs" sync

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) say "add $BIN_DIR to PATH, e.g.: echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.zshrc" ;;
esac
say "next: ccr restart && vmix doctor"
