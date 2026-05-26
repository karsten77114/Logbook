# Pilot Logbook — 完整需求規格文件
> 給 Claude Code 閱讀的專案說明文件
> 本文件由 Claude (claude.ai) 與開發者討論後整理

---

## 專案背景

開發者是星宇航空 FO（副駕駛），目前使用 Log ATP 2 記錄飛行日誌，但對第三方 app 的資料安全性和穩定性有疑慮（曾發生大當機導致資料遺失風險）。同時也在維護一個給同事使用的 Kneeboard PWA（已部署於 GitHub Pages）。

目標是建立一個**自己掌控資料、功能完整、可分享給飛行員朋友使用**的 Pilot Logbook Web App。

---

## 技術架構

### 前端
- **純 PWA**（Progressive Web App），可加到 iOS 主畫面
- 主要使用裝置：iPad（Safari）
- 風格參考：深色主題，aviation 質感，非 Log ATP 2 的抄襲風格

### 後端 / 資料庫
- **Firebase Firestore**（即時同步、跨裝置）
- **Firebase Authentication**（Sign in with Apple / Sign in with Google）
- 所有資料存在 Firebase，每存一筆立即同步
- 每個使用者的資料完全隔離

### 外部 API
- **OpenSky Network API**（免費）：查詢 ADS-B 飛行軌跡
- **Kneeboard**（現有專案）：透過 URL 參數傳入航班資料

---

## 帳號機制

### 登入方式
- Sign in with Apple
- Sign in with Google
- **不支援** email/密碼註冊（避免密碼管理問題）

### 第一次登入流程
```
歡迎畫面（Sign in with Apple / Google）
    ↓
個人資料設定頁（只需填一次）
    ↓
進入空白 Logbook
```

### 個人資料欄位
- 姓名
- 職涯記錄（見下方）

### 換裝置流程
```
新裝置打開網頁
→ 點「Sign in with Apple / Google」
→ 用同一個帳號登入
→ 所有資料自動出現
```

---

## 職涯記錄

飛行員職涯會變動（換公司、升職、換機型），因此不是單一欄位，而是**時間軸式的職涯記錄**。

### 每段職涯的欄位
| 欄位 | 說明 |
|------|------|
| 開始日期 | 該段職涯的起始日期 |
| 航空公司 | 公司名稱 |
| 職位 | 見下方職位清單 |
| 主要機型 | 例如 ATR72-600、A321-252NX |
| Base Station | 駐點機場 IATA，例如 TPE、RMQ |

### 職位清單（由低到高）
1. 學生機師 / CPL
2. FO（副駕駛）
3. SFO（資深副駕駛）
4. CA（機長）
5. Check Captain
6. 其他（自填）

### 開發者本人的職涯記錄（參考）
```
2015-2017   學生機師（CPL 訓練）   -              -           -
2018-2023   華信航空               ATR72-600      FO          RMQ
2024-至今   星宇航空               A321-252NX     FO          TPE
```

### 用途
- 統計頁按公司/職位分開計算時數
- 每筆飛行記錄自動對應當時正確的職位
- 匯出時帶上正確的職涯資訊

---

## 飛行資料結構

### 基本資料（存 Firebase）

```typescript
interface Flight {
  objectId: string           // 唯一 ID
  date: string               // YYYY-MM-DD（UTC）
  flightNumber: string       // 例如 JX761
  aircraftType: string       // 例如 A321-252NX
  registration: string       // 例如 B-58211
  from: string               // IATA 出發機場
  to: string                 // IATA 目的機場

  // OOOI Times（UTC，HH:MM 格式）
  outTime: string
  offTime: string
  onTime: string
  inTime: string

  // 計算時間（分鐘）
  blockTime: number          // OUT → IN
  flightTime: number         // OFF → ON
  nightTime: number          // 自動計算，可手動 override

  // Piloting
  pfTakeoff: boolean
  pfLanding: boolean
  pic: boolean
  autoland: boolean
  goAround: boolean
  diverted: boolean

  // Approach
  approachType: string       // ILS / RNP / LOC / LDA / VOR / NDB / PAR / Visual / Contact / Circling
  runway: string             // 例如 05L、23R

  // Load Data
  totalPax: number
  totalPayload: number       // 噸
  flightPlanDistance: number // NM

  // Crew（objectId 陣列）
  crew: string[]
  crewNames: string[]

  // 軌跡（存 Firebase）
  flightTrack?: TrackPoint[]

  // Metadata
  createdAt: timestamp
  updatedAt: timestamp
}

interface TrackPoint {
  t: number    // Unix timestamp
  la: number   // latitude（4位小數）
  lo: number   // longitude（4位小數）
  a: number    // altitude（feet）
  s: number    // groundspeed（knots）
}
```

