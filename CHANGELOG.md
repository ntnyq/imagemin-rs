# Changelog

All notable changes to imagemin-rs are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added an English-first documentation site with a Simplified Chinese locale.
- Added a browser-only image playground with local drag-and-drop processing,
  batch optimization, configurable output, size comparisons, and ZIP downloads.
- Added GitHub Pages deployment for `imagemin-rs.ntnyq.dev`.
- Added automatic GitHub Release creation after tagged release validation.

### Changed

- Reduced the repository README to the public overview, installation, and quick
  start, with detailed material moved to the documentation site.

## [0.1.0-rc.6] - 2026-07-29

### Changed

- Published the sixth release candidate after completing the npm staging and
  cross-platform package verification flow.

## [0.1.0-rc.5] - 2026-07-29

### Fixed

- Isolated native modules during release smoke tests so every platform package
  is validated against its own installed artifact.

## [0.1.0-rc.4] - 2026-07-29

### Fixed

- Launched npm through the Windows command interpreter in release smoke tests.

## [0.1.0-rc.3] - 2026-07-29

### Fixed

- Rejected zero-sized GIF frames before lossless frame processing.

### Changed

- Expanded fuzz CI coverage to every codec crate change.

## [0.1.0-rc.2] - 2026-07-29

### Fixed

- Statically linked zlib into Windows cwebp sidecars and aligned their CRT
  linkage with the release runtime.

## [0.1.0-rc.1] - 2026-07-29

### Fixed

- Hardened cross-platform native and sidecar release builds.
- Made release helpers portable across Windows and POSIX environments.

## [0.1.0-rc.0] - 2026-07-29

### Added

- Added the first public release candidate of the imagemin-compatible Node.js
  pipeline, typed plugin API, and napi-rs worker execution.
- Added SVG, GIF, PNG, JPEG, WebP, and AVIF optimization adapters with explicit
  native and compatibility profiles.
- Added reproducible native and sidecar packages for macOS, Linux, and Windows,
  plus release verification, smoke tests, provenance, and SBOM generation.

[Unreleased]: https://github.com/ntnyq/imagemin-rs/compare/v0.1.0-rc.6...HEAD
[0.1.0-rc.6]: https://github.com/ntnyq/imagemin-rs/compare/v0.1.0-rc.5...v0.1.0-rc.6
[0.1.0-rc.5]: https://github.com/ntnyq/imagemin-rs/compare/v0.1.0-rc.4...v0.1.0-rc.5
[0.1.0-rc.4]: https://github.com/ntnyq/imagemin-rs/compare/v0.1.0-rc.3...v0.1.0-rc.4
[0.1.0-rc.3]: https://github.com/ntnyq/imagemin-rs/compare/v0.1.0-rc.2...v0.1.0-rc.3
[0.1.0-rc.2]: https://github.com/ntnyq/imagemin-rs/compare/v0.1.0-rc.1...v0.1.0-rc.2
[0.1.0-rc.1]: https://github.com/ntnyq/imagemin-rs/compare/v0.1.0-rc.0...v0.1.0-rc.1
[0.1.0-rc.0]: https://github.com/ntnyq/imagemin-rs/releases/tag/v0.1.0-rc.0
