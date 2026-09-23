# vmix — Requirements (SSoT)

> Single source of truth. Every row is enforced by the gate in its last column (exit code), or marked `human` when only a person can judge it.

| id | requirement | gate |
|---|---|---|
| R1 | `vmix [model-or-alias]` resolves the model from the single registry and starts Claude Code through CCR with the main model and every `/model` slot pinned (Haiku and `ANTHROPIC_SMALL_FAST_MODEL` never left on a Claude model); a real `ANTHROPIC_API_KEY` is not forwarded | test_gate.sh |
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
