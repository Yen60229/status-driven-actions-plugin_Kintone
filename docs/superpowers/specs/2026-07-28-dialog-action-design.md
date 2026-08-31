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
全域層 `state.dialogStyle`：`fontSize` / `lineHeight` / `titleSize` / `radius` / `overlay` / `accent` / `buttonColor` / `align` / `customCss`。（`width` 曾存在，v1.16.0 移除，見下方「寬度與換行」。）

**分層依據**：一個組織會有數條提醒規則且希望長得一致，所以尺寸類旋鈕放全域、改一次到位；但「提醒」與「警告」需要用顏色區分語氣，所以 `icon` 與 `accent` 可在規則層覆寫。覆寫範圍刻意只有這兩項——再多就等於沒有全域。

**匯出／匯入**：`dialogStyle` 加入匯入白名單（Token / App ID 仍不帶）。判準是「是不是本 App 專屬的機密或識別碼」，外觀兩者皆非；不帶的話匯入的提醒規則會長得跟來源 App 不一樣。

## 文字表達能力：純文字 + `{欄位代碼}`

內文以 `textContent` + `white-space: pre`（v1.16.0 前為 `pre-wrap`）寫入，不碰 `innerHTML`。換行與縮排原樣保留，`※`、`①②③`、`【】` 都只是普通字元，足以重現需求截圖；設定內容永遠不會被當成標記解析。

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

## 追記（v1.16.0）：改用組織既有的 SweetAlert2

原始設計自建元件、刻意不依賴 SweetAlert2，理由是「預覽＝實際」——外掛設定畫面是 kintone 管理端頁面，若 runtime 用全域 Swal 而設定畫面拿不到它，預覽就會騙人。

但這個理由忽略了一件事：**組織已把 SweetAlert2 建成全域可用的標準元件**，而且外掛自己早就有一處在用它（`compensationWrite` 的 `if (window.Swal)`）。堅持自建等於讓外掛內部自相矛盾，也讓提醒視窗跟組織其他系統長得不一樣。

**決定**：`SdaDialog.show()` 在呼叫當下偵測 `window.Swal`，有就用、沒有才用內建元件。兩條路的回傳值語意相同，呼叫端不需區分。

- **偵測必須在 `show()` 內**，不可在載入時：外掛 JS 可能早於 App 自訂 JS 執行。
- **樣式以 `.sda-swal` / `.sda-swal-container` 收斂**，避免外掛的寬度字級設定污染 App 自己的 SweetAlert2 呼叫。
- **`accent` 停在預設值就不覆寫 SweetAlert2 的圖示配色**：管理者沒表達意見時，保留原生的淺橘圈線＋深橘驚嘆號，正好就是需求截圖那個樣子。
- **`success` / `error` 圖示固定用語意色**，`accent` 不介入。SweetAlert2 這兩個圖示由多個子元素組成，只改 `border-color` 與 `color` 會半染色；兩種渲染器在此行為一致。
- **原本的預覽風險改以誠實揭露處理**：設定畫面用 `hasSwal()` 偵測並顯示綠／橘提示，說明預覽是否等於實際。放棄保證、改為揭露，是接受此方案時付出的代價。

**連帶收斂**：`config.js` 的所有原生 `alert` / `confirm` 一併改走 `notify()` / `askConfirm()`。三個必要的配套——`openTextModal` 的確定鈕改 `async`（匯入流程需在 modal 內再確認一層）、儲存成功改 `.then()` 後才跳轉（非同步視窗不擋，導頁會把訊息帶走）、`.sda-swal-container` 的 `z-index` 拉到 100000（SweetAlert2 預設 1060 會被 `openTextModal` 的 9999 蓋住）。

`compensationWrite` 也改走 `SdaDialog`，順帶修掉一個既有缺陷：舊版沒有 Swal 時只寫 `console.warn`，使用者看不到補償寫入失敗，履歷漏記卻無人察覺。

### 寬度與換行（v1.16.0 定案）

初版把內文設成 `pre-wrap` + `max-width` 當折行界線，實測後確認不是要的行為。**管理者在輸入框排好的版面就是規格**，系統不該替它決定哪裡折。

- 內文改 `white-space: pre` 且移除 `word-break`：只在設定內容的換行字元處斷行。
- **`dialogStyle.width` 整個移除**，設定畫面也不再有寬度欄位。中途曾把它降級為「安全閥」（超過就橫向捲動），但那仍然是一個會在使用者沒預期時介入的上限；既然寬度由內容決定，留一個只會在極端情況下改變行為的旋鈕只是徒增困惑。SweetAlert2 那邊要額外 `max-width:none` 解掉它自帶的 `max-width:100%`。
- **遮罩改 `overflow:auto`、視窗改 `margin:auto` 置中**，拿掉 flex 的 center 對齊。flex 置中在內容超出容器時會裁掉起始邊且捲不回去——左側文字永久看不到，這是沒有上限之後必須處理的實際破口。
- **`@media (max-width:600px)` 恢復 `pre-wrap` 並補回 `max-width:92vw`**。這是唯一違反「不換行」的地方，理由是物理限制：14px 的 40 個全形字約 560px，超過手機螢幕寬度，不換行等於逼手機使用者左右滑才讀得完提醒。電腦版照排版、手機版保可讀性。該區段排在 `customCss` 之前，管理者要推翻仍推翻得掉。

## 驗證

以 stub DOM 跑過 60 項 smoke test：

- **內建元件**：`buildCss` 的數值容錯與 `customCss` 串接順序、確定／取消／`Esc` 三種關閉路徑的回傳值、overlay 清理、重複點擊只 resolve 一次、SVG 圖示（success 畫勾、error 畫叉、warn 保留字元＋動畫圓環）。
- **寬度與換行**：主樣式區用 `pre` 而非 `pre-wrap`、無 `word-break`、無 `max-width` 上限、SweetAlert2 的 `max-width:100%` 已解除、遮罩 `overflow:auto` 且視窗 `margin:auto`（遮罩規則不含 `justify-content`）、`@media (max-width:600px)` 存在且排在 `customCss` 之前、`width` 已從樣式模型移除。
- **SweetAlert2 路徑**：有 Swal 時不產生內建 DOM、圖示名稱對應、傳 `text` 而非 `html`、`customClass` 收斂、`allowOutsideClick: false`、無取消鍵時 dismiss 仍回 `true`、有取消鍵時回 `false`、空標題不送出、accent 預設不覆寫圖示／改色才覆寫、`success` 保留語意色、`z-index` 壓過 `openTextModal`、無 Swal 時退回內建。
- **runtime 整合**：`{欄位代碼}` 代入、「按確定→後續規則執行」、「按取消→`event.error` 已設且後續規則未執行」，以及**在 `desktop.js` 執行完之後才掛上 `window.Swal` 仍能被 `show()` 偵測到**（驗證偵測時機的決定）。
