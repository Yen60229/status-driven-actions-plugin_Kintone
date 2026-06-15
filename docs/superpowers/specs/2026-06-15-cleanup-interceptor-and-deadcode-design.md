# 設計：移除全域攔截器、改本機時間、清除死碼

> 日期：2026-06-15　　目標版本：v1.5.0　　狀態：待實作
>
> 適用檔案：`contents/dist/desktop.js`、`contents/dist/mobile.js`（內容相同，需同步修改）

## 背景

「狀態驅動動作外掛」是**單筆、事件驅動**型外掛：只註冊 6 個使用者操作事件，每次只處理當前 `event.record`，所有 API 查詢都是 `limit 1`，從不批次處理大量記錄。因此一般「批次效能」原則（分批、cursor 分頁、Map 取代巢狀迴圈、批量更新）對它多半不適用——它本來就符合。

真正偏離「被動、輕量、不污染全域」原則、且累積了死碼的，是 v1.4.0 之後加入的兩處，這份設計專門清理它們。

## 目標

1. **移除全域 `window.fetch` / `XMLHttpRequest` 攔截器**，改用 kintone 官方事件記錄 log（方案 A）。
2. **`getServerTime()` 改為純本機時間** `new Date()`，移除每次動作當下的網路往返。
3. **清除所有連帶死碼**：攔截器相關、server-time 相關、空迴圈、用不到的 `detail.show` 分支。

非目標：不改外掛的功能行為（規則套用、跨 App 寫入、補償寫入、設定畫面）；不加任何後台/雲端運算。

---

## 一、Log 記錄改為方案 A（核心變更）

### 現況分工（v1.4.3）

- **來源 A（事件 `loggedApply`）**：條件 `(matched>0 || thrown) && errored` → **只記失敗**（規則出錯擋住動作）。
- **來源 B（全域攔截器）**：包住底層 `fetch` / `XHR`，記**所有成功** + kintone 原生動作（簽核 `updateWithStatus` / 存檔 `update` / `create` / `status`）的 HTTP 失敗。

問題：來源 B 永久覆寫整頁 `fetch` / `XHR`，對頁面上每個請求跑 regex；會影響同頁其他外掛；常駐無法釋放；需 `_logInFlight` 防遞迴；與來源 A 需互相協調避免重複記錄。

### 攔截器存在的唯一理由

kintone 原生「簽核」(`process.proceed`) 真正送出的 HTTP 請求發生在**外掛 handler `return` 之後**，而 kintone **沒有 `process.proceed.success` 事件**可掛。攔截底層請求是唯一能觀察「簽核 HTTP 成敗」的辦法。

> 對照：**存檔**（create/edit）有官方 `*.submit.success` 事件，**不需要**攔截器。

### 方案 A：官方事件 + 簽核樂觀記錄

刪除攔截器，log 改由事件層產生：

| 事件 | 失敗記錄 | 成功記錄 |
|---|---|---|
| `create.submit` / `edit.submit` | 規則出錯 → 在 submit handler（`loggedApply`）記失敗（同現況） | 改掛官方 `create.submit.success` / `edit.submit.success`，存檔由 kintone 確認後才記成功 |
| `process.proceed` | 規則出錯擋住簽核 → 在 proceed handler 記失敗（同現況） | 在 proceed handler 內，規則套用完且無錯（有 SELF_TOKEN 時 edit-check 通過）即**樂觀記成功** |

**取捨（明確記錄）**：簽核成功是「外掛已乾淨送出」的樂觀記錄，不是 kintone 最終 HTTP commit。實務上 handler 乾淨 `return` 後簽核幾乎不會在 HTTP 層失敗；真失敗時使用者當場可見、記錄狀態也不會改變。以這 5% 精確度換掉一個污染全域、跑在每個請求上的 monkey-patch，划算。

**log 語意維持相容**：使用者在 Log App 仍會看到「成功 / 失敗」兩類記錄，欄位與分類（`LOG_RESULT` / `LOG_CATEGORY` / `LOG_MESSAGE` 等）格式不變。失去的只有「kintone 因外掛以外的原因擋掉簽核」這種罕見、且外掛管理員無法修正的記錄。

### 成功記錄的訊息內容

沿用現有格式：`已套用 N 條規則：規則A、規則B`（取自 `_runInfo.matched` / `_runInfo.labels`）。
- proceed：在 proceed handler 結束時若 `matched>0 && !errored` 寫一筆成功。
- submit.success：需把該次 submit 的 `matched`/`labels` 帶到對應的 success 事件再寫（success 事件緊接 submit 觸發，中間無其他事件）。具體傳遞方式留待實作計畫。

