# 狀態驅動動作外掛 — IT 維護手冊

**對象**：接手維護、除錯、升版的 IT 同仁
**適用版本**：v1.18.0（`contents/manifest.json` 的 `version`）
**姊妹文件**：
- 管理者怎麼設規則 → [README.md](README.md) 第 1～10 節
- 技術細節逐項說明 → [README.md 附錄 B](README.md)（B-1 ～ B-15）
- 提醒視窗怎麼設 → [提醒視窗操作教學.md](提醒視窗操作教學.md)
- 開發規矩（給改程式的人）→ [CLAUDE.md](CLAUDE.md)

> 本手冊不重複 README 的操作步驟，專門回答三件事：**這東西怎麼運作、壞了先看哪裡、要改的時候怎麼改不出事。**

---

## 目錄

1. [先看這裡：五分鐘速覽](#1-先看這裡五分鐘速覽)
2. [整體架構](#2-整體架構)
3. [檔案地圖](#3-檔案地圖)
4. [資料存在哪裡（含 Token 怎麼保護）](#4-資料存在哪裡含-token-怎麼保護)
5. [執行流程：事件 → 規則 → 寫入](#5-執行流程事件--規則--寫入)
6. [除錯：從症狀找原因](#6-除錯從症狀找原因)
7. [Console 訊息對照表](#7-console-訊息對照表)
8. [kintone 錯誤碼對照](#8-kintone-錯誤碼對照)
9. [使用者回報問題時，請對方提供這些](#9-使用者回報問題時請對方提供這些)
10. [日常維運](#10-日常維運)
11. [改程式的流程與規矩](#11-改程式的流程與規矩)
12. [常見修改範例](#12-常見修改範例)
13. [已知限制與容易踩的地方](#13-已知限制與容易踩的地方)
14. [版本沿革](#14-版本沿革)

---

## 1. 先看這裡：五分鐘速覽

**這個外掛做什麼**
記錄的流程狀態改變（或新增、編輯、儲存）時，依管理者在設定畫面定義的「規則」，自動做三件事之一：

| 動作 (`action`) | 白話 |
|---|---|
| `writeSelf` | 把值寫進**本筆記錄**的欄位或子表格 |
| `writeOther` | 把值寫進**其他 App** 的記錄（新增／更新／有就更新沒有就新增） |
| `dialog` | 跳出提醒視窗，使用者按確定才往下做；有取消鍵時可中止儲存或流程推進 |

另外有兩個獨立功能：**執行 Log**（把每次執行結果寫到 Log App，本公司是 [SYS-06-6_Plug-In(Log)](https://nipponexpress-taiwan.cybozu.com/k/708/)，App ID `708`）、**建立人狀態檢查**（一覽表按鈕，找出建立人已離職的記錄）。

**它是被動的**：沒有排程、沒有常駐程式、沒有輪詢。使用者在瀏覽器做了某個動作才會跑，跑完就結束。所以「沒有人操作 = 什麼事都不會發生」，不用擔心它在背景消耗資源。

**除錯最短路徑**

```
使用者說「沒反應 / 壞了」
   │
   ├─① 有設 Log App？ → 打開 Log App 看那一筆（見 6.1）
   ├─② 瀏覽器 F12 → Console → 在過濾框輸入  [sda]  （見第 7 節）
   └─③ 對照第 6 節的症狀表
```

**四條不能碰的線**（違反會出大事，細節見第 11 節）

1. `desktop.js` 與 `mobile.js` 必須一模一樣。
2. 不要 `console.log` 原始設定（內含 Token）。
3. `.ppk` 簽章私鑰不能遺失、不能外流、不能進 git。
4. JS 裡不寫註解，技術說明寫進 README 附錄 B。

---

## 2. 整體架構

```
┌──────────────── kintone 租戶（cybozu.com）────────────────┐
│                                                           │
│  外掛（一份程式碼，裝在租戶層級）                           │
│   ├─ 設定畫面  config.js ──→ 寫入 ─┐                      │
│   └─ 執行期    desktop.js / mobile.js                     │
│                       ▲            ▼                      │
│                       │     【每個 App 各自一份設定】       │
│                       └───── 讀取 ──┘                      │
│                                                           │
│   Token 另存「加密代理設定」（伺服器端，前端讀不到）          │
└───────────────────────────────────────────────────────────┘

使用者操作（開畫面、按儲存、按流程按鈕）
        │ kintone 觸發事件
        ▼
  desktop.js / mobile.js 的 handler
        │ 找出「這個事件 + 這個狀態 + 這些欄位條件」命中的規則
        ▼
  依序執行：dialog → writeSelf → （最後）writeOther
        │
        ├─ 寫進本筆記錄（event.record 直接改，隨 kintone 一起存）
        ├─ 呼叫 REST API 寫其他 App（用加密保存的 Token）
        └─ （選配）寫一筆 Log 到 Log App
```

**三個重要觀念**

1. **程式只有一份，設定每個 App 一份。** 升級外掛 = 所有 App 的程式一起換新，各 App 的規則不受影響。
2. **執行期程式在使用者的瀏覽器裡跑**，用的是使用者自己的登入身分。權限不夠時才改用 API Token 代打（見 4.2）。
3. **規則的比對引擎只有一套。** `writeSelf`／`writeOther`／`dialog` 共用同一組「觸發時機 + 狀態條件 + 欄位條件」判斷，不要為新動作另寫一套比對邏輯。

---

## 3. 檔案地圖

```
status-driven-actions-plugin/
├─ IT維護手冊.md              ← 本文件
├─ README.md                  ← 管理者說明書 + 附錄 B 技術說明
├─ 提醒視窗操作教學.md         ← 管理者用：提醒視窗
├─ CLAUDE.md                  ← 開發規矩、設定 JSON 結構（匯入用）
├─ build.ps1                  ← 一鍵打包腳本（同步 mobile.js → 改版號 → 打包）
├─ config-ui-preview.html     ← 設定畫面離線預覽（不在打包內容裡）
├─ *.ppk                      ← 簽章私鑰（機密）
├─ plugin*.zip                ← 打包產物（不進 git）
├─ docs/superpowers/          ← 較大改動的設計文件（specs）與實作計畫（plans）
└─ contents/                  ← 真正會被打包進外掛的內容
   ├─ manifest.json           ← 版本號、各畫面載入哪些 JS
   ├─ dist/
   │  ├─ desktop.js           ← 執行期（電腦版）
   │  ├─ mobile.js            ← 與 desktop.js 內容完全相同
   │  ├─ dialog.js            ← 提醒視窗／表格面板元件（三邊共用）
   │  └─ config.js            ← 設定畫面
   ├─ source/html|css|image/  ← 設定畫面外殼、樣式、圖示
   └─ 3rd_parties/kintone-config-helper.js   ← 讀欄位清單用
```

### 哪個畫面載入哪些檔案（`manifest.json`）

| 畫面 | 載入順序 |
|---|---|
| 電腦版記錄／一覽表 | `dialog.js` → `desktop.js` |
| 手機版記錄／一覽表 | `dialog.js` → `mobile.js` |
| 外掛設定畫面 | `kintone-config-helper.js` → `dialog.js` → `config.js` |

`dialog.js` 一定排在主檔前面，因為主檔要用 `window.SdaDialog`。

### 為什麼有 `mobile.js`，又為什麼要跟 `desktop.js` 一樣

kintone 要求電腦版與手機版各指定自己的 JS。本外掛偷懶但安全的做法是：**同一份程式同時註冊電腦版事件名稱（`app.record.*`）與手機版事件名稱（`mobile.app.record.*`）**，kintone 會自動忽略不屬於當前平台的那一半。所以兩個檔案內容一樣就好。

**後果**：只改 `desktop.js` 忘了同步 → 電腦版正常、手機版還是舊行為。這是最常見的人為失誤。`build.ps1` 打包時會自動覆蓋，但手動打包或直接上傳就不會，見 11.2。

### `desktop.js` 內部分區（約 2,400 行，依行號順序）

| 約略行號 | 區塊 | 重點函式 |
|---|---|---|
| 1–60 | 讀取設定、解析 Token 旗標 | `CONFIG`、`RAW_TOKENS`、`SECURED_APP_IDS` |
| 60–160 | 平台工具、錯誤分類 | `getAppId`、`errorCodeOf`、`classifyError`、`friendlyError`、`safeHandler`、`checkEditPermission` |
| 168–230 | **API 呼叫（含 Token 三條路徑）** | `apiWithToken` |
| 234–290 | 寫 Log | `recordError`、`writeLog`、`postLog` |
| 295–330 | 附件複製 | `downloadFileBlob`、`uploadFileBlob`、`copyAttachments` |
| 332–640 | **值怎麼算** | `resolveValue`（各種 `valueSource`）、`evalFormula`、`lookupAcrossApp`、日期加減 |
| 642–750 | 欄位寫入、子表格 | `classifyWrite`、`writeToField`、`buildSubRow` |
| 752–850 | **規則比對** | `triggerMatches`、`statusMatchesList`、`statusMatches` |
| 856–950 | 動作執行 | `runWriteSelf`、`runDialog`、`interpolateFields` |
| 951–1065 | 寫其他 App、補償寫入 | `buildOtherPayload`、`runWriteOther`、`compensationWrite` |
| 1074–1165 | **規則總調度** | `applyRules` |
| 1166–1300 | 畫面事件、Log 包裝 | `handleCreateShow`、`handleEditShow`、`loggedApply`、`flushSubmitLog` |
| 1307–1445 | 對外函式、存檔後規則 | `runProceedRulesViaApi`、`runSuccessRules`、`window.NXSdaProceed`、`window.NXSdaApi` |
| 1445–2330 | 建立人狀態檢查 | `openCreatorCheckPanel`、`ccFetchUsers`、`ccMakeEditor`、`ccCheckVisibility` |
| 2335–2377 | **事件註冊** | `kintone.events.on(...)` |

> 行號會隨改版漂移，用函式名稱搜尋比較可靠。

---

## 4. 資料存在哪裡（含 Token 怎麼保護）

### 4.1 兩個儲存位置

| 存放處 | 內容 | 誰讀得到 |
|---|---|---|
| **外掛一般設定** `kintone.plugin.app.getConfig(PLUGIN_ID).data`（單一 JSON 字串） | 規則、提醒視窗外觀、Log App ID、建立人檢查設定、各 Token 的**旗標**（`hasSelfToken` 等） | 能開該 App 的使用者，用 DevTools 就看得到。**所以裡面絕對不能有機密。** |
| **加密代理設定** `kintone.plugin.app.setProxyConfig` | 所有 API Token 本身 | 只有 kintone 伺服器。前端程式送出請求時，由伺服器端把 Token 補進 header |

存檔時（`config.js` 的 `save()`）會：

1. 把 Token 從設定物件裡拿掉，只留「有沒有設」的旗標（`hasSelfToken`、`hasLogToken`、`hasAdminApiToken`；跨 App 的列只留 `appId`、`appLabel`、`secured: true`）。
2. 呼叫 `setProxyConfig` 5 次，依序登記：
   - 本租戶 `/k/v1/` 的 GET、POST、PUT（header 帶 `X-Cybozu-API-Token`，**所有 Token 以逗號串在同一個 header**）
   - `/v1/` 的 GET（header 帶 `Authorization: Bearer <共通管理權杖>`）
   - 一個假網址 `https://sda-plugin.invalid/token-map` 的 POST，**只拿來當儲存槽**，把 Token 對照表存進去。設定畫面再開時用 `getProxyConfig` 讀回來顯示，這個網址不會真的被呼叫。
3. 最後才 `setConfig` 寫入一般設定。

### 4.2 `apiWithToken` 的三條路徑

所有「可能需要 Token」的 REST 呼叫都走 `apiWithToken(path, method, body, appId)`，它依序判斷：

```
有舊版明文 Token（CONFIG 裡直接有 token 字串）？
  └─是→ 用 fetch + X-Cybozu-API-Token 直接打          ← 舊版相容路徑
  └─否→ 這個 App 的 Token 有加密保存（secured）？
         └─是→ kintone.plugin.app.proxy(...)           ← 目前主要路徑
         └─否→ kintone.api(...)  用使用者自己的登入身分  ← 沒設 Token 的退路
```

**實務意義**

- 沒設 Token ≠ 失敗，只是改用「操作者本人的權限」。權限夠就成功，不夠就回 `permission` 類錯誤。
- 舊版（v1.12 以前）存的是明文 Token。管理者**重新儲存一次設定**後，就會轉成加密保存。
- 建立人狀態檢查裡「讀／改／刪記錄」**刻意不走這條路**，一律用操作者 session，見 B-15。

### 4.3 改 Token 的方法

只有一個正確方法：**到外掛設定畫面改，按「儲存」，再回 App「更新 App」。** 不要試圖直接改程式或 config JSON。

| 想做的事 | 做法 |
|---|---|
| 換本 App Token | 設定畫面第 1 區 → 本 App Token → 儲存 |
| 新增要寫入的其他 App | 第 1 區「跨 App Token 對應表」新增 App ID + Token |
| 換共通管理權杖（`cy.s.api1.…`） | 第 1 區 → 共通管理 API 權杖 → 先按「測試連線」→ 儲存 |
| 清掉某把 Token | 清空欄位後儲存。程式有處理「清空時要把 header 覆寫成空」，舊 Token 不會殘留在代理設定裡 |

> **兩種 Token 不能搞混**：App 的 API Token（`X-Cybozu-API-Token`）跟 cybozu.com 共通管理的 API 權杖（`Authorization: Bearer cy.s.api1.…`）是**兩套不同認證**，填錯欄位不會生效，也不會有明確錯誤。
>
> kintone 單次請求最多只能帶 9 把 App Token（以 kintone 官方文件為準）。因為本外掛把所有 Token 串在同一個 header，登錄的 App 數量多的時候要留意這個上限。

---

## 5. 執行流程：事件 → 規則 → 寫入

### 5.1 註冊了哪些事件

全部在 `desktop.js` 最後面。每個事件同時註冊電腦版與手機版名稱。

| kintone 事件 | 做什麼 | 會寫 Log？ |
|---|---|---|
| `create.show` | 套規則；處理子表格履歷模式的初始化 | 否 |
| `edit.show` | 套規則；履歷子表格隱藏 | 否 |
| `index.edit.show` | 一覽表內編輯列載入，套規則（不執行 `writeOther`） | 否 |
| `index.edit.submit` | 一覽表內編輯存檔前，套規則 | 否 |
| `create.submit` | 存檔前套規則；失敗會擋下存檔 | 是（存檔成功後才寫） |
| `edit.submit` | 同上 | 是（同上） |
| `detail.process.proceed` | 流程推進時套規則；失敗會擋下推進 | 是 |
| `create.submit.success` / `edit.submit.success` | ①確認存檔成功後寫 Log ②跑「存檔後」規則 | ①是 ②否 |
| `detail.show` | 若有「待補償寫入」就補寫（見 5.3） | 否 |
| `index.show` | **只**掛「建立人狀態檢查」按鈕，不跑規則 | 否 |

### 5.2 `applyRules` 做了什麼（核心，約 `desktop.js:1074`）

```
1. 沒有規則 → 立刻結束（零成本）
2. 篩出命中的規則：
      enabled !== false
      且 觸發時機符合（triggerMatches）
      且 狀態條件符合（statusMatches）
      欄位條件 conditions 的 AND / OR 判斷也在這一步內
3. 分兩批：
      selfRules  = dialog 與 writeSelf（依清單順序）
      otherRules = writeOther（一律排在最後）
4. 依序跑 selfRules：
      dialog     → 跳視窗；按取消 → 設 event.error、整個中止
      writeSelf  → 改 event.record 的欄位
      出錯且屬於 submit / process 時機 → 記錄錯誤、擋下，不再往下
5. 依觸發時機決定怎麼收尾（process.proceed 見 5.3；submit 類則接著跑 otherRules）
```

**幾個很容易被問到的規則**

- **規則順序有意義。** 提醒視窗取消時，排在它前面的 `writeSelf` 已經改過 `event.record`，排在後面的不會跑。`writeOther` 永遠最後，所以一定被取消擋掉。
- **「擋下」靠 `event.error`。** 設了 `event.error`，kintone 就會在畫面上顯示紅字並中止儲存或流程推進。
- **`*.show` 類事件不會擋。** 畫面已經載入完，沒有東西可擋。`safeHandler` 只有在事件名稱含 `submit` 或 `process` 時才設 `event.error`。
- **`*.submit.success` 類規則失敗不會擋。** 記錄已經存了。錯誤只會出現在 Console，**不會**寫 Log、**不會**提示使用者。這是除錯盲區，見 13.2。

### 5.3 流程推進（`process.proceed`）與「補償寫入」

這是整個外掛最複雜、也最容易出狀況的部分。背景：

> kintone 的「作業者」與「記錄編輯權限」是兩套獨立設定。簽核人可以是作業者（按得動推進鈕），卻沒有該記錄的編輯權。這時如果外掛要在推進時順便寫欄位，kintone 會拒絕。

解法（與 cybozu 原廠「流程管理履歷外掛」同架構）：

```
使用者按流程按鈕
   ▼
外掛先在記憶體裡把規則套到 event.record
   ▼
呼叫 /k/v1/records/acl/evaluate.json 問：「我現在能編輯這筆嗎？」
   ├─ 能        → return event，欄位與狀態轉換一起存（最理想）
   ├─ 不能 + 有設本 App Token
   │            → 先把要寫的值存進 pendingWrite，return undefined
   │              等 detail.show 觸發時，用 Token 以 REST PUT 補寫，成功後 location.reload()
   └─ 不能 + 沒設 Token
                → 仍 return event。狀態會轉換，但受欄位權限限制的欄位可能寫不進去
```

**除錯時要記得的事**

- `pendingWrite` 是**暫存在記憶體的變數**。使用者在補寫發生前關掉頁面或重新整理，這次補寫就消失了，履歷會漏一列。
- 補寫失敗會跳警告視窗「補償寫入失敗，請聯繫管理員手動補記錄」。此時狀態已經推進成功，只是欄位沒寫到。
- `checkEditPermission` 自己查詢失敗時會當成「可編輯」（寧可走一般路徑，讓 kintone 自己回錯）。
- **Log 裡該筆「成功」不代表補寫成功。** 流程推進的成功 Log 是推進當下「樂觀」寫的（kintone 沒有 `process.proceed.success` 事件可掛），補寫是之後才發生的。

### 5.4 Log 什麼時候寫

| 情況 | 寫的時機 | 內容 |
|---|---|---|
| 規則命中但出錯（含意外例外） | 立刻寫（`loggedApply`） | `失敗` ＋ 錯誤分類 ＋ `[錯誤碼] 規則「名稱」: 原始訊息` |
| 使用者在提醒視窗按取消 | 立刻寫 | `取消`，分類 `cancelled`（不是錯誤，統計時要分開看） |
| 流程推進命中且沒出錯 | 立刻寫（樂觀） | `成功` ＋ 命中的規則名單 |
| 新增／編輯存檔命中且沒出錯 | **暫存**，等 `*.submit.success` 才寫 | `成功` ＋ 命中的規則名單 |
| 完全沒命中任何規則 | **不寫**（避免雜訊） | — |

**寫 Log 的保底機制**：先寫完整 7 欄位；失敗就退成最小 3 欄位（`LOG_EVENT`、`LOG_RESULT`、`LOG_MESSAGE`）再試一次，並把原始錯誤附在訊息尾巴。兩次都失敗只印 `console.error`，**絕不阻擋使用者存檔**。

---

## 6. 除錯：從症狀找原因

### 6.1 第一步永遠是這三個動作

**① 看 Log App** → [SYS-06-6_Plug-In(Log)](https://nipponexpress-taiwan.cybozu.com/k/708/)（App ID `708`；設定方式見 README 第 9 節）

| Log App 的狀況 | 代表 |
|---|---|
| 有一筆 `成功` | 規則有命中也執行了。問題在別處（規則寫的值不對、欄位被別的程式覆蓋…） |
| 有一筆 `失敗` | 看 `LOG_CATEGORY` 與 `LOG_MESSAGE`，對照第 8 節 |
| 有一筆 `取消` | 使用者按了提醒視窗的取消。正常操作 |
| **完全沒有紀錄** | 可能是：規則沒命中／沒設 Log App／觸發時機屬於不寫 Log 的那幾種（見 5.1）／Log 本身寫入失敗（看 Console） |

**② 開 F12 → Console → 過濾框輸入 `[sda]`**
外掛所有訊息都以 `[sda]` 開頭，過濾後就只剩它的。訊息意思見第 7 節。

**③ 確認版本與部署**
- 外掛清單（系統管理 → 外掛程式）顯示的版本號
- 該 App 的「外掛程式」頁面顯示的版本號
- App 有沒有按過「**更新 App**」（沒按，使用者看到的還是舊版）
- 瀏覽器有沒有快取舊 JS（`Ctrl + F5` 強制重新載入）

### 6.2 症狀對照表

| 症狀 | 最可能的原因 | 怎麼確認 | 處理 |
|---|---|---|---|
| **按流程按鈕後，欄位沒被填** | ①規則沒啟用 ②狀態名稱沒對上（全形半形、空白） ③欄位代碼寫錯 ④設定存了但沒「更新 App」 ⑤ 該推進是用 REST API 做的，不是畫面按鈕 | Console 有無 `[sda][statusMatches]`／`[sda][writeToField] ✗ field ... not found`；Log App 該筆有沒有紀錄 | ①～④ 回設定畫面逐項檢查（README 第 8 節）。⑤ 見 13.1 |
| **畫面跳紅字：`規則名稱: API /k/v1/... 400: {...}`** | 規則寫入時 kintone 拒絕，JSON 裡會說明原因 | 讀訊息尾巴的 `code`、`message`、`errors`。外掛會試著整理出「問題欄位」或「可疑欄位」 | 欄位型別不符／必填沒填／目標 App 欄位代碼寫錯。對照第 8 節 |
| **訊息：`登入已逾時…`** | 錯誤碼 `CB_AU01`，登入 session 過期 | Log 分類 `session` | 請使用者**另開分頁**重新登入再回來重試。不是外掛問題 |
| **訊息：`您沒有執行此操作的權限…`** | 使用者對該記錄／欄位／目標 App 沒權限，且沒設 Token 可代打 | Log 分類 `permission` | 補設本 App Token 或目標 App Token；或調整 kintone 權限 |
| **彈窗：`補償寫入失敗`** | 推進流程後，用 Token 補寫本表欄位失敗 | Console `[sda] compensation write failed` | 檢查「本 App Token」是否有「記錄編輯」權限、是否填對；已推進的記錄需人工補欄位 |
| **跨 App 寫入失敗** | ①目標 App 的 Token 沒設或沒權限 ②Key 對應的欄位代碼是**來源**不是**目標**的 ③目標記錄不存在（`update` 模式找不到會丟錯） | 訊息裡有 `no record found for ...`、或「問題欄位／可疑欄位」 | 逐項檢查；暫時把「失敗處理」改成「只記錄」，再看 Console |
| **Log App 一直沒有紀錄** | ①沒填 Log App ID ②欄位代碼或型別不對 ③Log Token 沒有「記錄追加」權限 ④該規則的觸發時機本來就不寫 Log | Console 有 `[sda] writeLog 失敗…`；Log 訊息尾巴有「已退化為最小欄位」 | 對照 README 第 9 節的 7 欄位表；確認 `LOG_APP`、`LOG_RECORD` 是**數值**欄位、`LOG_USER` 是**使用者選擇** |
| **電腦版正常，手機版不動／行為不同** | `mobile.js` 沒跟 `desktop.js` 同步 | `diff contents/dist/desktop.js contents/dist/mobile.js`，有輸出就是沒同步 | 把 `desktop.js` 覆蓋到 `mobile.js`，重新打包、更新 |
| **手機版 Log 的 App/記錄欄位寫入失敗（`CB_VA01`）** | v1.17.7 以前的已知 bug：手機版 `getId()` 回傳 `null` 被寫成字串 `"null"` | Log 訊息有 `CB_VA01` 與「数字でなければなりません」 | 升到 v1.17.8 以上 |
| **提醒視窗沒跳出來** | ①規則沒命中（同第一列） ②`SdaDialog` 沒載入 | Console 有 `[sda][dialog] SdaDialog 未載入，規則已略過` | 確認 `manifest.json` 三個 `js` 陣列都有列 `dist/dialog.js` 且排在主檔之前 |
| **提醒視窗沒有取消鍵** | 這個觸發時機本來就不能中止。只有 `*.submit` 與 `process.proceed` 能擋；`*.show`（畫面已載入）與 `*.submit.success`（記錄已存）擋不了，程式會強制隱藏取消鍵 | 看規則的觸發時機 | 不是 bug。要擋請改用「儲存前」或「流程推進」 |
| **提醒視窗樣式與預期不同** | 外掛會偵測頁面上有沒有 SweetAlert2：有就用，沒有用內建元件。設定畫面不一定載得到 SweetAlert2，預覽可能與實際有出入 | 設定畫面第 4 區的綠色／橘色提示 | 以記錄畫面實際效果為準 |
| **提醒視窗內的 `{欄位代碼}` 變空白** | 欄位代碼不存在於本記錄 | Console `[sda][dialog] 訊息中的欄位代碼 "..." 在本記錄找不到` | 修正欄位代碼 |
| **更新外掛後行為沒變** | ①沒按「更新 App」 ②瀏覽器快取 | App 外掛頁面的版本號 | 更新 App；`Ctrl + F5` |
| **建立人檢查按鈕沒出現** | ①沒勾啟用 ②沒更新 App ③設了「限制可使用對象」但自己不在名單 | Console `[sda][creatorCheck]` | 見 README 第 10 節「常見狀況」 |
| **建立人檢查全部顯示「查不到」** | 共通管理 API 權杖沒填或失效 | 設定畫面按「測試連線」 | 重新取得權杖；Scope 勾 Read 即可 |
| **設定畫面打不開／空白** | `config.js` 發生例外 | F12 Console 的紅字 | 多半是程式改壞了；用 git 回到上一個正常版本 |
| **規則「條件」沒生效** | 比對值差一個字、多條件是 AND、多選欄位要用「包含」 | 看 Log 有沒有命中 | README 第 8 節 |
| **子表格履歷只更新第一列／沒新增** | 目標欄位選到子欄位而不是子表格本身，或沒開 `historyMode` | Console `[sda] appendSubtable: ... is not a SUBTABLE` | README 第 8 節 |
| **同一欄位被寫了兩次或值被蓋掉** | 同一個事件還有別的 App 自訂 JS 或別條規則也在改它 | 暫時停用 App 自訂 JS 對照；檢查規則清單順序 | 調整規則順序或去除重複設定 |

### 6.3 判斷是「外掛問題」還是「設定問題」

| 偏向設定問題（管理者可自行修） | 偏向程式問題（需要工程師） |
|---|---|
| Log 分類為 `config`、`permission`、`session` | Log 分類為 `system` 且重複發生 |
| 訊息指名某個欄位／App 不存在 | Console 出現 `Uncaught`、`TypeError`、`is not a function` |
| 只有特定一條規則失敗 | 所有規則都不動、設定畫面也打不開 |
| 換一個有權限的人就正常 | 電腦版與手機版行為不同 |

---

## 7. Console 訊息對照表

在 Console 過濾框輸入 `[sda]`。**錯誤（紅）與警告（黃）才需要在意，外掛已移除一般性的除錯輸出，畫面很乾淨。**

| 訊息開頭 | 等級 | 意思 | 處理 |
|---|---|---|---|
| `[sda] config parse failed` | error | 設定的 JSON 壞了，外掛退回「無規則」狀態 | 回設定畫面重新儲存；若是手動改過設定就還原 |
| `[sda][config] valueParam JSON parse FAILED for rule "…"` | warn | 某條規則的「值的參數」不是合法 JSON | 回該規則修正 JSON（引號、逗號） |
| `[sda][statusMatches] ⚠ $status unavailable…` | warn | 取不到目前狀態，略過「從狀態」檢查 | 通常無害；App 沒啟用流程管理時會出現 |
| `[sda][writeToField] ✗ field "X" not found in record. Available fields: …` | warn | 規則的目標欄位代碼在這筆記錄找不到。**後面會列出該記錄實際有的所有欄位代碼** | 對照清單改正欄位代碼 |
| `[sda][buildSubRow] field "X" missing in template row` | warn | 子表格的子欄位代碼不存在 | 修正 `subRules` 的 `targetField` |
| `[sda][initSubtableOnCreate] "X" is not a subtable` | warn | 履歷規則的目標不是子表格 | 目標欄位改選子表格本身 |
| `[sda][handleCreateShow] ⚠ found appendSubtable rule(s) but NONE have historyMode…` | warn | 有子表格追加規則，但沒開 `historyMode`，所以沒有清空與隱藏 | 要履歷效果就在 `valueParam` 加 `"historyMode": true` |
| `[sda] appendSubtable: … is not a SUBTABLE` | warn | 同上類 | 同上 |
| `[sda][setFieldShown …] …failed / no platform namespace` | warn | 隱藏／顯示欄位失敗 | 多半是欄位代碼錯，或在不支援的畫面（如一覽表編輯列）呼叫 |
| `[sda] unknown valueSource` | warn | 規則裡的「值的來源」程式不認得 | 檢查拼字；或是匯入了較新版本的規則到舊版外掛 |
| `[sda][subtableLastRow] "X" 不是子表或不存在` | warn | 同上類 | 修正 `table` |
| `[sda][applyRules] event.record is null` | warn | 事件沒帶記錄 | 少見，通常是在不該觸發的畫面觸發 |
| `[sda] rule "名稱" failed` | error | 本表規則（writeSelf）執行失敗，附完整錯誤物件 | 展開看原始錯誤 |
| `[sda] cross-app rule "名稱" failed` | error | 跨 App 規則失敗 | 同上；同時檢查 `onError` 設定（`block` 會擋下） |
| `[sda] success cross-app rule "名稱" failed` | error | 「存檔後」的跨 App 規則失敗（**使用者不會看到任何提示**） | 只有 Console 看得到，見 13.2 |
| `[sda] runSuccessRules failed` | error | 存檔後規則整體失敗 | 同上 |
| `[sda] compensation write failed` | error | 補償寫入失敗 | 見 6.2 |
| `[sda] checkEditPermission failed` | warn | 查「能不能編輯」失敗，已當成可編輯 | 通常是暫時性網路問題 |
| `[sda] writeLog 失敗…，改用最小欄位重試` | error | Log 完整寫入失敗，退成最小欄位 | 檢查 Log App 欄位代碼與型別 |
| `[sda] writeLog 最小欄位重試仍失敗…` | error | 連最小欄位都寫不進去，這次 Log 遺失 | 檢查 Log App 是否存在、Token 有沒有「記錄追加」權限 |
| `[sda] copyAttachment 跳過…` | warn | 附件複製被略過（檔案太大、非存檔後觸發、來源欄位未設定…） | 訊息本身會說明原因 |
| `[sda][runProceedRulesViaApi] 無命中 process.proceed 規則` | warn | 用 `NXSdaProceed.run` 補跑時，狀態／動作名稱對不上任何規則 | 傳入的 `fromStatus`／`toStatus`／`action` 要與規則一致 |
| `[sda][creatorCheck] …` | warn / error | 建立人檢查的各種降級或失敗，訊息會寫原因 | 見 README 第 10 節 |
| `[sda][dialog] SdaDialog 未載入` | warn | `dialog.js` 沒載入 | 見 6.2 |

---

## 8. kintone 錯誤碼對照

外掛用 `errorCodeOf` 從錯誤物件或訊息文字裡抓出 `CB_*`／`GAIA_*` 碼，再由 `classifyError` 分成四類（也是 `LOG_CATEGORY` 的值）：

| 分類 | 包含的錯誤碼 | 意思 | 誰處理 |
|---|---|---|---|
| `session` | `CB_AU01` | 登入逾時 | 使用者重新登入 |
| `permission` | `GAIA_NO01`、`GAIA_NO02`、`CB_NO01`、`CB_NO02`、`GAIA_DA02` | 沒有權限 | 管理者調權限，或補 Token |
| `config` | `GAIA_FE01`（欄位不存在）、`GAIA_AP01`（App 不存在）、`GAIA_IQ11`、`GAIA_IL26`、`CB_IL02`（Token 無效）、`CB_VA01`（欄位值格式不符） | 外掛設定有誤 | **回設定畫面修規則** |
| `system` | 其他一切（沒有錯誤碼、`Failed to fetch`、5xx） | 網路或 kintone 暫時異常 | 先重試；持續發生再找工程師 |

另外 `success`（成功）與 `cancelled`（使用者取消）不是錯誤，**統計異常率時請排除**。

**怎麼讀一則原始錯誤訊息**

```
規則「出貨→更新客戶主檔」: API /k/v1/record.json 400: {"code":"CB_VA01","message":"...","errors":{...}}
│                           │    │                    │
│                           │    │                    └ kintone 回的 JSON；errors 內會指名哪個欄位
│                           │    └ HTTP 狀態
│                           └ 外掛呼叫的 API 路徑
└ 哪條規則（規則的 label）
```

外掛會從 `errors` 抽出問題欄位附在訊息後面（`→ 問題欄位: …`）。kintone 沒指名欄位時，外掛會改列「可疑欄位」（例如 `fieldCopy` 的來源欄位代碼根本不存在、`dateShift` 讀到空值）。

---

## 9. 使用者回報問題時，請對方提供這些

與其來回追問，一次要齊：

- [ ] **哪個 App**（網址列的數字，如 `/k/123/`）與**哪一筆記錄**（`record=` 的數字）
- [ ] **發生時間**（精確到分鐘，方便對 Log）
- [ ] **電腦版還是手機版**
- [ ] **做了什麼動作**（按了哪個流程按鈕？儲存？只是打開畫面？）
- [ ] **畫面上的訊息**（完整截圖，紅字一個字都不要漏）
- [ ] **Console 截圖**：F12 → Console → 過濾 `[sda]`
- [ ] **Log App 同一時間的那筆紀錄**（若有設）
- [ ] 是**所有人**都這樣，還是**特定的人**（區分權限問題與程式問題）
- [ ] 外掛版本號（App 設定 → 外掛程式）

> 機敏提醒：請對方截圖時不要截到設定畫面的 Token 欄位。我們自己除錯時也不要把 Token 貼進通訊軟體或工單。

---

## 10. 日常維運

### 10.1 升級外掛（改了程式之後）

1. 照第 11 節改程式、跑檢查清單。
2. **先在測試 App／測試環境驗證。**
3. 打包（見 11.3）得到 `plugin_v<版本>.zip`。
4. 系統管理 → 外掛程式管理 → 找到「狀態驅動動作外掛」→「更新」→ 上傳 zip。
   - 必須用**同一把 `.ppk`** 簽出來的 zip。ID 一樣才會被當成「更新」，各 App 設定才會保留。
5. 每個有用到的 App：App 設定 → 外掛程式 → 確認版本號已更新 → **更新 App**。
6. 抽一個正式 App 實測一次，並看 Log App 有沒有新的失敗紀錄。

### 10.2 退版（新版有問題要退回）

1. 改用上一版的 zip，走 10.1 的第 4、5 步。
2. 專案資料夾裡保留了各版本的 `plugin*.zip`。**但它們不在 git 裡**（`.gitignore` 排除），只存在這個資料夾，見 10.5。
3. kintone 是否接受版本號較低的 zip 更新，**請先在測試環境確認**再用於正式環境。
4. 若手上沒有舊版 zip：用 `git log` 找到那版的 commit，`git checkout <commit> -- contents/`，再重新打包。

> 暫時止血的另一個做法：不退版，而是到各 App 的外掛設定畫面，把出問題的那條規則取消勾選「啟用」→ 儲存 → 更新 App。規則保留、不執行。

### 10.3 複製設定到別的 App

設定畫面工具列的「匯出設定」／「匯入設定」。**只會帶規則與外觀，不會帶 Token、Log App 設定。** 匯入後目標 App 要自己填 Token，並確認規則用到的欄位代碼在目標 App 都存在。（原因與步驟見 README 7-2）

要用程式批次產生規則的話，JSON 格式見 [CLAUDE.md](CLAUDE.md)「設定 JSON 結構」。

### 10.4 例行檢查建議

| 頻率 | 做什麼 |
|---|---|
| 每週 | 看 Log App 篩 `LOG_RESULT = 失敗`、`LOG_CATEGORY` 為 `config`／`system` 的紀錄。這兩類是要處理的；`permission`／`session` 多半是使用者操作問題 |
| 每次 kintone 改版後 | 抽一個 App 實測：新增、編輯、流程推進、手機版各一次 |
| 有人離職／換人 | 確認 Token 是否由個人帳號建立（見 13.3）；檢查「建立人狀態檢查」可使用對象名單 |
| 每季 | 確認共通管理 API 權杖是否仍有效（設定畫面按「測試連線」） |

### 10.5 備份與交接（這節最重要）

| 項目 | 現況 | 風險 | 建議 |
|---|---|---|---|
| **原始碼** | git 倉庫（目前在本機資料夾，在 OneDrive 內） | 只有一份 | 推到公司內部的 Git 伺服器或共用磁碟備份 |
| **`.ppk` 私鑰** | 與專案同資料夾，檔名即 plugin ID | **遺失 = 之後只能以新 ID 發布，等於全新外掛，所有 App 的設定都要重做**。外流 = 別人能偽造更新包 | 至少存兩份在**受控的安全位置**（如 IT 保管的加密磁碟／密碼管理工具），不要放共用資料夾、不要寄 mail |
| **各版 `plugin*.zip`** | 只在本機資料夾（不進 git） | 電腦壞了就沒有退版依據 | 每次發布後，把 zip 存到固定的共用位置，檔名含版本號 |
| **各 App 的規則設定** | 存在 kintone 內 | 誤刪、誤改後無法還原 | **每次大改前，在各 App 設定畫面按「匯出設定」，把 JSON 存檔**（內含 Token 的匯出內容請當機密） |
| **Token** | 加密存在 kintone，前端讀不到 | 忘記某把 Token 就只能重新建立 | Token 的建立紀錄（建在哪個 App、誰建的、用途）要留文件 |

---

## 11. 改程式的流程與規矩

### 11.1 環境

- Node.js（只為了跑 `npx @kintone/plugin-packer` 打包）。沒有編譯步驟、沒有前端框架，`dist/*.js` 就是最終執行的程式。
- 改完不能在本機直接跑，必須打包上傳到 kintone 才能驗證。

### 11.2 四條規矩與理由

| 規矩 | 為什麼 | 違反的後果 |
|---|---|---|
| `desktop.js` 與 `mobile.js` 內容相同 | 一份程式服務電腦與手機（見第 3 節） | 手機版跑舊程式 |
| 不 `console.log` 原始 config | `rawConfig.data` 內可能有 Token，會洩漏給所有開 DevTools 的人 | 資安事件 |
| `.ppk` 不進版控、不外流 | 見 10.5 | 無法更新／被冒名發布 |
| JS 不寫註解 | 專案刻意把說明集中在 README 附錄 B | 說明散落、與程式不同步 |

另外：
- **不要用原生 `alert`／`confirm`。** 用 `SdaDialog.show()`（執行期）或 `notify()`／`askConfirm()`（`config.js`）。
- **`dialog.js` 是三邊共用同一個檔案，不要複製。** 改一次，電腦版、手機版、設定畫面預覽同時生效。
- **使用 `const`／`let`，不用 `var`。** 檔名小寫加底線、函式 camelCase（見上層 [../CLAUDE.md](../CLAUDE.md)）。

### 11.3 打包

**方法一（建議）：`build.ps1`**

```powershell
.\build.ps1            # 同步 mobile.js，不改版號，打包
.\build.ps1 1.18.1     # 同步 mobile.js，把版號改成 1.18.1（manifest 與 config.js 的 UI_VERSION 一起改），打包
```

產出 `plugin_v<版本>.zip`。它會自動找資料夾內的 `.ppk`。

**方法二：手動**

```bash
cp contents/dist/desktop.js contents/dist/mobile.js
npx @kintone/plugin-packer contents --ppk <你的.ppk> --out plugin.zip
```

> 版號有兩個地方要一致：`contents/manifest.json` 的 `version` 與 `contents/dist/config.js` 的 `UI_VERSION`（顯示在設定畫面工具列）。用 `build.ps1 <版號>` 會一起改；手動改要自己兩處都改。

### 11.4 改完的檢查清單

```bash
# 1. 兩份必須相同，沒有輸出才對
diff contents/dist/desktop.js contents/dist/mobile.js

# 2. 不可有印出設定或 Token 的程式
grep -n "console.log" contents/dist/*.js     # 目前應該完全沒有輸出
grep -n "rawConfig" contents/dist/*.js       # 目前只會看到 desktop.js / mobile.js 開頭讀取設定的 2 行，多出來的要檢查
```

- [ ] `diff` 無輸出
- [ ] `manifest.json` 版號與 `config.js` 的 `UI_VERSION` 一致
- [ ] 沒有新增 `console.log(rawConfig)` 或印出 Token 的程式
- [ ] 新增／變更的行為已寫進 README 附錄 B（不要寫進 JS 當註解）
- [ ] 管理者要知道的操作變動，已寫進 README 對應章節
- [ ] `git status` 沒有 `.ppk`、`*.zip`
- [ ] 在測試 App 實測過：**電腦版與手機版各一次**

### 11.5 測試時的建議路徑

| 要測什麼 | 怎麼測 |
|---|---|
| `writeSelf` 規則 | 測試 App 建一條規則，執行對應動作，看欄位有沒有被寫 |
| 流程推進與補償寫入 | **用一個沒有編輯權限的簽核人帳號**實測，這才會走到補償寫入路徑 |
| 跨 App 寫入 | 準備一個測試用目標 App 與 Token，測 `create`／`update`／`upsert` 各模式；刻意填錯欄位看錯誤訊息是否清楚 |
| 提醒視窗取消 | 分別測 `*.submit`、`process.proceed`（可取消）與 `*.show`（不可取消） |
| Log | 設一個測試 Log App；刻意把某欄位型別設錯，確認會退化成最小欄位 |
| 手機版 | 用手機瀏覽器或瀏覽器的手機模擬；重點確認 `getAppId`、Log 欄位 |

---

## 12. 常見修改範例

### 12.1 新增一種「值的來源」（`valueSource`）

1. `desktop.js` 的 `resolveValue`（約 332 行）的 `switch` 加一個 `case`，回傳要寫的值。
2. `config.js`：
   - 設定畫面「值的來源」下拉選單加上該選項。
   - 若需要參數，補對應的參數輸入元件。
   - 若 `writeOther` 的對應表也要能選，補進 `MAPPING_VALUE_SOURCES`。
3. 若這個來源**需要讀目標 App 的現有記錄**（像 `appendText`、目標方的 `dateShift`），要在 `ruleNeedsTargetRecord` 加判斷，否則 `writeOther` 只會抓 `$id`，讀不到欄位。
4. 同步 `mobile.js`。
5. README 附錄 B-6 補說明；[CLAUDE.md](CLAUDE.md) 的 valueSource 一覽表補一列。

### 12.2 新增一種觸發時機

1. `config.js` 的 `TRIGGERS` 與 `TRIGGER_GROUPS` 加項目（群組決定哪些可以一起複選）。
2. `desktop.js` 最後面 `kintone.events.on(E([...]), ...)` 註冊事件，handler 呼叫 `applyRules('<觸發名稱>', ev)`。
3. 到 `statusMatches` 確認這個觸發該用哪組狀態條件。
4. 決定：能不能擋（會不會設 `event.error`）、要不要寫 Log、`writeOther` 要不要執行（目前 `*.show` 類不執行）。
5. 同步 `mobile.js`、更新 README 附錄 B-2。

### 12.3 新增 Log 欄位

1. `desktop.js` 的 `LOG_FIELDS` 與 `writeLog` 補欄位。
2. **最小欄位退路**（`writeLog` 的第二次嘗試）不要加進新欄位。它的目的就是只用最不容易出錯的純文字欄位。
3. README 第 9 節的欄位表同步更新（管理者要照表去 Log App 加欄位）。
4. 注意：**舊的 Log App 沒有新欄位時，完整寫入會失敗並退化**。要通知所有管理者先加欄位再升版。

### 12.4 調整錯誤分類

`desktop.js` 的 `classifyError` 的 `switch`。新增某個錯誤碼要歸到哪一類，就把它加到對應的 `case`。同時更新 README 第 9 節的對照表與本手冊第 8 節。

### 12.5 調整提醒視窗／面板外觀

只改 `dialog.js`，三邊同時生效。注意：
- 偵測 `window.Swal` 一定要在 `show()` 被呼叫時做，不能在檔案載入時做（App 自訂 JS 可能比外掛晚載入）。
- 提醒視窗樣式全收在 `.sda-swal` 底下，避免影響 App 自己用的 SweetAlert2。

---

## 13. 已知限制與容易踩的地方

### 13.1 透過 REST API 推進流程，不會觸發規則

kintone 用 REST API（`/k/v1/record/status`）推進流程時，**不會送 `process.proceed` 事件**，掛在該事件上的規則（含簽核履歷）不會跑。

- 若 App 自訂 JS 有用 API 推進，可呼叫外掛提供的 `window.NXSdaProceed.run({ recordId, action, fromStatus, toStatus })` 補跑一次同一份規則。回傳 `{ matched, written }`。
- 此時提醒視窗的取消**無法回滾**（狀態已經推進完了）。

### 13.2 失敗了卻沒人知道的幾種情況

這些地方錯誤只有 Console 看得到，不會擋使用者、不會寫 Log：

| 情況 | 原因 |
|---|---|
| `*.submit.success` 觸發的規則（存檔後）出錯 | 記錄已存，不能再擋；程式刻意把錯誤吞掉只印 Console，避免影響已完成的存檔 |
| `index.edit.show`／`index.edit.submit` | 一覽表編輯列沒有對應的 success 事件可掛，所以不寫 Log |
| `*.show` 類規則出錯 | 畫面已載入，沒東西可擋，也不寫 Log |
| 補償寫入失敗 | 只會跳一次警告視窗，且 Log 裡該筆推進仍是「成功」 |

**對策**：這幾類規則上線前務必實測；若有重要的回寫邏輯，盡量不要只放在存檔後規則。

### 13.3 Token 與帳號

- Token 是 kintone 上某個 App 建立的，**不依附個人帳號**，離職不會失效。但建立 Token 的紀錄要留（誰建、建在哪、給誰用）。
- Token 權限要給剛好夠的：本 App Token 需「記錄編輯」、跨 App 寫入要「記錄追加」與「記錄編輯」、Log Token 只需「記錄追加」。
- 共通管理 API 權杖：Scope 勾 **Read** 即可，不要多給。

### 13.4 比對是「完全相同」

狀態名稱、欄位條件的值都是**逐字比對**。全形與半形、前後空白都算不同。狀態名稱如果在 kintone 流程設定被改過，外掛規則必須同步改。比對值常有變化形時改用「開頭為」或「包含」。

### 13.5 時間用的是使用者電腦的時鐘

`today`／`now`／`nowTime` 取瀏覽器本機時間，不問伺服器。使用者電腦時間不對，寫進去的日期就不對。

### 13.6 `formula` 的字串組合

`formula` 可做四則運算與字串串接（`"No."+{單據編號}`），欄位值以字串字面值代入（引號、換行都會跳脫）。**程式有做白名單檢查防注入**，改這段（`evalFormula`）時務必保留。

### 13.7 一覽表內編輯

只有**被設成「一覽表欄位」的欄位**才能在一覽表內編輯存檔。JS 改了值但欄位不在一覽表上，是 kintone 平台限制，存不進去，不是外掛 bug。

### 13.8 附件複製

`copyAttachment` 只能用在「存檔後」觸發，且用**操作者本人的 session** 下載與上傳（附件的二進位傳輸沒辦法走代理、也讀不到加密 Token）。所以操作者要對來源 App 有下載權、對目標 App 有上傳權。單檔預設上限 10MB。

### 13.9 儲存設定的原子性

`save()` 是先寫代理設定（Token），再寫一般設定。若存檔途中關掉分頁或斷線，可能出現「Token 已更新、規則還是舊的」。遇到設定怪怪的，**重新開設定畫面再按一次儲存**即可。

---

## 14. 版本沿革

只列對維護有影響的節點。完整紀錄用 `git log`。

| 版本 | 日期 | 重點 |
|---|---|---|
| 1.3.0 | 2026-06-15 | 新增執行 Log；移除除錯用 `console.log` 與程式內註解 |
| 1.3.1 | 2026-06-15 | 錯誤分類、Log 兩層保底寫入 |
| 1.5.0 | 2026-06-15 | 移除全域 `fetch`／`XHR` 攔截器；時間改用本機時鐘；Log 改為事件層做法（流程推進樂觀記成功、存檔等 `*.submit.success`） |
| 1.5.1 | 2026-06-17 | 補寫履歷的函式可全域呼叫（`NXSdaProceed`） |
| 1.7.0 | 2026-06-26 | `dateShift` 日期加減；設定匯出／匯入 |
| 1.7.2–1.7.3 | 2026-06-26 | 狀態條件支援多值；欄位文字搜尋 |
| 1.8.0 | 2026-07-07 | `writeOther` 對應改下拉編輯器；錯誤訊息指名問題欄位 |
| 1.9.0 | 2026-07-13 | 觸發時機可複選；一覽表內編輯觸發 |
| 1.11.0 | 2026-07-14 | `appendText` 文字串接追加 |
| 1.12.0 | 2026-07-14 | **Token 改加密存放於伺服器端**（`NXSdaApi.call`） |
| 1.13.0 | 2026-07 | 存檔後觸發（`*.submit.success`） |
| 1.14.0 | 2026-07-15 | 附件檔案複製 |
| 1.15.0 | 2026-07-28 | 提醒視窗（`dialog` action） |
| 1.16.0 | 2026-08-31 | 提醒視窗改用 SweetAlert2、寬度自適應；設定畫面不再用原生 `alert` |
| 1.17.0 | 2026-09 | 建立人狀態檢查；`NXSdaUserApi` |
| 1.17.8 | 2026-09-24 | 修正手機版 `getAppId` 回傳 `"null"` 造成 Log 數值欄位寫入失敗 |
| 1.18.0 | 2026-09-24 | 建立人狀態檢查的顯示欄位可選所有原生欄位 |

> 版本日期取自 git 提交紀錄，部分版本在同一次提交內合併，日期以月份標示者為概略時間。

---

*手冊內容以 v1.18.0 的程式為準。改了行為就同步更新本手冊、README 附錄 B 與 [CLAUDE.md](CLAUDE.md)，三者不一致時以程式碼為準。*
