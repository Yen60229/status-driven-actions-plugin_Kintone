# 狀態驅動動作外掛（Status-Driven Actions Plug-in）— 開發指南

> 此檔為**開發者 / Claude Code** 在本資料夾工作的指引。
> 給管理者看的「使用說明書」在 [README.md](README.md)；
> 程式碼層面的完整技術說明集中在 [README.md 附錄 B](README.md)（B-1 ～ B-13）。

---

## 這是什麼

一個 kintone **外掛（plugin）**。當記錄的流程狀態改變（或儲存、開啟）時，依管理者在設定畫面定義的「規則」自動寫入欄位值、寫入子表格、或寫入其他 App 的記錄，並可選配將每次執行結果記到一個 Log App。

整個外掛是**被動事件驅動、無背景常駐**：只註冊 6 個使用者操作事件，無 `setInterval`／輪詢。詳見 [README.md 附錄 B-2](README.md)。

---

## 目錄結構

```
status-driven-actions-plugin/
├── CLAUDE.md                ← 本檔
├── README.md                ← 使用說明書 + 附錄 B 技術說明（最重要的參考）
├── contents/                ← 外掛原始內容（打包來源）
│   ├── manifest.json        ← 版本號、事件 JS 註冊、設定畫面宣告
│   ├── dist/
│   │   ├── desktop.js        ← 執行期 runtime（電腦版）
│   │   ├── mobile.js         ← 與 desktop.js 內容【完全相同】
│   │   └── config.js         ← 設定畫面（純 JS 渲染到 #ui-section）
│   ├── source/
│   │   ├── html/config.html  ← 設定畫面外殼
│   │   ├── css/config.css
│   │   └── image/icon.png
│   └── 3rd_parties/kintone-config-helper.js
├── config-ui-preview.html   ← 設定畫面的離線預覽（非打包內容）
├── docs/superpowers/        ← 設計文件（specs）與實作計畫（plans）
├── *.ppk                    ← 簽章私鑰【機密，已 .gitignore，切勿提交】
└── plugin*.zip              ← 建置產物【已 .gitignore】
```

---

## ⚠️ 最重要的規則

1. **`desktop.js` 與 `mobile.js` 內容必須完全相同。**
   只改 `desktop.js`，然後把同樣內容覆蓋到 `mobile.js`。改完務必驗證：
   `diff contents/dist/desktop.js contents/dist/mobile.js` 應無輸出。
   （單一檔案同時註冊 `app.record.*` 與 `mobile.app.record.*` 事件，kintone 自動忽略不符當前平台的事件名稱。）

2. **絕不可 `console.log` 原始 config。** `rawConfig.data` 內含 API Token，會洩漏給所有開 DevTools 的使用者。見 [README.md 附錄 B-12](README.md)。

3. **`*.ppk` 私鑰絕不進版控、絕不外洩。** 用同一把 `.ppk` 重新打包可維持相同 plugin ID，於 kintone 後台「更新」即可覆蓋升級、設定自動保留。

4. **程式碼裡不寫註解。** 本專案刻意移除 `dist/*.js` 的所有註解，技術說明一律寫進 README 附錄 B。維護時更新附錄 B，不要在 JS 內加回註解。

---

## 重新打包（建置）

修改 `contents/dist/*.js` 後：

```bash
npx @kintone/plugin-packer contents --ppk <你的.ppk> --out plugin.zip
```

產物 `plugin*.zip` 不進版控（`.gitignore` 已排除）。版本號改在 `contents/manifest.json` 的 `version`。

---

## 改完一定要檢查的清單

- [ ] `desktop.js` 的修改已同步到 `mobile.js`（`diff` 無差異）
- [ ] `contents/manifest.json` 的 `version` 已更新（若是發布）
- [ ] 沒有任何 `console.log(rawConfig)` 或印出 Token 的程式碼
- [ ] 新增/變更的技術行為已寫進 [README.md 附錄 B](README.md)
- [ ] 沒有把 `.ppk`、`plugin.zip` 等加進 git

---

## runtime（desktop.js）模組地圖

