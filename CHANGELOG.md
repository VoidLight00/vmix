# Changelog

All notable changes to this project are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-09-23

### Added
- Default-model guard: a `/model` pick inside a vmix session no longer becomes the default of plain `claude` sessions; the previous default is restored on exit and Claude Code's exit status is kept.
- `/model` allowlist (`availableModels`) built from the registry, so only registry models can be picked.
- Installer deploys the tested launcher as the real `vmix` executable (backing up an old one) together with the guard.

### Changed
- Every worker slot (Opus, Sonnet, Haiku, custom) points at a GPT model, so a used-up Gemini quota cannot stall background calls. The example uses GPT-5.6 Terra for Sonnet.
- The example registry works with VibeProxy alone; GLM and solgate rows ship disabled. The fuller multi-provider setup lives in `tests/fixtures/`.

## [0.1.0] - 2026-09-23

### Added
- `vmix` launcher: start Claude Code on any registry model or alias through claude-code-router, with every `/model` slot pinned to a registry model.
- Single model registry (`~/.config/vmix/models.json`) read by the launcher, the router and `vmix sync`.
- Fail-closed CCR router: unregistered, disabled and Claude models get an upstream 400 instead of `Router.default`.
- `vmix sync`, `vmix doctor` and `vmix smoke` (checks which model actually answered).
- Idempotent `install.sh` with backups, proxy-host validation and a claude-code-router 2.x guard.
- English and Korean step-by-step tutorial, offline test suite and HARD gates.

[Unreleased]: https://github.com/VoidLight00/vmix/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/VoidLight00/vmix/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/VoidLight00/vmix/commits/main
