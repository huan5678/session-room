# Changelog

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