| 區塊 | 內容 | 對應附錄 |
|---|---|---|
| 設定載入 | `PLUGIN_ID`、`TOKENS`、`SELF_TOKEN`、`LOG_APP`、`LOG_TOKEN` 由 `kintone.plugin.app.getConfig` 解析單一 JSON | B-4 |
| 事件命名空間 | `APP_NS` / `MOBILE_NS`、`E([...])` 同時組電腦版與手機版事件名 | B-1 |
| 核心套用 | `applyRules` / `process.proceed` 補償寫入（`pendingWrite` + `checkEditPermission`） | B-3 |
| 值來源 | `valueSource` 一覽：`fixed`/`loginUser`/`today`/`fieldCopy`/`formula`/`lookup`/`dateShift`/`subtableLastRow`/`appendSubtable`/`readonly`… | B-5、B-6 |
| 日期加減 | `dateShift`（`parseBaseDate`/`addPeriod`/`formatDateOut`/`computeDateShift`；可讀 `ctx.targetRecord`，v1.6.0） | B-6 |
| 子表格履歷 | `appendSubtable` + `historyMode` | B-7 |
| 執行 Log | `loggedApply`、`flushSubmitLog`、`writeLog`/`postLog`、`_runInfo`/`_pendingSubmitLog`（方案 A，v1.5.0） | B-8、B-8a、B-8b |
| 錯誤分類 | `errorCodeOf`/`classifyError`/`friendlyError`/`recordError`（`session`/`permission`/`config`/`system`） | B-8a |
| 寫入判別 | `classifyWrite`（userObject / arrayField / scalar） | B-9 |
| 規則條件 | `rule.conditions` + `op`（eq/neq/startsWith/contains/inList）+ `conditionLogic` | B-10 |
| 狀態多值 | `statusMatchesList`：`fromStatus`/`toStatus`/`actionName`/`statusCond` 支援逗號分隔任一命中（v1.7.2） | B-10a |
| 觸發複選 | `triggerMatches`／`statusMatches` 依實際觸發事件分流；`rule.trigger` 可逗號分隔複選（v1.9.0） | B-10b |
| 跨 App 寫入 | `writeOther`（create/update/upsert + keyMapping/fieldMapping + onError；`ruleNeedsTargetRecord` 抓整筆供 dateShift 回算）；`buildOtherPayload` 回傳 `{payload,suspects}`，`fieldCopy` 來源欄位不存在／`dateShift` 空值時標記可疑；`badFieldsFromError` 解析 kintone `errors` 指名欄位 | B-11 |
| 設定畫面 | `config.js`：欄位用 `fieldCombo`（datalist 文字搜尋）、`searchableSelect`；觸發時機用 `triggerCheckboxGroup` 複選（v1.9.0）；writeOther 的 keyMapping/fieldMapping 改用 `renderMappingEditor`（目標欄位下拉＝`ensureTargetFields` 讀目標 App 的 `/k/v1/app/form/fields.json`；值來源＝`MAPPING_VALUE_SOURCES`；保留「{ } JSON」進階編輯退路，v1.8.0）；匯出／匯入（B-12a）；`UI_VERSION` 顯示於工具列 | B-12a |

**先讀附錄 B 再動程式碼**——它是這份 runtime 的權威說明。

---

## 設定 JSON 結構（匯出／匯入；給「自動產生規則」用）

> 這一節**自包含**，把它整段貼給另一個 session，它就能產出可直接從設定畫面「匯入設定」的 JSON。
> 設定存放方式：整包設定是**單一 JSON 字串**，存在 `kintone.plugin.app.getConfig().data`。設定畫面用 `JSON.parse/JSON.stringify` 存取。

### 匯入規則（重要）

- 設定畫面的「**匯入設定**」**只套用 `rules`**，**不動**本 App 的 `selfAppToken`／`tokens`／`logAppId`／`logToken`（避免把來源 App 的 Token／App ID 誤帶過去）。
- 因此自動產生時，**只要輸出 `rules`**即可。可給下列任一形狀：
  - `{ "rules": [ ...規則... ] }`
  - 或直接一個陣列 `[ ...規則... ]`
- 欄位一律填 **kintone 欄位代碼（Field Code）**，不是顯示名稱。狀態名稱要與 kintone 流程設定**完全一致**（全形半形、空白都算）。

### 整包 state 結構（匯出時的完整形狀，供參考）

```jsonc
{
  "version": "1.0",
  "selfAppToken": "",            // 本 App API Token（補償寫入用；匯入不覆蓋）
  "tokens": [                     // 跨 App Token 對應表（匯入不覆蓋）
    { "appId": "42", "appLabel": "客戶主檔", "token": "xx␣" }
  ],
  "logAppId": "",                 // 執行 Log App ID（匯入不覆蓋）
  "logToken": "",                 // Log App Token（匯入不覆蓋）
  "rules": [ /* Rule[]，見下 */ ]
}
```

