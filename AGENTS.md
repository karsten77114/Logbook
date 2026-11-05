# Project Agent Entry

這是 Logbook（靜態 PWA）的 agent 入口，可單獨使用，不依賴 repo 外的檔案。

## 開始前

1. 讀 `.agent-project.yml`、`CLOUD_DEVELOPMENT.md`。
2. 若上層存在 `../../../PROJECT_CONTEXT.md`、`../../../000_Agent/AGENT_ROUTING.md`、`../../../000_Agent/memory/MEMORY.md` 及 `.agent-project.yml` 列出的 memory 檔，可一併參考；不存在就略過，不影響作業。

## 工作規則

- 以本資料夾為 Logbook 的 Git 工作根目錄；commit / push 前先確認 Git root。
- 不同 repo 的 commit 要分開；跨專案工作透過共用 spec 協調（路徑見 `.agent-project.yml`），spec 不存在時改在對話中說明。
- 文件與回覆使用繁體中文，中英文之間加空格，保持簡潔。
- 絕不把 secrets、token、私鑰、`.env`、`secrets.env`、`.secrets/` 內容寫進 repo、CI 或對話，也不要讀取這些檔案。
- 更新 Firestore 的 `aircraftSettings` 時必須使用 `merge: true`，避免覆蓋 `custom` 欄位；其他寫入保留原有契約。
- 快取的 JS、CSS 或資料有變動時，必須同步更新 service worker 的快取版本號。
- 視覺變更後要在瀏覽器驗證 UI；雲端環境無法驗證時，要明說未驗證。
- 變更前先讀相關程式碼，保留既有產品行為與部署方式，不順手重構。

## 分工

- Claude 負責實作；Codex 負責 review 與最終整合（Git/GitHub、驗收）。
- 不強制使用任何特定 wrapper 或外部 CLI；工具不可用時，直接用目前環境可用的工具完成，不要因此停下。
- 實作者不自稱已驗收、已上線；驗證結果如實回報，失敗就貼出輸出。

## 驗證

- `npm run check`：JS/MJS 語法與本地 import 檢查。
- `npm test`：runway smoke test。
- 細節與限制見 `CLOUD_DEVELOPMENT.md`。
