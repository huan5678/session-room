# session-room

[English](README.md) | 繁體中文

一個放在對話旁邊的 pane，把這個專案的 Claude sessions 畫成俯視像素房間裡的角色。用 `/session-room` 可以重新打開。

<img src="assets/preview.svg" width="448" alt="像素臥室兼辦公室：四個 session 背對鏡頭坐在桌前工作，三個在床上睡覺，地毯上有一個頂著 ! 泡泡、一個頂著 ? 泡泡">

*預覽圖由 mod 自己的 `roomSvg` 用虛構的 sessions 畫出。實際的 pane 裡，房間下方還有看板和名字按鈕。*

需要 macOS 或 Windows 上的 Claude desktop app：房間是 SVG，只有 desktop 畫得出來（terminal 只會顯示看板），session 標題和連結也來自 app 的本機檔案。Linux 還沒試過。房間一直是空的時候，下方會有一行字說明原因。

## 安裝

在 terminal session 的輸入框輸入：

```
/plugin install session-room --marketplace huan5678/session-room
```

輸入 `y` 新增 marketplace，再選擇安裝範圍。或從 shell 執行：

```bash
claude plugin install session-room --marketplace huan5678/session-room
```

Desktop app 不能用 `/plugin`：按輸入框旁的 **+**，選 Plugins，用 `huan5678/session-room` 執行 Add marketplace，再按 Add plugin。

## 更新

已安裝的外掛要等 marketplace 重新整理後，才看得到新版本；在那之前，版本號不會變，desktop app 的「更新」按鈕也會是灰的。從 shell 執行：

```bash
claude plugin marketplace update session-room
claude plugin update session-room@session-room
```

然後重開 app。只移除外掛再裝回來沒有用，會裝回快取裡的舊版。

## 畫面內容

| Session 狀態 | 角色 |
| --- | --- |
| 工作中（`busy`） | 背對鏡頭坐在自己的桌前，有打字的跳動點 |
| 等你 | 站在地毯上，頭上有 `!`（有提示框開著）或 `?`（上一輪要求你輸入） |
| 閒置 | 在自己的床上睡覺 |
| 已封存或程序已結束 | 走出門後消失 |

房間下方的看板用三欄列出同樣的 sessions：等你回覆、工作中、做完了。每張卡片顯示 session 的標題、短名、時間和 app 對上一輪的摘要。按卡片的 `開啟`，或房間下方那排名字按鈕，會透過 app 的深層連結（`claude://claude.ai/epitaxy/<id>`）開啟該 session。

房間下方的 `選角色`（或 `/session-room-cast`）會打開一個 pane，讓你從 24 個角色裡選擇要出現的角色，選擇會跨 session 保存。Session 比選到的角色多時，角色會重複出現。

## 自己的角色

授權不允許分享的素材，也可以只出現在你自己的房間，不必進這個 repo。Session 啟動時，mod 會讀取 `~/.claude/session-room-local/cast.json`（如果存在），`選角色` 會把裡面的角色排在最前面，session 會優先使用它們：

```json
{ "characters": [{ "pack": "群組名稱", "offset": [-5, -5], "front": "<path…/>", "back": "<path…/>", "walk": [["跨步", "站立", "另一腳跨步"]] }] }
```

`walk` 有 8 項，依序是 N NE E SE S SW W NW，每項 3 格。每張圖都是 `assets/build_sprites.py` 輸出的那種 `<path stroke="#rrggbb" d="M0 0.5h1…"/>` 元素，含有其他內容的角色會被忽略。`offset` 用來對齊房間 16×17 的角色位置。如果你已經存過角色選擇，新角色要自己勾選才會加入。

## 授權

程式碼採用 [MIT License](LICENSE)。美術素材不適用 MIT，而是採用 CC BY 4.0（詳見下方），包含 `hooks/sprites.ts` 內的圖像、`assets/preview.svg` 和 `.claude-plugin/icon.png`。

## 素材來源與授權

所有圖像都來自以下素材包，經 `assets/build_sprites.py` 處理後，以逐像素的 SVG path 存在 `hooks/sprites.ts`，所以 pane 不需要點陣圖。沒有使用其他美術素材；地板底色、邊框、泡泡和文字都是純 SVG。

| 素材包 | 作者 | 授權 | 用途 |
| --- | --- | --- | --- |
| [Small 8-direction Characters](https://axulart.itch.io/small-8-direction-characters) | AxulArt | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 所有角色 |
| [AxulArt's Basic Top-down interior](https://axulart.itch.io/axularts-basic-top-down-interior) | AxulArt | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 房間和家具 |

Modified or based on AxulArt's sprites。修改內容：24 個角色由 Girl、Boy、Template 換色而成（Template 依頭髮、臉、衣服分區上色），家具從素材表裁切後拼成房間，全部轉換為 SVG path。

## 狀態來源

Mod API 沒有提供其他 session 的清單，所以這個 mod 每 2 秒透過 `$.fs` 和 `$.process` 輪詢本機檔案。這些檔案是 Claude Code 和 desktop app 的內部檔案，不是公開文件記載的 API，可能隨版本改變：

- `~/.claude/sessions/<pid>.json`（Windows 是 `%USERPROFILE%\.claude\sessions`）：`status`（`busy`、`idle`、`waiting`）、`waitingFor`、`cwd`、`name`、`hostSessionId`。旁邊的 `.key` 檔案一律不讀。
- `~/Library/Application Support/Claude/claude-code-sessions/*/*/local_*.json`（Windows 是 `%APPDATA%\Claude\claude-code-sessions`）：`title`、`isArchived`、`postTurnSummary`、`spawnedFrom.name`。只保留這些欄位，也只讀這個專案執行中的 sessions，而且只在紀錄有變動時才讀。
- `ps -p <pids>`（Windows 是 `tasklist`），每 6 秒一次：移除程序已結束的狀態檔。

開啟 session 時，macOS 用 `open`，Windows 用 `rundll32 url.dll,FileProtocolHandler`。

## 重新產生圖像

```bash
python3 -I assets/build_sprites.py <角色素材表.png> <室內素材表.png> hooks/sprites.ts
```
