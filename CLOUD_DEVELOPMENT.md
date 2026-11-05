# Cloud Development

在雲端 / 容器環境開發 Logbook（靜態 PWA，無 build 步驟）的最小流程。

## 環境

- Node 22
- 不需 `npm install`：`package.json` 無任何 dependency。

## 指令

```bash
npm run check   # 遞迴 JS/MJS 語法檢查 + 本地相對路徑 import 存在性檢查
npm test        # node:test，runway smoke test
python3 -m http.server 8000   # 本地預覽 http://localhost:8000
```

- `check` 略過 `.git`、`node_modules`、`assets/vendor`。
- `npm test` 對真實的 `detectRunway` 與 `RUNWAYS` 做 smoke test：未知機場、空 / 過短航跡回 `null`，以及 TPE 合成的確定性進場能判出正確跑道。

## 不在範圍內

- Firebase 登入（雲端環境不登入）。
- 實機 UI 驗證與正式環境測試，需另外在本機 / 實機進行。
- 雲端與 CI 不得放入 secrets 或正式資料（飛行紀錄等）。
- 部署：CI 只跑 `check` 與 `test`，不部署。

## 注意事項

- `tools/test_runway.mjs` 是診斷用腳本：只印出失敗項目，**不會**因失敗而回傳非 0。它不是完整通過的測試，不要當作全數通過的證據；`npm test` 也不包含它。
- `npm run check` 只做語法與靜態 import 檢查，不檢查動態 import、執行期行為或 UI。
- 修改會被快取的 JS、CSS 或資料時，要更新 service worker 的快取版本號。
- 更新 Firestore 的 `aircraftSettings` 必須使用 `merge: true`，避免覆蓋 `custom` 欄位。

## CI

`.github/workflows/check.yml`：checkout、Node 22、`npm run check`、`npm test`；權限僅 `contents: read`。