### Rule 物件

```jsonc
{
  "id": "r-1700000000000",        // 選填，唯一字串即可
  "label": "核准時寫核准日期",     // 選填，顯示名稱
  "enabled": true,                // 選填，預設 true；false=停用不執行

  "trigger": "process.proceed",   // 必填，見下方「trigger 與狀態條件」

  // ── 狀態條件（依 trigger 擇一組）──
  "fromStatus": "*",              // process.proceed：推進前狀態
  "toStatus": "核准完了,B課核准",  // process.proceed：推進後狀態；逗號分隔=任一(v1.7.2)
  "actionName": "*",              // process.proceed：動作（按鈕）名稱
  "statusCond": "*",              // edit.show/edit.submit：當前狀態（逗號分隔=任一）

  // ── 欄位條件（選填；全部成立才執行）──
  "conditions": [
    { "field": "申請類別", "op": "inList", "value": "變更,恢復" }
  ],
  "conditionLogic": "AND",        // 選填 AND(預設)/OR

  // ── 動作 ──
  "action": "writeSelf",          // writeSelf=寫本記錄 / writeOther=寫其他 App

  // action=writeSelf 時：
  "targetField": "核准日期",       // 目標欄位代碼
  "valueSource": "today",         // 見「valueSource 一覽」
  "valueParam": null,             // 依 valueSource，字串或物件
  "skipIfFilled": true,           // 選填，僅在目標欄位空白時才寫
  "appendMode": false,            // 選填，CHECK_BOX/多選 追加不覆蓋

  // action=writeOther 時：
  "writeMode": "update",          // create / update / upsert
  "targetApp": "42",              // 目標 App ID
  "keyMapping":  [ { "targetField": "客戶代號", "valueSource": "fieldCopy", "valueParam": "客戶代號" } ],
  "fieldMapping":[ { "targetField": "最後出貨日", "valueSource": "today" } ],
  "onError": "block"              // block(預設)/log/ignore
}
```

`*`＝任意。`'*'` 或留空都視為不限制。

### trigger 與狀態條件對應

`trigger` 可填逗號分隔字串複選多個觸發（v1.9.0）。`statusMatches` 是依**實際觸發的那個事件**分流判斷（`fromStatus/toStatus/actionName` 或 `statusCond`），跟 `rule.trigger` 裡還填了什麼無關，所以技術上把 `process.proceed` 跟其他觸發混在同一條 `trigger` 字串裡也能正常運作。但設定畫面的複選 checkbox 刻意把 `process.proceed` 設計成只能單獨勾（其餘 6 種顯示類／儲存類可自由複選），純粹是為了規則語意清楚——同一條規則同時用「流程狀態」跟「記錄狀態」兩套條件語言容易搞混。手動編輯 JSON 匯入時不受此限制，但建議仍照這個慣例分開寫，避免自己看不懂自己設的規則。

| `trigger` | 狀態欄位 | 說明 |
|---|---|---|
| `process.proceed` | `fromStatus` / `toStatus` / `actionName` | 流程推進時；最常用 |
| `edit.show` / `edit.submit` | `statusCond` | 編輯載入／儲存前 |
| `index.edit.show` / `index.edit.submit` | `statusCond` | 一覽表內編輯列載入／存檔前（v1.9.0；只有設成一覽表欄位的欄位才能被 index 編輯存檔，kintone 平台限制）；`writeOther` 只在 `index.edit.submit` 執行，`index.edit.show` 不執行；兩者皆不寫 Log App（無對應的 success 事件可掛） |
| `create.show` / `create.submit` | （無） | 新增時，記錄尚無狀態 |

### valueSource 一覽（writeSelf 的 `valueParam`／writeOther 的 mapping 共用）

