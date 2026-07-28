# 提醒視窗動作（`action: 'dialog'`）設計 — v1.15.0

**日期**：2026-07-28
**狀態**：已實作

## 需求

指定事件觸發後跳出提醒視窗，文字可自行輸入；按下確定後才接續執行剩餘的規則。視窗樣式可預覽、可調整。

## 定位：第三種 action，不是新的 valueSource

規則模型原本是 `trigger` + 狀態條件 + 欄位條件 → `writeSelf` / `writeOther`。提醒視窗不寫任何欄位，但需要一模一樣的比對條件，所以做成第三種 `action`：`dialog`。

這個選擇讓它零成本繼承 `triggerMatches`、`statusMatches`、`conditions` + AND/OR，runtime 不需要為它另開比對路徑，設定畫面也只是 `ACTIONS` 多一項、`renderRuleCard` 多一個分支。

## 檔案結構：`dist/dialog.js` 三邊共用

「可預覽」這個需求的真正風險是預覽與實際長不一樣。若渲染邏輯在 `desktop.js` 抄一份、`config.js` 再抄一份，兩份遲早不同步，而預覽的唯一價值就是可信。

`manifest.json` 的 `desktop.js` / `mobile.js` / `config.js` 都是陣列，所以新增一個共用檔 `contents/dist/dialog.js` 讓三邊都載入（都排在各自主檔之前）。它只掛 `window.SdaDialog = { show, buildCss, DEFAULT_STYLE }`，不註冊任何事件。設定畫面的「預覽」呼叫的就是 runtime 那支 `show()`。

這也是 CLAUDE.md「desktop.js 與 mobile.js 必須完全相同」規則的一個例外標註：`dialog.js` 不需要複製。

## 資料結構

規則層 `rule.dialog`：`icon` / `title` / `text` / `confirmLabel` / `cancelLabel` / `cancelMessage` / `accent`。
全域層 `state.dialogStyle`：`width` / `fontSize` / `lineHeight` / `titleSize` / `radius` / `overlay` / `accent` / `buttonColor` / `align` / `customCss`。

**分層依據**：一個組織會有數條提醒規則且希望長得一致，所以尺寸類旋鈕放全域、改一次到位；但「提醒」與「警告」需要用顏色區分語氣，所以 `icon` 與 `accent` 可在規則層覆寫。覆寫範圍刻意只有這兩項——再多就等於沒有全域。

**匯出／匯入**：`dialogStyle` 加入匯入白名單（Token / App ID 仍不帶）。判準是「是不是本 App 專屬的機密或識別碼」，外觀兩者皆非；不帶的話匯入的提醒規則會長得跟來源 App 不一樣。

## 文字表達能力：純文字 + `{欄位代碼}`

內文以 `textContent` + `white-space: pre-wrap` 寫入，不碰 `innerHTML`。換行與縮排原樣保留，`※`、`①②③`、`【】` 都只是普通字元，足以重現需求截圖；設定內容永遠不會被當成標記解析。

`{欄位代碼}` 代換沿用 `formula` / `keyExpr` 既有的 `{}` 慣例，多值欄位取 `name || code` 以 `、` 串接，欄位不存在代成空字串並 `console.warn`（提醒視窗不該因為打錯欄位代碼就整個爆掉）。

## 中止語意

`cancelLabel` 留空＝純提醒（只有確定鍵，按了一定接續）；填了才出現取消鍵，按下去中止動作。

中止走既有的 `event.error` 路徑，訊息用 `cancelMessage`。Log 另闢 `category: 'cancelled'` / `result: '取消'`，在既有失敗分支**之前**判斷——使用者主動取消是正常操作，混進 `system` / `config` 會讓錯誤統計失真。

## 四個邊界

1. **只有 `process.proceed` 與 `/\.submit$/` 攔得住。** 只有這些時機 kintone 會等 handler 回傳的 Promise。`*.show` 畫面已渲染完、`*.submit.success` 記錄已存檔，不符時 runtime 強制清空 `cancelLabel`，設定畫面同步顯示警告。讓使用者以為能取消是騙人的。
2. **中止點＝規則在清單裡的位置。** 排在它前面的規則已經跑完。`writeOther` 一律在所有 selfRules 之後執行，故必定被擋。
3. **`create.submit` 抓不到 `$id`**，`{記錄編號}` 會是空的。要顯示新單號只能用 `*.submit.success`，但那時不能擋。
4. **`runProceedRulesViaApi`** 傳 `noBlock: true`：狀態已由 REST API 推進完畢，取消無法回滾。

## 鍵盤

沒有取消鍵時 `Esc` 視同確定，有取消鍵時 `Esc` 視同取消。否則使用者關掉純提醒視窗會意外中斷流程，且完全沒有回饋。

## 刻意不做

**「同一筆記錄只提醒一次」**（sessionStorage 記已讀）。截圖那類送出提醒，每次送出都跳正是預期效果；一旦有記憶就會產生「為什麼這次沒跳」的客訴，而排查一個看不見的狀態比重看一次提醒昂貴得多。

若日後真的需要，擴充點是 `rule.dialog.once`（`never` / `perRecord` / `perSession`），key 用 `appId + recordId + rule.id`。

## 驗證

以 stub DOM 跑過 20 項 smoke test，涵蓋：`buildCss` 的數值容錯與 `customCss` 串接順序、確定／取消／`Esc` 三種關閉路徑的回傳值、overlay 清理、重複點擊只 resolve 一次、`{欄位代碼}` 代入、以及 `applyRules` 中「按確定→後續規則執行」與「按取消→`event.error` 已設且後續規則未執行」。