### Approach Type 清單
只有以下 10 種，不需要細分（如 ILS Z、ILS Y 等）：
- ILS
- RNP
- LOC
- LDA
- VOR
- NDB
- PAR
- Visual
- Contact
- Circling

---

## 現有資料

開發者有以下歷史資料可匯入：

### Log ATP 2 匯出（已處理）
- `logbook.json`：3,181 筆完整飛行記錄（2018-2026）
- 已合併 Numbers 的跑道資訊
- 已解析 crew objectId → 名字對應
- 檔案約 2.2MB

### Crew 名單
- 144 位機師
- 欄位：objectId、firstName、lastName、position、employeeId、licenceNumber、nationality

### 機隊資訊
- ATR72-600：B-16852 ~ B-16856 等（華信時期）
- A321-252NX：B-58201 ~ B-58213（星宇時期）

---

## 頁面結構

### 1. 登入 / 歡迎頁
- Sign in with Apple
- Sign in with Google
- App 名稱、簡短說明

### 2. 列表頁（主頁）

**Header 統計：**
- 總 Sectors
- Total Block Time
- Total Flight Time
- Night Time
- PF T/O 次數
- PF LDG 次數

**功能：**
- 搜尋（航班號、機場、機型、機長名字）
- 篩選（年份、機型、PF T/O、PF LDG、夜間、Go Around、Autoland）
- 排序（點欄位標題）
- 分頁（每頁 50 筆）
- 點任一筆 → 進入詳細頁

### 3. 詳細頁

**區塊：**
- 基本資料（航班號、日期、航線、機型、Registration）
- OOOI Times
- Block / Flight / Night Time
- Approach Type + Runway
- PAX / Payload / Distance
- PF Takeoff / PF Landing / PIC
- Events（Autoland / Go Around / Diverted）
- Crew 名單
- 飛行軌跡地圖（Leaflet.js）
- Altitude Profile 折線圖
- Groundspeed 折線圖
- Playback bar（拖拉同步地圖和圖表）

### 4. 新增航班頁

**設計：5 步驟橫向滑動，每步驟不需要上下捲動**

**Step 1 — Route & Date**
- 日期（預設今天 UTC）
- 航班號
- FROM（IATA）
- TO（IATA）

**Step 2 — OOOI Times**
- OUT / OFF / ON / IN（HHMM 格式，數字鍵盤）
- Block Time / Flight Time（自動計算）
- Night Time（自動計算，可手動 override）

**Step 3 — Aircraft & Approach**
- Registration（從清單選，自動帶入機型）
- Approach Type（10 個選項 grid）
- Landing Runway（手動輸入）

**Step 4 — Piloting & Load**
- PF Takeoff / PF Landing / PIC / Autoland / Go Around / Diverted（Toggle 卡片）
- PAX / Payload / Distance

**Step 5 — Crew**
- 可搜尋的 Crew 名單選取
- 最多 4 位

**自動帶入（來自 Kneeboard URL 參數）：**
```
logbook://add?fn=JX761&date=2026-05-23&from=TPE&to=CGK&reg=B-58211&type=A321-252NX&dist=2289
```
帶入後自動跳過 Step 1 和 Step 3 的對應欄位。