| valueSource | valueParam | 說明 |
|---|---|---|
| `fixed` | 字串/數字 | 固定值 |
| `loginUser` | — | 登入者（寫 USER_SELECT） |
| `today` / `nowTime` / `now` | — | 今天(YYYY-MM-DD)／現在時刻(HH:mm)／現在日期時間(ISO) |
| `recordNumber` / `recordId` / `appId` / `uuid` / `timestamp` | — | 記錄編號／$id／App ID／UUID／Unix ms |
| `nextStatus` / `currentStatus` / `actionName` | — | 推進後狀態／推進前狀態／動作名稱（限 process.proceed） |
| `fieldCopy` | `"來源欄位代碼"` | 複製本記錄某欄位 |
| `formula` | `"{数量}*{単価}+10"` | 四則運算，欄位代碼用 `{}` 包；只允許數字/運算子（防注入） |
| `lookup` | `{ app, keyField, keyExpr, returnField, onMiss }` | 跨 App 查一個值；`keyExpr` 內 `{欄位代碼}` 會代換；`onMiss`:`empty`(預設)/`error` |
| `dateShift` | 見下 | 讀日期 ± 期間（v1.6.0） |
| `subtableLastRow` | `{ table, field, row?, map?, onMiss? }` | 子表某列欄位值；`row`:`last`(預設)/`first`/數字/`all` |
| `appendSubtable` | `{ subRules:[{targetField,valueSource,valueParam?}], historyMode? }` | 子表格新增一列（履歷） |
| `clear` | — | 清空欄位 |
| `readonly` | — | 唯讀鎖定（僅 `*.show` 時機）；`index.edit.show` 灰階不可編輯，其餘 `*.show` 直接隱藏欄位（v1.9.0） |

`dateShift` 的 `valueParam`：

```jsonc
{
  "base":   { "from": "target", "field": "申請日期" },  // from: this(本記錄)/target(目標App那筆,僅writeOther更新有效)/now/today
  "amount": 30,                                         // 數字(可負) 或 { "from":"this"|"target", "field":"天數欄位" }
  "unit":   "days",                                    // days/hours/minutes/months/years
  "output": "date"                                     // date(YYYY-MM-DD)/datetime(ISO)/time(HH:mm)；省略=沿用 base 型別
}
```

### conditions 的 `op`

`eq`(預設,完全相等)／`neq`／`startsWith`／`contains`／`inList`（`value` 用逗號分隔，任一命中）。多值欄位（複選/使用者/組織/群組）會展開每個元素（取 `code` 與 `name`）比對。

### 最小可匯入範例

```json
{
  "rules": [
    {
      "label": "核准→寫核准日期與核准者",
      "enabled": true,
      "trigger": "process.proceed",
      "fromStatus": "*",
      "toStatus": "核准完了,B課核准",
      "actionName": "*",
      "action": "writeSelf",
      "targetField": "核准日期",
      "valueSource": "today",
      "skipIfFilled": true
    },
    {
      "label": "出貨→更新客戶主檔最後出貨日(申請日期+30)",
      "enabled": true,
      "trigger": "process.proceed",
      "toStatus": "已出貨",
      "action": "writeOther",
      "writeMode": "update",
      "targetApp": "42",
      "keyMapping":  [ { "targetField": "客戶代號", "valueSource": "fieldCopy", "valueParam": "客戶代號" } ],
      "fieldMapping": [
        { "targetField": "最後出貨日", "valueSource": "today" },
        { "targetField": "保固到期日", "valueSource": "dateShift",
          "valueParam": { "base": { "from": "target", "field": "申請日期" }, "amount": 30, "unit": "days", "output": "date" } }
      ],
      "onError": "block"
    }
  ]
}
```

> 產生規則時要請對方提供：**目標欄位代碼、狀態名稱、目標 App ID**（這些外掛無法自己推斷）。完整語意以 [README.md 附錄 B-5～B-11](README.md) 為準。

---

## 註冊的事件（contents/dist/desktop.js 末尾）

`create.show`、`edit.show`、`index.edit.show`、`create.submit`、`edit.submit`、`index.edit.submit`、`detail.process.proceed`、`detail.show`，
另加 `create.submit.success`／`edit.submit.success`（給 Log 確認存檔成功；`index.edit.submit` 無對應 success 事件，不寫 Log，見 README B-2）。

---

## 設計文件

`docs/superpowers/specs/` 放設計（specs），`docs/superpowers/plans/` 放實作計畫。做較大改動前先看這裡是否已有對應設計。

---

## 與上層 kintone 專案的關係

本資料夾隸屬於上層 `kintone/` 專案，通用 kintone 開發規範（事件順序、命名慣例、REST API 範例、`const`/`let` 等）見上層 [../CLAUDE.md](../CLAUDE.md)。本檔僅補充此外掛特有的事項。
