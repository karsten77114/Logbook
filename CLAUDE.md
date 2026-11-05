# Claude Project Entry

本檔可單獨使用，不依賴 repo 外的檔案。通用規則與 `AGENTS.md` 一致，衝突時以較嚴格者為準。

## 開始前

1. 讀 `.agent-project.yml`、`AGENTS.md`、`CLOUD_DEVELOPMENT.md`。
2. 若上層存在 `../../../PROJECT_CONTEXT.md`、`../../../000_Agent/AGENT_ROUTING.md`、`../../../000_Agent/memory/MEMORY.md` 及 `.agent-project.yml` 列出的 memory 檔，可一併參考；不存在就略過。

## 規則

- 在本資料夾做 Logbook 實作；commit / push 前確認 Git root。
- 使用繁體中文，中英文之間加空格，回覆簡潔。
- 不要寫入或讀取 secrets（`.secrets/`、`secrets.env`、`.env`、私鑰、token）。
- 更新 Firestore 的 `aircraftSettings` 必須使用 `merge: true`，避免覆蓋 `custom` 欄位。
- 快取的 JS、CSS 或資料有變動時，更新 service worker 的快取版本號。
- Claude 實作、Codex review；不要求任何不可用的 wrapper，也不要委派給其他 AI CLI，自己用可用工具完成。
- 不自稱已驗收或已上線；如實回報已做、未做與疑慮。
- 共享 memory 僅在使用者明確要求記錄時更新；獨立 clone 不建立第二份私人記憶。
