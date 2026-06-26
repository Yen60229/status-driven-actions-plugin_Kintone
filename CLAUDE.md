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
| 值來源 | `valueSource` 一覽：`fixed`/`loginUser`/`today`/`fieldCopy`/`formula`/`lookup`/`subtableLastRow`/`appendSubtable`/`readonly`… | B-5、B-6 |
| 子表格履歷 | `appendSubtable` + `historyMode` | B-7 |
| 執行 Log | `loggedApply`、`flushSubmitLog`、`writeLog`/`postLog`、`_runInfo`/`_pendingSubmitLog`（方案 A，v1.5.0） | B-8、B-8a、B-8b |
| 錯誤分類 | `errorCodeOf`/`classifyError`/`friendlyError`/`recordError`（`session`/`permission`/`config`/`system`） | B-8a |
| 寫入判別 | `classifyWrite`（userObject / arrayField / scalar） | B-9 |
| 規則條件 | `rule.conditions` + `op`（eq/neq/startsWith/contains/inList）+ `conditionLogic` | B-10 |
| 跨 App 寫入 | `writeOther`（create/update/upsert + keyMapping/fieldMapping + onError） | B-11 |

**先讀附錄 B 再動程式碼**——它是這份 runtime 的權威說明。

---

## 註冊的事件（contents/dist/desktop.js 末尾）

`create.show`、`edit.show`、`create.submit`、`edit.submit`、`detail.process.proceed`、`detail.show`，
另加 `create.submit.success`／`edit.submit.success`（給 Log 確認存檔成功）。

---

## 設計文件

`docs/superpowers/specs/` 放設計（specs），`docs/superpowers/plans/` 放實作計畫。做較大改動前先看這裡是否已有對應設計。

---

## 與上層 kintone 專案的關係

本資料夾隸屬於上層 `kintone/` 專案，通用 kintone 開發規範（事件順序、命名慣例、REST API 範例、`const`/`let` 等）見上層 [../CLAUDE.md](../CLAUDE.md)。本檔僅補充此外掛特有的事項。
