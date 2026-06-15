# 設計：移除全域攔截器、時間改用本機、清除死碼

日期：2026-06-15　目標版本：v1.5.0　狀態：待實作

修改範圍：`contents/dist/desktop.js`、`contents/dist/mobile.js`。兩個檔案內容相同，修改後需同步。

## 背景

這個外掛屬於單筆、事件驅動的類型。它只掛了 6 個使用者操作事件，每次只處理當下那一筆 `event.record`，所有 API 查詢都是 `limit 1`，不會一次撈大量記錄回來運算。因此一般談批次效能的做法（分批、cursor 分頁、用 Map 取代雙層迴圈、批量更新）對它幾乎用不上，它本來就沒有這類問題。

需要處理的是 v1.4.0 之後新增的兩段邏輯：一段會覆寫整頁的網路請求，一段每次動作都會額外打一個網路請求對時間。這兩段也連帶累積了一批死碼。這份設計就是針對這兩處。

## 目標

1. 移除覆寫 `window.fetch` / `XMLHttpRequest` 的全域攔截器，log 改走 kintone 官方事件（以下稱方案 A）。
2. `getServerTime()` 不再打網路，改用本機 `new Date()`。
3. 上述兩項變更會牽連出一批死碼，一併清除。

不在此次範圍：不更動任何既有功能（規則套用、跨 App 寫入、補償寫入、設定畫面），也不引入任何後台或雲端運算。

---

## 一、log 改為方案 A（本次重點）

### 現況（v1.4.3）

目前 log 拆成兩個來源：

- **來源 A，事件層的 `loggedApply`**：條件是 `(matched>0 || thrown) && errored`，所以實際上只記失敗，也就是規則本身出錯把動作擋下來的情況。
- **來源 B，全域攔截器**：把底層的 `fetch` / `XHR` 包起來，負責記所有成功，以及 kintone 原生動作（簽核 `updateWithStatus`、存檔 `update` / `create` / `status`）在 HTTP 層失敗的情況。

來源 B 的問題在於它的影響範圍太大：永久把整頁的 `fetch` / `XHR` 換成自己的版本，頁面上每個請求都要先過一次 regex；同一頁若有其他外掛也會受影響；掛上去之後無法卸除，還要靠 `_logInFlight` 旗標避免自己遞迴，並與來源 A 互相協調，避免同一個動作記成兩筆。

### 攔截器存在的原因

關鍵在簽核。kintone 原生的簽核 (`process.proceed`) 真正送出的 HTTP 請求，是在外掛 handler `return` 之後才發出的，而 kintone 並沒有 `process.proceed.success` 這類事件可以掛。也就是說，要知道一次簽核是否成功，唯一的辦法就是攔截底層請求。攔截器就是為此而生。

存檔（create / edit）沒有這個限制，它有官方的 `*.submit.success` 可掛，不需要攔截器。

### 方案 A 的做法

移除整段攔截器，log 全部回到事件層產生：

| 事件 | 失敗如何記 | 成功如何記 |
|---|---|---|
| `create.submit` / `edit.submit` | 規則出錯，維持原本在 submit handler（`loggedApply`）記一筆失敗 | 改掛官方 `create.submit.success` / `edit.submit.success`，待 kintone 確認存檔成功後才記成功 |
| `process.proceed` | 規則出錯擋住簽核，維持原本在 proceed handler 記失敗 | 在 proceed handler 內，規則執行完畢且無錯誤（若有設 SELF_TOKEN，再加上 edit-check 通過）即記為成功 |

這裡的取捨需要說明：簽核成功這一筆屬於「外掛已乾淨送出」的樂觀記錄，並不等於 kintone 最終 commit 成功。但實務上 handler 既已乾淨 `return`，簽核在 HTTP 層再失敗的機率很低；即使失敗，使用者當下也看得到，記錄狀態本來就不會改變。為了這 5% 的精準度去維護一個覆寫全域、每個請求都要介入的 monkey-patch，並不划算。

對使用者而言 log 的呈現不變：Log App 中一樣會有成功、失敗兩類記錄，欄位與分類（`LOG_RESULT`、`LOG_CATEGORY`、`LOG_MESSAGE` 等）格式照舊。唯一會失去的是「簽核被 kintone 因外掛以外的原因擋下」這種記錄，而這種情況本來就少見，外掛管理員即使看到也無從修正。

### 成功訊息的內容

沿用現有格式：`已套用 N 條規則：規則A、規則B`，資料取自 `_runInfo.matched` / `_runInfo.labels`。

- proceed：handler 收尾時若 `matched>0 && !errored` 即寫一筆成功。
- submit.success：需將該次 submit 的 `matched` / `labels` 帶到對應的 success 事件再寫（success 緊接在 submit 之後觸發，中間不會插入其他事件）。傳遞方式留待實作計畫決定。

