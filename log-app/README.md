# Log App 快速開啟來源記錄（log_app_quick_open.js）

給 **執行 Log App**（本公司：[SYS-06-6_Plug-In(Log)](https://nipponexpress-taiwan.cybozu.com/k/708/)，App ID 708）用的自訂 JavaScript。
**不屬於外掛打包內容**（不在 `contents/` 內），要另外上傳到 Log App。

## 功能

| 畫面 | 功能 |
|---|---|
| 一覽表（index.show，清單檢視） | **每一筆** Log 的 `LOG_RECORD` 數字變成**深藍實心膠囊按鈕**（白字粗體＋外連圖示，同一行、不增加列高），點了會在新分頁直接打開來源記錄；不分成功／失敗／取消 |
| 一覽表 | 沒有記錄編號的列（多半是新增時就失敗的那幾筆）顯示灰色虛線框「App 一覽」，點了開來源 App 一覽 |
| 一覽表 | 一覽表沒放 `LOG_RECORD` 時，依序改掛在 `LOG_APP`／`LOG_EVENT`／`LOG_RESULT` 欄，在原值後面加藍框「開啟」按鈕、不蓋掉原值 |
| 一覽表 | `LOG_RESULT`＝「失敗」的記錄：`LOG_RESULT` 格子 `#FF9999` 黑字粗體，同列其他 Log 欄位（`LOG_EVENT`／`LOG_CATEGORY`／`LOG_APP`／`LOG_RECORD`／`LOG_USER`／`LOG_MESSAGE`）淺紅 `#FDECEA`。寫法比照 `人力需求表/hr_demand_style.js`：逐欄 `kintone.app.getFieldElements(欄位代碼)`，欄位沒放進一覽表（回傳 `null`）就略過 |
| 記錄詳細（detail.show，電腦版＋手機版） | 跟一覽表一樣，`LOG_RECORD` 欄位（`kintone.app.record.getFieldElement`／手機 `kintone.mobile.app.record.getFieldElement`）**整個欄位框變成連結**：淺藍底＋藍框，數字藍色粗體底線＋外連圖示，框內任何位置都可點（`<a>` 的 `::after` 撐滿欄位框），滑鼠移過去整框會變深；沒有記錄編號時為灰框「來源 App 一覽」 |
| 記錄詳細（備援） | `LOG_RECORD` 沒放進表單版面時，改在上方顯示「開啟來源記錄（App X ／ #Y）↗」與「來源 App 一覽 ↗」；沒有 App ID（Log 當初只寫進最小欄位）時顯示提示 |

## 部署

1. Log App（708）→ App 設定 →「JavaScript / CSS 自訂」。
2. **電腦版用 JavaScript** 與 **手機版用 JavaScript** 都上傳 `log_app_quick_open.js`（同一支檔案，手機版只會跑 detail 那段）。
3. 儲存 → 更新 App。
4. 在常用的一覽表把 `LOG_RECORD` 加進顯示欄位（沒加時上方會顯示提示）。

## 為什麼不會拖慢一覽表

| 項目 | 做法 |
|---|---|
| API 呼叫 | **0 次**。連結只用 `event.records` 已有的 `LOG_APP`／`LOG_RECORD` 組網址，不查來源 App、不查 Log App 設定 |
| 逐列 DOM 操作 | 先讀完（找儲存格、組連結）再一次寫入；不綁任何逐列事件（一般 `<a target="_blank">`） |
| 重複觸發 | 已加過連結的儲存格跳過；提示列每次整條換新，不疊加 |
| 非清單檢視（日曆／自訂檢視） | 不處理 |

## 限制

- 連結是 `/k/{App}/show#record={id}`（手機 `/k/m/{App}/show?record={id}`）。來源 App 若在**訪客空間**，網址需要 `/k/guest/{空間ID}/`，這支程式不會自動判斷，連結會打不開。
- 能不能看到來源記錄，仍由**點的人**在來源 App 的權限決定。
