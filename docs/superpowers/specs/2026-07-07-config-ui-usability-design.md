# 設定畫面易用性改版 — 設計文件

**日期**：2026-07-07
**範圍**：`contents/dist/config.js`（外掛設定畫面）
**不影響**：`contents/dist/desktop.js`／`mobile.js`（runtime 邏輯與存檔 JSON 格式完全不變）

## 背景與目標

外掛設定畫面目前由 MIS（Jimmy）設定，但部門主管／承辦人也需要能「看懂」既有規則在做什麼，未來也可能需要自己微調。目前畫面對非技術人員有四個主要痛點，依優先序：

1. **狀態名稱要手動打字**（`fromStatus`/`toStatus`/`actionName`/`statusCond`），必須與 kintone 流程設定的狀態名稱逐字一致（全形半形、空白都算），打錯字不會有任何提示，只會在該筆記錄推進流程時規則靜默不觸發
2. **JSON 參數難寫**：`dateShift`（日期加減）、`lookup`（跨 App 查詢）、`subtableLastRow`（子表取值）、`appendSubtable`（新增履歷列）這 4 種 valueSource 仍要手寫 JSON，欄位代碼打錯字時只會在執行期噴出類似 `Invalid JSON string.` 這種不指名欄位的錯誤（見本外掛 2026-07 修的另一組 bug）
3. **規則卡片資訊量大**：一張規則卡全部欄位一次展開，10+ 列，同仁看不出規則在做什麼
4. **英文技術術語多**：`process.proceed`、`fromStatus`、`upsert` 等英文詞彙不好理解

目標：讓非技術背景的部門承辦人／主管能看懂並安全地微調規則，同時不犧牲 MIS 原有的彈性（進階 JSON 編輯退路保留）。

## 非目標

- 不改變 `desktop.js`/`mobile.js` 的任何執行期行為
- 不改變設定存檔的 JSON 資料結構（`fromStatus`/`toStatus`/`actionName`/`statusCond` 仍為逗號分隔字串；`valueParam` 仍為相同形狀的物件）
- 不引入前端框架或建置工具（維持單一 `config.js`、vanilla JS + 既有 `el()` helper 慣例）
- 不做規則層級的復原/版本歷史（超出本次範圍）

## 架構

所有改動集中在 `contents/dist/config.js`。沿用現有的 render 模式：`state` 是單一可變物件、`render()` 整頁重繪、各元件是回傳 DOM 節點的函式（`el`/`select`/`textInput`/`fieldCombo`/`renderMappingEditor` 等）。

新增兩條資料來源，皆採**快取 + 失敗退路**：

- `ensureAppStatuses()`：呼叫 `kintone.api('/k/v1/app/status.json', 'GET', { app: APP_ID })`（本 App，非目標 App），取得 `states`（狀態名稱清單）與 `actions`（動作名稱清單，來自 `{name, from, to}` 三元組，取 `name` 去重）。結果快取在模組變數，失敗時整段退回目前的手動文字輸入＋一行黃字提示。
- 自己 App 的欄位讀取，從現行的 `KintoneConfigHelper.getFields()`（回傳扁平清單、不含子表格內部欄位與型別結構）改為直接呼叫 `kintone.api('/k/v1/app/form/fields.json', 'GET', { app: APP_ID })`。這支 API 回傳的 `properties` 物件對 `SUBTABLE` 型別欄位會在 `properties[子表格代碼].fields` 內附上子表格「內部」欄位的完整定義，因此可以和既有 `ensureTargetFields()`（讀目標 App 欄位，做法相同）共用同一套「型別感知」欄位資料結構。同時保留 `KintoneConfigHelper.getFields()` 作為此 API 呼叫失敗時的 fallback（退回無型別的扁平清單，子表格內部欄位選單則退回文字輸入）。

存檔資料形狀不變，因此**風險侷限在畫面渲染與互動邏輯**，跟 runtime 無關。

## 元件設計

### 1. `statusChipPicker(options, currentCsv, onChange)`

取代 `fromStatus`/`toStatus`/`actionName`/`statusCond` 目前的 `textInput`。

