# vmix — Failure Log

> One row per failure. Each one added a gate or a test so it cannot come back quietly.

| date | id | symptom | root cause | fix | gate added |
|---|---|---|---|---|---|
| 2026-09-23 | VM-01 | `/model` showed Opus in a Gemini session, replies came from GPT | Custom router returned `null` for unknown models; CCR used `Router.default` | Router never returns `null`; unknown models go to an invalid id on a real provider (upstream 400) | tests/router.test.mjs, `vmix smoke` |
| 2026-09-23 | VM-02 | Assumed "throw" and "unknown provider" were refusals | Measured on a throwaway CCR 2.0.0: `null` and throw both fall back to `Router.default`; unknown provider gives 404 | Documented measured behavior; kept the upstream-400 refusal | R6 in REQUIREMENTS.md |
| 2026-09-23 | VM-03 | Background calls in Gemini sessions would fail after the router became strict | Haiku / small-fast slot left on a Claude model | Launcher pins every slot to a registry model | tests/launcher.test.mjs |
| 2026-09-23 | VM-04 | All requests timed out after a reboot | VPN (Tailscale) stopped, proxy host unreachable | `vmix doctor` reports unreachable proxy with the VPN hint | tests/error-paths.test.mjs |
| 2026-09-23 | VM-05 | Tutorial would install claude-code-router 3.x | 3.x is a rewrite; the custom-router hook was only verified on 2.0.0 | Pinned `@2.0.0`; install.sh refuses other majors unless `VMIX_ALLOW_ANY_CCR=1` | tests/install.test.mjs, docs_gate.sh |
| 2026-09-23 | VM-06 | GPT-6 Sol session failed on Gemini quota although the status line still showed GPT | Sonnet worker slot and long-context overflow route were pinned to Gemini | Keep all worker slots on GPT and route long GPT requests to the selected GPT model | tests/launcher.test.mjs, tests/router.test.mjs |
| 2026-09-23 | VM-07 | Repository tests passed but the real `vmix` command still used another implementation | `~/.local/bin/vmix` was a symlink to an untracked `vclaude-proxy`, not the tested `bin/vmix` | Install the repository launcher as the real executable and test the installed path | tests/install.test.mjs |
| 2026-09-23 | VM-08 | The public example registry was replaced by the author's live setup (every GPT row on solgate), so a tutorial user without the optional solgate would get failing GPT requests | Tests and the example shared one file, so making tests cover the full setup changed what new users install | Full setup moved to tests/fixtures/models.multi.json; example rebuilt for VibeProxy only | tests/registry.test.mjs (R17) |
| 2026-09-23 | VM-09 | Adding one model still meant editing shell functions and the proxy launcher (103 and 95 hard-coded model ids) even after the registry existed | vgpt/vgpt1m/vgemini kept their own model tables, caps and slot lists | Registry `profiles` + `vmix --profile`; the old commands became one-line delegations and the tables were deleted | tests/registry.test.mjs, tests/launcher.test.mjs |
