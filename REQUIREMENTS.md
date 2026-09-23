# vmix — Requirements (SSoT)

> Single source of truth. Every row is enforced by the gate in its last column (exit code), or marked `human` when only a person can judge it.

| id | requirement | gate |
|---|---|---|
| R1 | `vmix [model-or-alias]` resolves every enabled GPT/Gemini/GLM text model from the single registry and starts Claude Code through CCR; every `/model` slot stays on GPT routes, every enabled non-Claude model is in the allowlist, and a real `ANTHROPIC_API_KEY` is not forwarded | test_gate.sh |
| R2 | External-call failure paths (missing/broken registry, missing CCR provider, unreachable proxy, dead router, wrong answering model) fail loudly with a next step | error_path_gate.sh |
| R3 | Shipped artifacts exist in the expected numbers (bins, tests, gates, READMEs, images) | count_gate.sh |
| R4 | No secrets in the repository | secrets_gate.sh |
| R5 | Every requirement row maps to an existing check | req_coverage_gate.sh |
| R6 | The CCR router sends registry models to their declared provider and refuses unregistered, disabled and Claude models with an upstream error — never `null`/throw (which CCR turns into `Router.default`) | test_gate.sh |
| R7 | `vmix sync` rewrites only the provider model lists it owns, is a no-op when nothing changed, keeps a backup, and refuses when a needed provider is missing | test_gate.sh |
| R8 | `install.sh` is idempotent: never overwrites the user's registry, backs up the router and CCR config, rejects unsafe `--proxy-host` values and untested claude-code-router major versions | test_gate.sh |
| R9 | Nothing personal ships: home paths, VPN addresses, e-mail addresses, denylisted words | leak_gate.sh |
| R10 | All shell, JS and JSON files parse; entry points are executable | syntax_gate.sh |
| R11 | No vertical accent stripes in any shipped design asset | no_vertical_stripe_gate.sh |
| R12 | README.md and README.ko.md cover prerequisites, all 7 tutorial steps, maintenance, troubleshooting, the pinned router version, and every local link resolves | docs_gate.sh |
| R13 | Live path verified on a real proxy: install → doctor exit 0 → smoke (each model answers as itself, Claude refused) → launcher session answers (done by the author on claude-code-router 2.0.0; repeat with `vmix smoke` on your setup) | human |
| R14 | A proxy session may change `~/.claude/settings.json` through `/model`, but when the launcher exits it restores the pre-session default for proxy picks, preserves an explicitly selected native Claude model, and returns Claude Code's original exit status | test_gate.sh |
| R15 | Long GPT requests remain on the selected GPT route; the router never diverts them to Gemini, and unregistered or Claude models fail closed instead of using `Router.default` | test_gate.sh |
| R16 | The installer deploys the tested `bin/vmix` as the actual `~/.local/bin/vmix` executable together with its registry and default-model guard, preventing source/runtime drift | test_gate.sh |
| R17 | The shipped example registry works with VibeProxy alone: no enabled row needs solgate or another optional provider, and every worker slot points at a GPT model | test_gate.sh |
| R18 | Compatibility commands are data, not code: registry `profiles` set the default model, family restriction, `-1m` variant and `/model` slots; `claudeArgs` and per-model `autocompact` add Claude Code options; an executable prelaunch hook runs before the health check and only warns on failure | test_gate.sh |
