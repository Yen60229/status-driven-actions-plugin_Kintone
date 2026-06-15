# 設計：拿掉全域攔截器、時間改吃本機、順手清死碼

日期：2026-06-15　目標版本：v1.5.0　狀態：待實作

動到的檔案：`contents/dist/desktop.js`、`contents/dist/mobile.js`。這兩個檔內容一模一樣，改完要記得同步。

## 為什麼要做這件事

這個外掛說穿了就是個「單筆、被事件帶著跑」的東西。它只掛了 6 個使用者操作事件，每次也只碰當下那一筆 `event.record`，所有 API 查詢都是 `limit 1`，從頭到尾沒有一次撈一堆記錄回來算。所以那些講批次效能的招（分批、cursor 分頁、用 Map 取代雙層迴圈、批量更新）對它幾乎都用不上——它本來就沒這個問題。

真正有點臭的是 v1.4.0 之後塞進來的兩段：一個會去蓋掉整頁的網路請求，一個每次動作都偷打一個網路來對時間。這兩段也順便養出一堆死碼。這份設計就是專門來收這兩攤。

## 要做到什麼

1. 把覆寫 `window.fetch` / `XMLHttpRequest` 的那段全域攔截器拿掉，log 改走 kintone 官方事件（下面叫方案 A）。
2. `getServerTime()` 不要再打網路，直接吃本機 `new Date()`。
3. 上面兩件事一改，會牽連出一票死碼，一起掃乾淨。

不做的事：不動任何既有功能（規則套用、跨 App 寫入、補償寫入、設定畫面那些都不碰），也不會多拉什麼後台或雲端運算進來。

---

## 一、log 改成方案 A（這次的重點）

### 現在是怎麼記的（v1.4.3）

現況拆成兩個來源：

- **來源 A，事件這邊的 `loggedApply`**：條件是 `(matched>0 || thrown) && errored`，所以它其實只記失敗——就是規則自己出錯把動作擋下來那種。
- **來源 B，全域攔截器**：把底層的 `fetch` / `XHR` 包起來，負責記所有成功，外加 kintone 原生動作（簽核 `updateWithStatus`、存檔 `update` / `create` / `status`）在 HTTP 層失敗的情況。

來源 B 的問題就在它太霸道：永久把整頁的 `fetch` / `XHR` 換成自己的版本，頁面上每個請求都要先過它一次 regex；同一頁要是還有別的外掛也會被波及；而且它一旦掛上去就拿不下來，還得靠 `_logInFlight` 這個旗標防自己遞迴，跟來源 A 之間也要小心翼翼避免同一個動作記兩筆。

### 攔截器到底為什麼會存在

關鍵在簽核。kintone 原生的「簽核」(`process.proceed`) 真正那個 HTTP 請求，是在外掛 handler `return` **之後**才送出去的，而 kintone 又沒有 `process.proceed.success` 這種事件可以讓你掛。換句話說，想知道「這次簽核到底有沒有成功」，唯一的辦法就是去攔底層請求。攔截器就是為這件事生的。

存檔（create / edit）就沒這個困擾，它有官方的 `*.submit.success` 可以掛，根本不需要攔截器。

### 方案 A 怎麼做

把攔截器整段砍掉，log 全部回到事件層來產生：

| 事件 | 失敗怎麼記 | 成功怎麼記 |
|---|---|---|
| `create.submit` / `edit.submit` | 規則出錯，照舊在 submit handler（`loggedApply`）記一筆失敗 | 改掛官方 `create.submit.success` / `edit.submit.success`，等 kintone 確定存好了才記成功 |
| `process.proceed` | 規則出錯擋住簽核，照舊在 proceed handler 記失敗 | 在 proceed handler 裡，規則跑完沒出錯（有設 SELF_TOKEN 的話再加上 edit-check 過）就先當成功記下去 |

這裡有個取捨講清楚：簽核成功這筆是「外掛這邊乾淨送出去了」的樂觀記錄，不等於 kintone 最後真的 commit 成功。但實際上 handler 都乾淨 `return` 了，簽核在 HTTP 層再失敗的機率很低；真的失敗使用者當下也看得到，記錄狀態本來就不會變。為了這 5% 的精準度，去養一個會蓋掉全域、每個請求都要插一腳的 monkey-patch，不值得。

對使用者來說 log 的體感不變：Log App 裡一樣看得到成功、失敗兩種記錄，欄位跟分類（`LOG_RESULT`、`LOG_CATEGORY`、`LOG_MESSAGE` 那些）格式照舊。唯一會少掉的，是「簽核被 kintone 因為外掛以外的原因擋掉」這種記錄——而這種事本來就少見，外掛管理員看到了也修不了。

### 成功訊息寫什麼

沿用現在的格式：`已套用 N 條規則：規則A、規則B`，資料就從 `_runInfo.matched` / `_runInfo.labels` 拿。

- proceed：handler 收尾時如果 `matched>0 && !errored` 就寫一筆成功。
- submit.success：要把這次 submit 的 `matched` / `labels` 帶到對應的 success 事件再寫（success 緊接在 submit 後面觸發，中間不會插別的事件）。怎麼帶留到實作計畫再定。

