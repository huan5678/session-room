# session-room

English | [繁體中文](README.zh-TW.md)

A pane beside the chat that draws this project's Claude sessions as characters in a top-down pixel room. `/session-room` reopens it.

<img src="assets/preview.svg" width="448" alt="A pixel bedroom-office: four sessions at their desks with their backs to us, three asleep in bed, one with a ! bubble and one with a ? bubble on the rugs">

*Preview drawn by the mod's own `roomSvg` from made-up sessions. In the pane, a board and name buttons sit below the room.*

Requires the Claude desktop app on macOS or Windows: the room is SVG, which only the desktop surface draws (a terminal shows the board alone), and session titles and links come from the app's local files. Linux has not been tried. If the room stays empty, a line under it says why.

## Install

At the prompt of a terminal session:

```
/plugin install session-room --marketplace huan5678/session-room
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```bash
claude plugin install session-room --marketplace huan5678/session-room
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `huan5678/session-room`, then Add plugin.

## Update

An installed copy only sees a new release once its marketplace is refreshed: until then the version stays the same and the desktop app's update button stays grey. From a shell:

```bash
claude plugin marketplace update session-room
claude plugin update session-room@session-room
```

Then restart the app. Removing the plugin and adding it again is not enough on its own: it installs the cached version again.

## What it shows

| Session state | Character |
| --- | --- |
| working (`busy`) | at their own desk, back to us, typing dots |
| waiting on you | on a rug with a `!` (a prompt is open) or `?` (the last turn asked for input) |
| idle | asleep in their own bed |
| archived or process ended | walks out of the door, then gone |

Below the room, a board lists the same sessions in three columns: waiting on you, working, finished. Each card shows the session's title, short name, time and the app's summary of its last turn. Its `開啟` button, or the row of name buttons under the room, opens that session through the app's deep link (`claude://claude.ai/epitaxy/<id>`).

`選角色` under the room (or `/session-room-cast`) opens a pane to choose which of the 24 characters appear; the choice is kept across sessions. Sessions outnumbering the chosen characters repeat them.

## Characters of your own

Art whose license forbids sharing it can still appear in your own room, without entering this repository. At session start the mod reads `~/.claude/session-room-local/cast.json` if it exists, and `選角色` lists its characters first, so sessions take them before the built-in ones:

```json
{ "characters": [{ "pack": "group name", "offset": [-5, -5], "front": "<path…/>", "back": "<path…/>", "walk": [["step", "stand", "other step"]] }] }
```

`walk` has eight entries, N NE E SE S SW W NW, each of three frames. Every drawing is `<path stroke="#rrggbb" d="M0 0.5h1…"/>` elements in the form `assets/build_sprites.py` writes, and a character holding anything else is ignored. `offset` places them on the room's 16x17 sprite. A character already chosen stays; new ones need choosing if you have saved a choice.

## License

The code is under the [MIT License](LICENSE). The art is not: it is under CC BY 4.0, as below, including the sprites in `hooks/sprites.ts`, `assets/preview.svg` and `.claude-plugin/icon.png`.

## Credits and licenses

Every sprite comes from these packs through `assets/build_sprites.py` and is stored in `hooks/sprites.ts` as pixel-exact SVG paths, so the pane needs no bitmap. No other art is used; the floor colour, trim, bubbles and text are plain SVG.

| Pack | Author | License | Used for |
| --- | --- | --- | --- |
| [Small 8-direction Characters](https://axulart.itch.io/small-8-direction-characters) | AxulArt | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | every character |
| [AxulArt's Basic Top-down interior](https://axulart.itch.io/axularts-basic-top-down-interior) | AxulArt | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | the room and its furniture |

Modified or based on AxulArt's sprites. The changes: the 24 characters are recoloured from the Girl, Boy and Template sprites (the Template painted by region into hair, face and clothes), the furniture is cut from the sheet and composed into a room, and all of it is converted to SVG paths.

## Where the state comes from

The mod API has no list of other sessions, so the mod polls local files every 2 seconds through `$.fs` and `$.process`. These files are internal to Claude Code and the desktop app, not a documented API, and may change between releases:

- `~/.claude/sessions/<pid>.json` (on Windows `%USERPROFILE%\.claude\sessions`): `status` (`busy`, `idle`, `waiting`), `waitingFor`, `cwd`, `name`, `hostSessionId`. The `.key` files beside them are never read.
- `~/Library/Application Support/Claude/claude-code-sessions/*/*/local_*.json` (on Windows `%APPDATA%\Claude\claude-code-sessions`): `title`, `isArchived`, `postTurnSummary`, `spawnedFrom.name`. Only those fields are kept. Only this project's live sessions are read, and only when a record changed.
- `ps -p <pids>` (on Windows `tasklist`), every 6 seconds: drops status files whose process has died.

A session opens with `open` on macOS and `rundll32 url.dll,FileProtocolHandler` on Windows.

## Rebuild the sprites

```bash
python3 -I assets/build_sprites.py <characters sheet.png> <interior sheet.png> hooks/sprites.ts
```