- 內部值仍是逗號分隔字串（`currentCsv`），不改變 rule 物件的欄位型別
- 畫面：目前已選的值渲染成 chip（文字 + ✕ 移除鈕），尾端接一個「+ 新增」的 `fieldCombo` 風格輸入（datalist 來源＝`ensureAppStatuses()` 對應的 states 或 actions 清單），選定後 append 進逗號字串並清空輸入
- 特例：若字串為空或含 `*`，顯示一顆「任意（不限）」的特殊 chip；提供「設為任意」的按鈕快速清成 `*`
- **孤兒值處理**：既有規則中若含有目前清單裡已經不存在的狀態名稱（例如 kintone 流程改過名稱），該值仍照樣渲染成 chip（label 直接用原始字串），只是無法從 datalist 再次選中；**不會**因為對不到選項就靜默清除，避免改版後悄悄改變既有規則行為
- `actionName` 一律維持可自由輸入（不僅限清單內），因為動作名稱在 kintone 流程設定中可能重複或有客製情況，datalist 僅供輔助搜尋，不是強制限制

### 2. JSON→表單：4 個 valueSource 專屬表單

沿用 `renderMappingEditor` 已建立的「select 值來源 + 對應參數控制項」模式，各自拆一個小函式，都在 `r.valueParam` 這個物件上做欄位級別的讀寫（而不是整包字串 JSON.parse/stringify）：

- **`dateShiftForm(r, ctxOpts)`**：`base.from` 下拉，選項依情境而定——① 當這是 `writeSelf` 規則本身的 `valueParam` 時，只提供 `this`/`now`/`today`（此情境沒有目標 App，執行期 `ctx.targetRecord` 不存在，選 `target` 會落空，故 UI 不給選）；② 當這是 `writeOther` 的 `fieldMapping` 某一列時，才額外提供 `target`（目標 App 那筆記錄）。`base.from` 為 `this`/`target` 時才顯示 `base.field`（`fieldCombo`，來源分別為本 App 或該規則的目標 App 欄位）；`amount` 預設數字輸入，附一個核取方塊「改用欄位讀取數量」切換成 `fieldCombo` 選數字欄位（來源欄位同樣依 `this`/`target` 區分是否可選，邏輯與 `base.field` 一致）；`unit` 下拉（天/小時/分鐘/月/年）；`output` 下拉（日期/日期時間/時間/沿用來源型別）
- **`lookupForm(r)`**：`app`（目標 App ID 文字輸入，變更時觸發 `ensureTargetFields`）；`keyField`／`returnField` 皆為該目標 App 的 `fieldCombo`；`keyExpr` 文字輸入＋提示「可用 `{本記錄欄位代碼}` 代入」；`onMiss` 下拉（留空/視為錯誤）
- **`subtableLastRowForm(r)`**：`table` 為本 App 欄位中只列 `SUBTABLE` 型別的 `fieldCombo`；選定後 `field` 才會出現，選單來源為該子表格的內部欄位（依上述統一後的欄位資料取 `properties[table].fields`）；`row` 下拉（全部/第一列/最後一列/自訂索引，選「自訂索引」才顯示數字輸入）；`map`（選填的「來源值→顯示值」小型重複列編輯器，沿用 mapping-row 樣式）；`onMiss` 下拉（原值/留空/自訂值，選自訂值才顯示文字輸入）
- **`appendSubtableForm(r)`**：`table` 同上為 `SUBTABLE` 型別 `fieldCombo`；`subRules` 是重複列編輯器（沿用 `renderMappingEditor` 的列樣式），每列 `targetField` 限定為所選子表格的內部欄位、`valueSource` 沿用 `MAPPING_VALUE_SOURCES`；`historyMode` 核取方塊

四者皆保留「{ } JSON」進階按鈕（沿用 `renderMappingEditor` 已有的 `openTextModal` 陣列編輯模式，這裡對應到編輯單一物件），讓 MIS 仍可直接貼 JSON 做進階設定或除錯。

### 3. 規則卡片收合 + 白話摘要