**儲存後自動觸發：**
- 向 OpenSky API 查詢飛行軌跡
- 軌跡資料一併存進 Firebase

### 5. 設定頁

**區塊：**
- 個人資料（姓名）
- 職涯記錄（新增 / 編輯 / 刪除）
- Crew 名單管理（新增 / 編輯）
- 匯出備份（JSON）
- 匯入資料（JSON）
- 登出

---

## Kneeboard 整合

現有專案：`https://karsten77114.github.io/Kneeboard/`

整合方式：Kneeboard 上的航班資料頁面加一個「Log This Flight」按鈕，點擊後帶參數開啟 Logbook 新增頁面。

URL 參數格式：
```
fn=JX761          航班號
date=2026-05-23   日期（UTC）
from=TPE          出發機場
to=CGK            目的機場
reg=B-58211       Registration
type=A321-252NX   機型
dist=2289         Flight Plan Distance (NM)
```

---

## Night Time 計算邏輯

根據 OFF 時間、ON 時間、出發機場座標、目的機場座標，計算飛行期間有多少時間是在夜間（日落後、日出前）。

使用 SunCalc.js 或自行計算日出日落時間。

使用者可手動 override（輸入 HHMM）。

---

## OpenSky API 整合

**端點：**
```
GET https://opensky-network.org/api/flights/aircraft
  ?icao24={registration_icao}
  &begin={unix_timestamp}
  &end={unix_timestamp}
```

**Registration → ICAO24 轉換：**
- B-58211 → 需要查詢對應的 ICAO24 hex code
- 建議在機隊資料庫裡維護這個對應關係

**軌跡端點：**
```
GET https://opensky-network.org/api/tracks/all
  ?icao24={icao24}
  &time={unix_timestamp}
```

**注意：**
- 免費 API，有 rate limit
- 資料有 1-2 小時延遲
- 歷史資料保留 30 天（所以要盡快查詢並存進 Firebase）

---

## 資料大小估算

| 類型 | 每筆大小 | 3,181 筆總計 |
|------|---------|-------------|
| 基本飛行資料 | ~2-3 KB | ~9 MB |
| 飛行軌跡 | ~34-100 KB | ~105-270 MB |
| **合計** | | **~280 MB** |

Firebase 免費額度 1GB，預計 10 年內不會超過。

---

## 匯入現有資料

開發者有 `logbook.json`（3,181 筆），需要提供一個**一次性匯入工具**，將現有資料批次寫入 Firebase。

注意事項：
- Firestore 批次寫入每次最多 500 筆
- 需要分批處理
- 匯入時不重複（用 objectId 判斷）

---

## UI / UX 設計原則

- **主要裝置：iPhone（手機優先）**，iPad 為次要
- 所有介面以手機螢幕尺寸為基準設計，iPad 再做響應式放大
- 深色主題
- 字體：aviation 質感，非泛用 AI 風格（避免 Inter、Roboto）
- 新增航班頁：**單手可操作**，落地後站在機坪馬上填，步驟清晰快速
- 不過度捲動，每個步驟的資訊量控制在一個手機螢幕內
- 按鈕和互動元件尺寸要符合手指觸控（最小 44px）
- 參考但不抄襲 Log ATP 2 的介面

---

## 開發優先順序

1. Firebase 設定（Auth + Firestore）
2. 登入頁 + 個人資料設定
3. 新增航班（5 步驟）+ 基本存取
4. 列表頁
5. 詳細頁（不含軌跡）
6. OpenSky 軌跡整合
7. 詳細頁軌跡地圖 + 圖表
8. 設定頁（職涯記錄、Crew 管理）
9. 現有資料匯入工具
10. Kneeboard 整合

---

## 相關檔案

開發者有以下檔案可提供：
- `logbook.json`（3,181 筆歷史資料，已處理完畢）
- `Log_ATP_Crew-data.csv`（144 位機師名單）
- `LogATP_system_data-flight.csv`（原始系統資料）

---

*文件版本：2026-05-26*
*整理自 claude.ai 對話*
