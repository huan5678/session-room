# Changelog

## [0.3.3](https://github.com/huan5678/session-room/releases/tag/v0.3.3) - 2026-11-10

### Changed

- The READMEs now cover Windows, confirmed working on a Windows desktop with 0.3.2, and how to update an installed copy: refresh the marketplace first, or the version stays old and the desktop app's update button stays grey.

No change to the mod's behaviour.

## [0.3.2](https://github.com/huan5678/session-room/releases/tag/v0.3.2) - 2026-11-10

### Fixed

- Windows is now also recognised by a drive-letter project path, for hosts that start the engine without `OS` set, and the home folder falls back between `USERPROFILE` and `HOME`.
- A failed process check no longer empties the room: everyone with a status file stays.

### Added

- An empty room says why under it: the status folder could not be read, held no files, held only other projects' sessions, or their processes were gone.

## [0.3.1](https://github.com/huan5678/session-room/releases/tag/v0.3.1) - 2026-11-09

### Fixed

- Windows: the room stayed empty because the mod looked for sessions with `HOME` and `ps`. It now uses `USERPROFILE`, `tasklist`, `%APPDATA%\Claude\claude-code-sessions` and `rundll32`, and compares paths regardless of slash style and case. This is covered by a simulated test only and has not yet been run on Windows.

## [0.3.0](https://github.com/huan5678/session-room/releases/tag/v0.3.0) - 2026-11-09

### Added

- Characters of your own: an optional `~/.claude/session-room-local/cast.json` adds characters that stay on your computer, for art whose license forbids sharing it.

## [0.2.1](https://github.com/huan5678/session-room/releases/tag/v0.2.1) - 2026-11-09

### Added

- Characters face their way and play walk frames as they move, in all eight directions. When too many walk at once for the 131072-character limit, they slide that once without frames.

### Fixed

- Standing characters used a mid-step frame; they now use the pack's standing one.
- The Template characters' side and three-quarter views are painted with faces instead of all hair.

## [0.2.0](https://github.com/huan5678/session-room/releases/tag/v0.2.0) - 2026-11-09

### Changed

- All art now comes from AxulArt's CC BY 4.0 packs instead of Kenney's CC0 ones: the room is a bedroom-office, and the 24 characters are recoloured from the pack's sprites. The art's license changes with it; the code stays MIT.
- Working sessions sit at a desk with their backs to us, idle ones sleep in bed, waiting ones stand on a rug.
- Saved character choices reset, since the characters are new.

### Removed

- The cast pane's "humans only" button.

## [0.1.3](https://github.com/huan5678/session-room/releases/tag/v0.1.3) - 2026-11-08

Documentation only; the mod behaves the same as in 0.1.2.

### Added

- This changelog (`CHANGELOG.md`).

## [0.1.2](https://github.com/huan5678/session-room/releases/tag/v0.1.2) - 2026-11-08

Documentation only; the mod behaves the same as in 0.1.1.

### Added

- Traditional Chinese README (`README.zh-TW.md`), linked from the English one.

## [0.1.1](https://github.com/huan5678/session-room/releases/tag/v0.1.1) - 2026-11-08

Packaging and metadata only; the mod behaves the same as in 0.1.0.

### Added

- MIT license for the code; the art stays CC0.
- Room preview in the README (`assets/preview.svg`), drawn from made-up sessions.
- Plugin icon (`.claude-plugin/icon.png`), drawn from Tiny Factory tiles.
- `author` in `plugin.json` and `description` in `marketplace.json`.