實作層的細節（變數怎麼傳、`loggedApply` 條件式怎麼調）這邊先不寫死，等 writing-plans 再處理。

---

## 二、時間改吃本機

現在要用到 `now` / `today` / `nowTime` 的時候，它會對 `location.href` 發一個 `HEAD`，從回應的 `Date` header 取時間（還做了 5 秒快取、500ms timeout，失敗才退回本機），用意是怕使用者電腦時鐘不準。代價就是每次簽核、存檔的當下都多一趟網路。

改法：直接 `new Date()`，日期時間就吃瀏覽器本機時鐘。

跟著一起變死碼、要清掉的：

- `TIME_VALUE_SOURCES`、`ruleNeedsServerTime`
- `_timeCache`、`SERVER_TIME_CACHE_MS`、`SERVER_TIME_TIMEOUT_MS`、`getServerTime`
- `applyRules` 裡那段 `needsTime` / `serverTimePromise` / `serverTime` 的判斷跟等待
- `ctx` 不用再帶 `serverTime`；`resolveValue` 跟 `elapsedMinutes` 裡的 `serverTime || new Date()` 直接收斂成 `new Date()`

---

## 三、要清的死碼（兩個檔同步）

| 區塊 | 行數（對 desktop.js 現況）| 為什麼是死碼 |
|---|---|---|
| 攔截器整組：`ACTION_URL_RE`、`_logInFlight`、`actionEventName`、`recordIdFromUrl`、`logKintoneAction`、`if (LOG_APP){…fetch/XHR patch…}` | 約 285–363 | 方案 A 用不到了 |
| server-time 一整組（見第二節） | 135–174、以及 841–855 相關 | 改本機時間後就沒用了 |
| 空的 `if (trigger === 'process.proceed') {}` 跟空的 `CONFIG.rules.forEach((r,i)=>{})` | 851–854 | 之前砍 console.log 留下來的空殼，後面那個還在空轉遍歷全部規則 |
| `statusMatches` 裡那個碰不到的 `case 'detail.show':` | 約 656 | 設定畫面的 `TRIGGERS` 根本沒給 `detail.show`，使用者建不出這種規則，分支永遠進不去 |

要留著、不是死碼的：`triggerMatches`（`applyRules` 還在用）、`writeLog` 裡的 `recIdFromPage`（記成功失敗時還是得從網址補抓 record id）、`detail.show` 事件本身的 `handleDetailShow`（補償寫入的入口）。

附帶一提，「`detail.show` 沒去跑 `applyRules`」查過了，**不是 bug**。`config.js` 的 `TRIGGERS` 只開了 create.show / edit.show / create.submit / edit.submit / process.proceed 這五種，沒有 detail.show，使用者根本建不出掛在 detail.show 的規則。

---

## 四、不動的部分

- **`compensationWrite` 裡的 `location.reload()`**：補償寫入是跑在詳情頁，偏偏 `kintone.app.record.set()` 在詳情頁不能用，REST PUT 寫完畫面還是舊的，只能 reload 才看得到新值。而且這條路只有「下一個狀態沒編輯權限、又有設 SELF_TOKEN」才會走到，很少見，reload 留著是對的。
- 規則套用、跨 App 寫入、子表履歷模式、欄位條件、設定畫面（`config.js`）這些功能行為通通照舊。

---

## 五、怎麼驗

沒有自動化測試，就在裝了外掛的測試 App 上手動跑：

1. **存檔成功**：建一條 create.submit 規則加設定好 Log App，新增記錄存檔，Log App 應該多一筆「成功」、訊息列出命中哪些規則。
2. **存檔失敗**：故意讓規則出錯（例如目標欄位代碼打錯），存檔被擋下來，Log 出現「失敗」加分類。
3. **簽核成功**：掛一條 proceed 規則，按流程按鈕，Log 出現「成功」。
4. **簽核失敗**：規則出錯把簽核擋掉，Log 出現「失敗」。
5. **本機時間**：`today` / `now` / `nowTime` 寫進去的值正確，F12 Network 不應該再看到對 `location.href` 的 `HEAD`。
6. **沒污染全域**：F12 Console 打 `window.fetch.toString()`，應該是原生 `[native code]`，不是外掛包過的版本。
7. **回歸**：補償寫入、子表履歷、欄位條件、跨 App 寫入這些行為要跟改之前一樣。

---

## 六、發佈

1. 改 `desktop.js`，改完整個蓋過去 `mobile.js`（兩個內容要一致）。
2. `manifest.json` 版本進到 `1.5.0`。
3. README 跟著更新：把附錄 B-5（伺服器時間）、還有 B-8b 後面講網路攔截器（來源 B）那幾段拿掉，改寫成方案 A 的 log 來源，其餘技術說明同步。
4. 用原本那把 `.ppk` 重新打包，這樣 plugin ID 不變：
   ```
   npx @kintone/plugin-packer contents --ppk <你的.ppk> --out plugin.zip
   ```