> 細節（變數傳遞、`loggedApply` 條件式調整）屬實作層，於 writing-plans 階段定義。

---

## 二、`getServerTime()` 改本機時間

現況：需要 `now`/`today`/`nowTime` 時，對 `location.href` 發 `HEAD` 取回應 `Date` header（5 秒快取、500ms timeout、失敗退回本機），用意是避開使用者端時鐘誤差。代價是在簽核/存檔的當下多一個網路往返。

變更：直接用 `new Date()`。日期/時間值由瀏覽器本機時鐘產生。

連帶移除（變死碼）：
- `TIME_VALUE_SOURCES`、`ruleNeedsServerTime`
- `_timeCache`、`SERVER_TIME_CACHE_MS`、`SERVER_TIME_TIMEOUT_MS`、`getServerTime`
- `applyRules` 內 `needsTime` / `serverTimePromise` / `serverTime` 的判斷與等待
- `ctx` 不再帶 `serverTime`；`resolveValue` 與 `elapsedMinutes` 內 `serverTime || new Date()` 簡化為 `new Date()`

---

## 三、死碼清除清單（desktop.js / mobile.js 同步）

| 區塊 | 行（desktop.js 現況）| 原因 |
|---|---|---|
| 攔截器：`ACTION_URL_RE`、`_logInFlight`、`actionEventName`、`recordIdFromUrl`、`logKintoneAction`、`if (LOG_APP){…fetch/XHR patch…}` | 約 285–363 | 方案 A 不再需要 |
| server-time 一整組（見第二節） | 135–174、841–855 相關 | 改本機時間後無用 |
| 空 `if (trigger === 'process.proceed') {}` 與空 `CONFIG.rules.forEach((r,i)=>{})` | 851–854 | 移除 console.log 後殘留的空殼，後者仍空轉遍歷所有規則 |
| `statusMatches` switch 內用不到的 `case 'detail.show':` 標籤 | 約 656 | 設定畫面 `TRIGGERS` 不提供 `detail.show`，使用者建不出該規則，分支不可達 |

保留（非死碼）：`triggerMatches`（仍被 `applyRules` 使用）、`writeLog` 內的 `recIdFromPage`（成功/失敗記錄仍需從網址補抓 record id）、`detail.show` 事件本身的 `handleDetailShow`（補償寫入入口）。

> 「`detail.show` 不跑 `applyRules`」經查證**不是 bug**：`config.js` 的 `TRIGGERS` 只提供 create.show / edit.show / create.submit / edit.submit / process.proceed 五種觸發時機，沒有 detail.show，使用者無法建立該觸發的規則。

---

## 四、保留不動

- **`compensationWrite` 的 `location.reload()`**：補償寫入跑在**詳情頁**，而 `kintone.app.record.set()` 不適用於詳情頁，REST PUT 後畫面為舊資料，需 reload 才能反映。此路徑罕見（僅「下一狀態無編輯權限 + 有設 SELF_TOKEN」時），保留 reload 是正確取捨。
- 規則套用、跨 App 寫入、子表履歷模式、欄位條件、設定畫面（`config.js`）等所有功能行為。

---

## 五、驗證

無自動化測試框架，採手動驗證（在裝有外掛的測試 App）：

1. **存檔成功 log**：建立一條 create.submit 規則 + 設定 Log App → 新增記錄存檔 → Log App 出現一筆「成功」、訊息列出命中規則。
2. **存檔失敗 log**：故意讓規則出錯（如目標欄位代碼錯）→ 存檔被擋 → Log 出現「失敗」+ 分類。
3. **簽核成功 log**：proceed 規則 → 按流程按鈕 → Log 出現「成功」。
4. **簽核失敗 log**：規則出錯擋住簽核 → Log 出現「失敗」。
5. **本機時間**：`today`/`now`/`nowTime` 值正確寫入；F12 Network 不再出現對 `location.href` 的 `HEAD` 請求。
6. **無全域污染**：F12 Console 執行 `window.fetch.toString()` 應為原生 `[native code]`，非外掛包裝版。
7. **回歸**：補償寫入、子表履歷、欄位條件、跨 App 寫入行為不變。

---

## 六、發佈

1. 改 `desktop.js`，**完整覆蓋** `mobile.js`（兩者內容必須相同）。
2. `manifest.json` 版本 → `1.5.0`。
3. 更新 README：移除附錄 B-5（伺服器時間）、B-8b 之後關於網路攔截器（來源 B / 攔截器）的段落，改述方案 A 的 log 來源；其餘技術說明同步。
4. 用既有 `.ppk` 重新打包（維持相同 plugin ID）：
   ```
   npx @kintone/plugin-packer contents --ppk <你的.ppk> --out plugin.zip
   ```