實作層的細節（變數如何傳遞、`loggedApply` 條件式如何調整）此處不寫死，於 writing-plans 階段再處理。

---

## 二、時間改用本機

目前需要用到 `now` / `today` / `nowTime` 時，會對 `location.href` 發出一個 `HEAD`，從回應的 `Date` header 取時間（並做了 5 秒快取、500ms timeout，失敗才退回本機），用意是避免使用者端時鐘不準。代價是每次簽核、存檔的當下都多一趟網路往返。

改法：直接使用 `new Date()`，日期時間取自瀏覽器本機時鐘。

連帶會變成死碼、需要清除的部分：

- `TIME_VALUE_SOURCES`、`ruleNeedsServerTime`
- `_timeCache`、`SERVER_TIME_CACHE_MS`、`SERVER_TIME_TIMEOUT_MS`、`getServerTime`
- `applyRules` 內 `needsTime` / `serverTimePromise` / `serverTime` 的判斷與等待
- `ctx` 不再帶 `serverTime`；`resolveValue` 與 `elapsedMinutes` 內的 `serverTime || new Date()` 收斂為 `new Date()`

---

## 三、待清除的死碼（兩檔同步）

| 區塊 | 行數（對 desktop.js 現況）| 為何是死碼 |
|---|---|---|
| 攔截器整組：`ACTION_URL_RE`、`_logInFlight`、`actionEventName`、`recordIdFromUrl`、`logKintoneAction`、`if (LOG_APP){…fetch/XHR patch…}` | 約 285–363 | 方案 A 不再需要 |
| server-time 一整組（見第二節） | 135–174，以及 841–855 相關 | 改用本機時間後即無用 |
| 空的 `if (trigger === 'process.proceed') {}` 與空的 `CONFIG.rules.forEach((r,i)=>{})` | 851–854 | 先前移除 console.log 後遺留的空殼，後者仍在空轉遍歷所有規則 |
| `statusMatches` 內無法觸及的 `case 'detail.show':` | 約 656 | 設定畫面 `TRIGGERS` 未提供 `detail.show`，使用者無法建立此觸發的規則，分支永遠進不去 |

需保留、並非死碼的部分：`triggerMatches`（`applyRules` 仍在使用）、`writeLog` 內的 `recIdFromPage`（記錄成功失敗時仍需從網址補抓 record id）、`detail.show` 事件本身的 `handleDetailShow`（補償寫入的入口）。

附帶說明，「`detail.show` 未呼叫 `applyRules`」一事經查證並非 bug。`config.js` 的 `TRIGGERS` 只開放 create.show / edit.show / create.submit / edit.submit / process.proceed 五種，沒有 detail.show，使用者無法建立掛在 detail.show 的規則。

---

## 四、保留不動的部分

- **`compensationWrite` 內的 `location.reload()`**：補償寫入執行於詳情頁，而 `kintone.app.record.set()` 在詳情頁不適用，REST PUT 寫入後畫面仍為舊值，需 reload 才能反映。且此路徑只有在「下一個狀態無編輯權限，且有設 SELF_TOKEN」時才會走到，相當少見，保留 reload 是合理的選擇。
- 規則套用、跨 App 寫入、子表履歷模式、欄位條件、設定畫面（`config.js`）等功能行為均維持原狀。

---

## 五、驗證

沒有自動化測試，於裝有外掛的測試 App 上手動驗證：

1. **存檔成功**：建立一條 create.submit 規則並設定好 Log App，新增記錄存檔後，Log App 應新增一筆「成功」，訊息列出命中的規則。
2. **存檔失敗**：刻意讓規則出錯（例如目標欄位代碼錯誤），存檔被擋下，Log 出現「失敗」與分類。
3. **簽核成功**：掛一條 proceed 規則，按下流程按鈕，Log 出現「成功」。
4. **簽核失敗**：規則出錯擋住簽核，Log 出現「失敗」。
5. **本機時間**：`today` / `now` / `nowTime` 寫入的值正確，F12 Network 不應再出現對 `location.href` 的 `HEAD`。
6. **未污染全域**：F12 Console 執行 `window.fetch.toString()`，應為原生 `[native code]`，而非外掛包裝過的版本。
7. **回歸**：補償寫入、子表履歷、欄位條件、跨 App 寫入等行為應與修改前一致。

---

## 六、發佈

1. 修改 `desktop.js`，完成後整檔覆蓋 `mobile.js`（兩者內容須一致）。
2. `manifest.json` 版本提升至 `1.5.0`。
3. README 同步更新：移除附錄 B-5（伺服器時間），以及 B-8b 之後說明網路攔截器（來源 B）的段落，改述方案 A 的 log 來源，其餘技術說明一併更新。
4. 使用原本的 `.ppk` 重新打包，以維持相同 plugin ID：
   ```
   npx @kintone/plugin-packer contents --ppk <你的.ppk> --out plugin.zip
   ```