- 模組層級維護一個 `expandedRuleIds`（`Set`，存 rule 的 `id`），**不寫入存檔的 state**，每次開啟設定畫面預設為空集合（= 全部收合）
- 規則卡片 header 永遠顯示：啟用勾選、`summarizeRule(r)` 產生的白話摘要句、chevron 展開/收合鈕、刪除/複製/上移/下移按鈕（沿用現有）
- body（完整表單 grid）只在該 rule id 存在於 `expandedRuleIds` 時才 render，點 chevron 切換
- `summarizeRule(r)` 依 `trigger`／`action` 組出一句話，例如：
  - writeSelf：「簽核推進到「核准完了」時 → 寫入本記錄「核准日期」＝今天」
  - writeOther：「簽核推進到「完了」時 → 新增/更新供應商主檔（4 個欄位）」
  - 若欄位不足以組出完整句子（例如剛新增、欄位還沒填）→ 顯示「規則 #N（尚未設定完整）」

### 4. 術語白話化

`TRIGGERS`／`ACTIONS`／`WRITE_MODES`／`ON_ERROR` 等現有陣列的 `l`（label）重新過一輪白話文字，括號內的英文技術代碼（如 `create.show`、`upsert`）**保留但縮小字級當附註**，不整個移除——維持與技術文件（CLAUDE.md／README 附錄 B）對得上的能力。

## 資料流

```
畫面載入
  → loadFields()（本 App／既有）＋ ensureAppStatuses()（新）＋ 自己 App 欄位改用 /k/v1/app/form/fields.json（改）
  → render()

使用者操作 chip / 表單
  → 直接修改 state.rules[i] 對應欄位（字串或物件的子欄位）
  → 不觸發整包 JSON.parse/stringify（維持現有 render-on-change 模式）

按「儲存」
  → 與現行邏輯相同：validate() → kintone.plugin.app.setConfig(JSON.stringify(state))
  → 存檔格式不變
```

## 錯誤處理

| 情境 | 行為 |
|---|---|
| `ensureAppStatuses()` 失敗（權限、網路） | 狀態/動作欄位退回原本的文字輸入，並顯示一行提示「無法讀取狀態清單，可手動輸入」 |
| 自己 App `/k/v1/app/form/fields.json` 失敗 | 退回 `KintoneConfigHelper.getFields()` 扁平清單；子表格內部欄位選單退回文字輸入並提示 |
| 目標 App 欄位讀取失敗（既有行為） | 維持現行：顯示錯誤提示＋允許手動輸入欄位代碼 |
| 既有規則的狀態/欄位值不在目前清單中（孤兒值） | chip／選單仍顯示原始值（不強制清空），使用者需要時可手動移除或重選 |

## 測試計畫

**自動化煙霧測試**（延伸本次對話中已用過的 node vm stub 手法，放在 scratchpad 或專案內一次性腳本，不需要引入正式測試框架）：
- 模擬 `/k/v1/app/status.json`、本 App 與目標 App 的 `/k/v1/app/form/fields.json`（其中一個 App 含 `SUBTABLE` 型別欄位）
- 對一筆包含 dateShift、一筆包含 lookup、一筆包含 subtableLastRow/appendSubtable 的規則資料跑 `render()`，確認不拋錯、且對應表單元件（select/fieldCombo/chip）數量符合預期
- 確認規則卡片預設收合（body 未 render）、點擊展開後 body 出現

**手動驗證**（`build.ps1` 打包後上傳至 kintone 測試環境）：
1. 開啟設定畫面，確認既有規則（含孤兒值情境）仍完整顯示、白話摘要合理
2. 挑一條 dateShift、一條 lookup、一條 subtableLastRow 或 appendSubtable 的既有規則展開，確認表單值正確回填目前 JSON 內容
3. 用表單修改一個值、儲存、重新整理，確認改動有存到
4. 實際觸發一次規則（例如流程推進），確認行為與改版前一致（因為存檔格式沒變，這步是防禦性確認而非預期會有差異）

## 風險與緩解

- **最大風險**：子表格內部欄位讀取（改走 `/k/v1/app/form/fields.json` 直讀本 App schema）如果回傳結構與預期不同，可能讓子表格相關表單整段失效 → 緩解：完整 fallback 到手動文字輸入，且此路徑僅影響 2 個較少用的 valueSource（`subtableLastRow`／`appendSubtable`），不影響其他規則類型
- **次要風險**：`summarizeRule()` 對非典型規則組合（例如條件複雜、valueSource 是 `readonly`／`clear` 等無明顯「值」的類型）可能組出奇怪的句子 → 緩解：白話摘要只是輔助顯示，展開後仍可看到完整精確設定；異常情況顯示保守的通用摘要而非硬湊
