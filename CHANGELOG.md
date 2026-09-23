# Changelog

All notable changes to this project are recorded here.
Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-09-23

### Added
- `vmix` launcher: start Claude Code on any registry model or alias through claude-code-router, with every `/model` slot pinned to a registry model.
- Single model registry (`~/.config/vmix/models.json`) read by the launcher, the router and `vmix sync`.
- Fail-closed CCR router: unregistered, disabled and Claude models get an upstream 400 instead of `Router.default`.
- `vmix sync`, `vmix doctor` and `vmix smoke` (checks which model actually answered).
- Idempotent `install.sh` with backups, proxy-host validation and a claude-code-router 2.x guard.
- English and Korean step-by-step tutorial, offline test suite and HARD gates.

[Unreleased]: https://github.com/VoidLight00/vmix/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/VoidLight00/vmix/commits/main
