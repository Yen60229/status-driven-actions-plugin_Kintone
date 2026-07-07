# 狀態驅動動作外掛 — 使用說明書

> 適用版本：v1.7.2　　最後更新：2026-06-26
>
> 💡 程式碼（`desktop.js` / `mobile.js` / `config.js`）已移除全部註解，所有技術說明集中在本文件「**附錄 B：技術說明（開發者參考）**」。

---

## 這個外掛是做什麼的？

當記錄的**流程狀態改變**（或儲存、開啟）時，自動幫你填寫指定欄位的值。

**舉例：**
- 按下「核准」按鈕 → 自動填入「核准日期 = 今天」、「核准者 = 登入者」
- 按下「完成」按鈕 → 自動在履歷子表格新增一筆記錄
- 按下「出貨」按鈕 → 自動更新另一個 App（客戶主檔）的「最近出貨日」

不需要請工程師，管理者自己就能設定。

---

## 目錄

1. [第一次安裝](#1-第一次安裝)
2. [進入設定畫面](#2-進入設定畫面)
3. [設定 API Token（進階）](#3-設定-api-token進階)
4. [新增規則](#4-新增規則)
5. [規則設定欄位說明](#5-規則設定欄位說明)
6. [實際設定範例](#6-實際設定範例)
7. [更新外掛版本](#7-更新外掛版本)
8. [常見問題](#8-常見問題)
9. [執行 Log（記錄每次執行結果）](#9-執行-log記錄每次執行結果)
- [附錄 A：欄位代碼在哪裡找](#附錄-a欄位代碼在哪裡找)
- [附錄 B：技術說明（開發者參考）](#附錄-b技術說明開發者參考)

---

## 1. 第一次安裝

### 步驟 1：上傳外掛

1. 點右上角齒輪圖示 →「**系統管理**」
2. 左側選單「外掛程式」→「**外掛程式管理**」
3. 點「**匯入**」按鈕
4. 選擇 `plugin.zip` 檔案 → 確認上傳

> ✅ 上傳成功後，外掛清單會出現「狀態驅動動作外掛」

---

### 步驟 2：將外掛加入 App

1. 進入你要使用的 **App**
2. 右上角齒輪 →「**App 設定**」
3. 上方分頁選「**外掛程式**」
4. 點「**外掛程式的使用**」
5. 勾選「狀態驅動動作外掛」→「**新增**」
6. 點右上角「**更新 App**」儲存

---

## 2. 進入設定畫面

1. App 設定 →「外掛程式」
2. 找到「狀態驅動動作外掛」，點右側的 **齒輪（設定）** 圖示
3. 進入外掛設定頁面

---

## 3. 設定 API Token（進階）

> 如果你只需要寫入**同一個 App 的欄位**，而且流程的下一個狀態使用者還有編輯權限，可以**跳過這個步驟**。
>
> 如果會遇到「人員在 A 狀態核准後，跳到 B 狀態，B 狀態該人員沒有編輯權限」的情況，**必須設定本 App Token**，否則履歷可能漏記。

### 取得 API Token 的方法

1. 在 App 設定頁，上方分頁選「**API Token**」
2. 點「**新增**」
3. 勾選「**記錄追加**」與「**記錄編輯**」兩個權限
4. 複製產生的 Token 字串（長得像 `ABCdef123456...`）
5. 點「**儲存**」→「**更新 App**」

### 填入設定畫面

- 在外掛設定頁最上方的「**本 App Token**」欄位貼上剛才複製的 Token

---

### 設定「寫入其他 App」的 Token（選填）

如果規則需要寫入**別的 App**，要在「**跨 App Token 對應表**」新增一列：

| 欄位 | 說明 | 範例 |
|---|---|---|
| App ID | 目標 App 的 ID（從網址列看，`/k/` 後面的數字） | `123` |
| 顯示名稱 | 方便自己辨識，隨便填 | `客戶主檔` |
| API Token | 目標 App 產生的 Token | `ABCdef...` |

點「**＋ 新增 Token**」可以加多個 App。

---

## 4. 新增規則

設定頁下方「**規則列表**」區塊，點「**＋ 新增規則**」。

每條規則就是一句話：
> 「**什麼時候**，**在什麼狀態下**，**把哪個欄位**，**填成什麼值**」

可以新增任意多條規則。規則**由上往下**依序執行。

---

## 5. 規則設定欄位說明

### ① 啟用（勾選框）

- ☑ 勾選 = 這條規則生效
- ☐ 取消勾選 = 暫時停用（不刪除，方便測試）

---

### ② 觸發時機

什麼操作會觸發這條規則：

| 選項 | 什麼時候執行 |
|---|---|
| 新增畫面載入時 | 使用者開啟「新增記錄」頁面的瞬間 |
| 編輯畫面載入時 | 使用者開啟「編輯」頁面的瞬間 |
| 新增儲存前 | 使用者按「儲存」，記錄真正存入前 |
| 編輯儲存前 | 使用者按「儲存」，記錄真正存入前 |
| **流程推進時** | 使用者按流程動作按鈕（如「核准」「完成」）時 ← 最常用 |

---

### ③ 狀態條件

依照觸發時機不同，這個欄位會有不同的設定方式：

#### 「流程推進時」→ 設定「從哪個狀態 → 到哪個狀態」

| 欄位 | 說明 | 範例 |
|---|---|---|
| 從狀態 | 按按鈕前的狀態，`*` 代表任意 | `申請中` |
| 到狀態 | 按按鈕後的狀態，`*` 代表任意 | `核准完了` |
| 動作名稱 | 按的那顆按鈕的名稱，`*` 代表任意 | `核准` |

> 💡 三個都填 `*` = 每次推進流程都觸發
>
> 💡 **一個欄位可填多個值（v1.7.2）**：用逗號分隔，命中**任一個**就算成立。例如「到狀態」填 `核准完了,B課核准` = 推進到這兩個狀態其中之一都會觸發同一條規則，不必再複製成兩條。半形 `,`、全形 `，`、分號都可當分隔。

#### 「編輯畫面載入時」「編輯儲存前」→ 設定「當狀態 =」

填當前記錄的狀態名稱。填 `*` 代表不管什麼狀態都觸發。**也可逗號分隔多個狀態**（任一成立即觸發，v1.7.2）。

#### 「新增畫面載入時」「新增儲存前」→ 無狀態條件（新記錄還沒有狀態）

---

### ③-2 欄位條件（v1.1.0 新增）

> 狀態條件只能用「流程狀態」過濾規則。如果你想要**依某個欄位的值**決定規則跑不跑（例如「只有當『申請類別 = 恢復』才寫入」），就用這裡的「欄位條件」。

在規則卡片的「**欄位條件 (全部成立才執行)**」區塊，點「**＋ 新增條件**」可以加一條或多條：

| 設定 | 說明 |
|---|---|
| 欄位 | 要比對的欄位（下拉選單，列出本 App 所有欄位） |
| 運算子 | 等於 / 不等於 / 開頭為 / 包含 |
| 比對值 | 要比對的文字 |

**多條條件 = 全部成立（AND）才會執行**。留空（沒有任何條件）= 不限制，跟原本一樣。

| 運算子 | 意思 | 範例 |
|---|---|---|
| 等於 (=) | 欄位值完全相同 | 申請類別 **等於** `恢復` |
| 不等於 (≠) | 欄位值不同 | 狀態 **不等於** `作廢` |
| 開頭為 | 欄位值的開頭符合 | 申請類別 **開頭為** `停用`（可match「停用（交易中止）」）|
| 包含 | 欄位值裡含有這段文字 | 備註 **包含** `急件` |
| 屬於清單（任一） | 欄位值是清單裡的**任何一個**就成立（**用逗號分隔**） | 申請類別 **屬於清單** `變更,恢復,年度定期更新` |

> 💡 適用所有觸發時機（流程推進、儲存前、載入時都可用），電腦版與手機版行為一致。
>
> 🔸 **多個值要「任一成立」就用「屬於清單」**，不要用「包含」。「包含」是看欄位值裡有沒有你打的那一整串字，無法一次比對多個值。
>
> 🔸 **各種欄位類型都支援**：單選、下拉、文字、數字直接比對值；**複選 / 多選 / 使用者 / 組織 / 群組**等多值欄位，只要其中一個選項符合即成立（使用者類欄位可用代碼或顯示名稱比對）。

---

### ④ 動作

| 選項 | 說明 |
|---|---|
| **寫入本記錄欄位** | 把值填進這筆記錄的某個欄位 ← 最常用 |
| **寫入其他 App 記錄** | 把值寫進另一個 App 的記錄 |

---

### ⑤ 目標欄位（寫入本記錄時）

從下拉選單選擇要填值的欄位。下拉選單會自動列出這個 App 的所有欄位。

---

### ⑥ 值的來源

要填入什麼值：

| 選項 | 填入的值 | 適合欄位類型 |
|---|---|---|
| **固定值** | 你自己輸入的文字或數字 | 全部 |
| **登入者** | 目前操作的使用者 | 使用者選擇 |
| **今天** | 今天的日期（YYYY-MM-DD） | 日期 |
| **現在時刻** | 現在的時間（HH:mm） | 時間 |
| **現在日期時間** | 現在的完整日期時間 | 日期時間 |
| **記錄編號** | 這筆記錄的編號 | 文字、數字 |
| **下一狀態** | 推進後會變成的狀態名稱 | 文字、下拉 |
| **當前狀態** | 推進前的狀態名稱 | 文字、下拉 |
| **流程動作名稱** | 按下的那顆按鈕名稱（如「核准」） | 文字 |
| **從本記錄欄位複製** | 把另一個欄位的值複製過來 | 同型別欄位 |
| **簡易計算式** | 用欄位做四則運算 | 數字 |
| **日期加減期間** | 讀一個日期，加/減 N 天・時・分・月・年，算出新日期 | 日期、日期時間、時間 |
| **清空** | 把欄位清成空白 | 全部 |
| **唯讀鎖定** | 隱藏欄位讓使用者無法編輯 | 全部（限「載入時」觸發） |
| **Append 子表一筆** | 在子表格新增一列履歷記錄 | 子表格 |

---

### ⑦ 值的參數（部分選項才需要填）

| 值的來源 | 要填什麼 | 範例 |
|---|---|---|
| 固定值 | 要填入的文字或數字 | `已完成` |
| 從本記錄欄位複製 | 來源欄位的**欄位代碼** | `客戶代號` |
| 簡易計算式 | 計算公式，欄位代碼用 `{}` 包起來 | `{数量}*{単価}` |
| 日期加減期間 | JSON 格式（見第 6 節範例 E） | — |
| Append 子表一筆 | JSON 格式（見第 6 節範例） | — |

> **欄位代碼在哪裡找？**
> App 設定 →「表單」→ 點欄位 → 右側「欄位代碼」

---

### ⑧ 僅在目標欄位空白時才寫入（勾選框）

- ☑ 勾選 = 欄位已有值時**不覆蓋**（例如：核准日期只記錄第一次核准）
- ☐ 不勾選 = 每次都覆蓋成新值

---

### ⑨ 寫入其他 App 時的設定

| 欄位 | 說明 |
|---|---|
| 寫入模式 | 新增 / 更新（依 key 找）/ Upsert（有就更新，沒有就新增） |
| 目標 App ID | 目標 App 的數字 ID |
| Key 對應 | 用哪個欄位去目標 App 找到正確那筆（JSON 格式） |
| 欄位對應 | 要寫哪些欄位、寫什麼值（JSON 格式） |
| 失敗處理 | 寫入失敗時要擋下儲存 / 只記錄錯誤 / 忽略 |

> JSON 格式的詳細說明請參考「寫入其他App教學.md」（或請工程師協助設定）

---

## 6. 實際設定範例

### 範例 A：核准時自動填寫核准日期與核准者

| 設定項目 | 填入值 |
|---|---|
| 啟用 | ☑ |
| 觸發時機 | 流程推進時 |
| 從狀態 | `*`（任意） |
| 到狀態 | `核准完了` |
| 動作 | 寫入本記錄欄位 |
| 目標欄位 | 核准日期 |
| 值的來源 | 今天 |
| 僅空白時寫入 | ☑（只記錄第一次） |

同樣再加一條規則：

| 設定項目 | 填入值 |
|---|---|
| 目標欄位 | 核准者 |
| 值的來源 | 登入者 |

---

### 範例 B：每次推進流程，自動在履歷子表格新增一列

| 設定項目 | 填入值 |
|---|---|
| 觸發時機 | 流程推進時 |
| 從狀態 | `*` |
| 到狀態 | `*` |
| 動作名稱 | `*` |
| 動作 | 寫入本記錄欄位 |
| 目標欄位 | 流程履歷（子表格欄位） |
| 值的來源 | Append 子表一筆 |
| 值的參數 | （填入以下 JSON） |

```json
{
  "subRules": [
    { "targetField": "建立者",     "valueSource": "loginUser" },
    { "targetField": "建立時間",   "valueSource": "now" },
    { "targetField": "動作名稱",   "valueSource": "actionName" },
    { "targetField": "變更前狀態", "valueSource": "currentStatus" },
    { "targetField": "變更後狀態", "valueSource": "nextStatus" }
  ]
}
```

> ⚠️ `targetField` 填的是子表格**內部欄位**的欄位代碼，不是子表格本身的代碼。

---

### 範例 C：出貨時，將出貨日期更新到客戶主檔 App

| 設定項目 | 填入值 |
|---|---|
| 觸發時機 | 流程推進時 |
| 到狀態 | `已出貨` |
| 動作 | 寫入其他 App 記錄 |
| 寫入模式 | 更新（依 key 找） |
| 目標 App ID | `42`（客戶主檔的 App ID） |
| Key 對應 | `[{"targetField":"客戶代號","valueSource":"fieldCopy","valueParam":"客戶代號"}]` |
| 欄位對應 | `[{"targetField":"最後出貨日","valueSource":"today"}]` |

---

### 範例 D：依「申請類別」寫入不同狀態到主檔 App（用欄位條件）

同一條流程，依申請單上「申請類別」欄位的值，寫入不同的狀態到另一個 App。
需要兩條規則，差別只在「欄位條件」和「欄位對應」。

**規則 D-1：申請類別 = 恢復 → 主檔狀態設為「使用中」**

| 設定項目 | 填入值 |
|---|---|
| 觸發時機 | 流程推進時 |
| 從狀態 / 到狀態 / 動作名稱 | `*` / `流程結束` / `*` |
| **欄位條件** | `申請類別` **等於** `恢復` |
| 動作 | 寫入其他 App 記錄 |
| 寫入模式 | 更新（依 key 找） |
| 目標 App ID | `497` |
| Key 對應 | `[{"targetField":"統一編號","valueSource":"fieldCopy","valueParam":"統一編號"}]` |
| 欄位對應 | `[{"targetField":"供應商狀態","valueSource":"fixed","valueParam":"使用中"}]` |

**規則 D-2：申請類別 開頭為 停用 → 主檔狀態設為「停用」**

| 設定項目 | 填入值 |
|---|---|
| **欄位條件** | `申請類別` **開頭為** `停用` |
| 欄位對應 | `[{"targetField":"供應商狀態","valueSource":"fixed","valueParam":"停用"}]` |

> 其餘設定與 D-1 相同。把這類「依值分流」的規則**放在資料寫入規則的後面**，確保目標 App 的記錄已先被建立，更新才找得到。

---

### 範例 E：讀取目標 App 的日期，加一段期間後寫回目標 App（v1.6.0）

情境：流程推進時，到客戶主檔 App 找到對應記錄，讀它現有的「申請日期」，**加 30 天**算出「到期日」，再寫回客戶主檔的同一筆記錄。

| 設定項目 | 填入值 |
|---|---|
| 觸發時機 | 流程推進時 |
| 到狀態 | `受理完了` |
| 動作 | 寫入其他 App 記錄 |
| 寫入模式 | 更新（依 key 找） |
| 目標 App ID | `42`（客戶主檔） |
| Key 對應 | `[{"targetField":"客戶代號","valueSource":"fieldCopy","valueParam":"客戶代號"}]` |
| 欄位對應 | （填入以下 JSON） |

```json
[
  {
    "targetField": "到期日",
    "valueSource": "dateShift",
    "valueParam": {
      "base":   { "from": "target", "field": "申請日期" },
      "amount": 30,
      "unit":   "days",
      "output": "date"
    }
  }
]
```

**`valueParam` 各欄位說明：**

| 欄位 | 說明 |
|---|---|
| `base.from` | 基準日期從哪讀：`target`＝目標 App 找到的那筆記錄、`this`＝本記錄、`now`／`today`＝執行當下（`now`/`today` 免填 `field`） |
| `base.field` | 基準日期的欄位代碼（日期 / 日期時間 / 時間欄位） |
| `amount` | 要加減的量。**數字可正可負**（負數＝往前推）；也可填 `{ "from": "this"\|"target", "field": "天數欄位" }` 從某個數字欄位讀 |
| `unit` | 期間單位：`days`／`hours`／`minutes`／`months`／`years` |
| `output` | 輸出格式：`date`（YYYY-MM-DD）／`datetime`（日期時間）／`time`（HH:mm）。省略＝沿用基準日期的型別 |

> 💡 **要從目標 App 讀**（`base.from: "target"`）只在「**寫入其他 App** + 更新／Upsert 且有找到記錄」時有效——外掛會先抓到那筆記錄，才有它的欄位值可算。Upsert 找不到而改新增時，沒有現成記錄可讀，`target` 會得到空值。
>
> 💡 也可用在「**寫入本記錄欄位**」：把 `base.from` 設成 `this` 或 `now`，例如本記錄「申請日期 + 14 天 → 回覆期限」。

---

## 7. 更新外掛版本

> 工程師修改程式後會提供新的 `plugin.zip`。請按以下步驟更新。

**重要：更新不會影響已設定的規則，設定會自動保留。**

### 步驟 1：上傳新版本

1. 系統管理 →「外掛程式管理」
2. 找到「狀態驅動動作外掛」，點右側「**更新**」按鈕
3. 選擇新的 `plugin.zip` → 確認上傳

### 步驟 2：更新各 App

每個有使用此外掛的 App，都需要執行一次「**更新 App**」：

1. 進入 App → App 設定 →「外掛程式」
2. 確認外掛版本號已更新（顯示新版本號）
3. 點右上角「**更新 App**」

> ✅ 更新 App 後，新版本的功能立即生效。

---

## 7-2. 複製設定到其他 App（匯出 / 匯入，v1.7.0）

> 想把 A App 設好的規則搬到 B App，不用一條一條重打。

設定頁最下方工具列有「**匯出設定**」「**匯入設定**」兩顆按鈕。

### 匯出（在來源 App）

1. 進入來源 App 的外掛設定頁
2. 點「**匯出設定**」→ 整包設定會**自動複製到剪貼簿**，同時跳出視窗顯示 JSON
3. （若瀏覽器擋了自動複製，就在視窗裡全選那段 JSON 手動複製）

### 匯入（在目標 App）

1. 進入目標 App 的外掛設定頁
2. 點「**匯入設定**」→ 把剛才複製的 JSON 貼進視窗 → 按「**套用規則**」
3. 確認提示 → 規則會**取代**目標 App 目前的規則
4. **檢查無誤後按「儲存」→「更新 App」** 才會生效

### ⚠️ 匯入只會帶「規則」，這兩件事要自己確認

| 項目 | 為什麼 | 要做什麼 |
|---|---|---|
| **API Token** | Token 綁在各自的 App，不能跨 App 共用 | 匯入**不會**動目標 App 的 Token／Log 設定；請依第 3、9 節在目標 App 自行填 |
| **欄位代碼** | 規則寫的是欄位代碼，目標 App 必須有同名欄位 | 確認規則用到的欄位代碼在目標 App 都存在（附錄 A） |

> 💡 之所以「只帶規則、不帶 Token」，就是為了避免把來源 App 的 Token／目標 App ID 誤套到別的 App 造成寫錯地方。Token 類設定一律在各 App 自己填一次最安全。

---

## 8. 常見問題

### ❓ 設定好後，欄位沒有自動填寫？

請依序確認：

1. **規則是否啟用？** — 確認規則左側勾選框是 ☑
2. **觸發時機是否正確？** — 例如「流程推進時」就要按流程按鈕，一般儲存不會觸發
3. **狀態條件是否符合？** — 檢查「到狀態」填的名稱與 kintone 流程設定的狀態名稱**完全相同**（注意全形半形、空格）
4. **目標欄位代碼是否正確？** — 到 App 設定 → 表單 → 點欄位確認欄位代碼
5. **儲存設定了嗎？** — 設定完記得按「**儲存**」按鈕，再「**更新 App**」

---

### ❓ 子表格履歷沒有新增，或只更新了第一列？

- 確認「目標欄位」選的是**子表格本身**的欄位代碼
- 確認 `subRules` 裡的 `targetField` 是**子表格內的子欄位**代碼，不是子表格代碼
- 「新增記錄」第一次推進流程時，會更新預設的第一列；之後每次都會新增新列，這是正常行為

---

### ❓ 顯示「補償寫入失敗」的警告？

這表示：
- 流程推進成功，但因為下一個狀態的權限設定，外掛無法自動補寫欄位
- **解決方法：** 到外掛設定頁，在「本 App Token」欄位填入 API Token（請參考第 3 節）

---

### ❓ 寫入其他 App 失敗？

1. 確認「跨 App Token 對應表」的 App ID 和 Token 是否正確
2. 確認 Token 有「記錄追加」和「記錄編輯」的權限
3. 確認「Key 對應」的欄位代碼是**目標 App** 的欄位代碼
4. 將「失敗處理」暫時改成「只記錄錯誤」，然後開啟瀏覽器開發者工具（F12）→「Console」查看錯誤訊息

---

### ❓ 設了「欄位條件」卻沒生效（規則沒跑 / 不該跑卻跑了）？

1. **欄位代碼對不對** — 條件的「欄位」要選對，下拉會顯示 `名稱 (代碼) [類型]`
2. **比對值要完全相同** — 「等於」會比對到一模一樣（注意全形半形、前後空格）。值有變化形（如「停用（交易中止）」）時改用「**開頭為**」
3. **多條條件是 AND** — 全部成立才執行；只要一條不符合整條規則就跳過
4. **下拉/核取方塊欄位** — 目前是用文字比對單一值，多選欄位請改用「包含」
5. 若有設定「執行 Log」（見第 9 節），可到 Log App 查 `LOG_RESULT`／`LOG_MESSAGE` 確認該次推進是否命中規則。發生錯誤時 `console.error`／`console.warn` 仍會印在 F12 Console（v1.3.0 已移除大量除錯用 `console.log`，畫面更乾淨）

---

### ❓ 如何暫時停用某條規則，不要刪掉它？

取消規則左側的「啟用」勾選框，再按「儲存」→「更新 App」即可。規則保留但不執行。

---

## 9. 執行 Log（記錄每次執行結果）

> v1.3.0 新增。**選填功能**——不設定就完全不啟用，沒有任何額外負擔。

設定後，每次「**儲存 / 流程推進**」且**有命中規則**時，外掛會自動往你指定的一個「Log App」新增一筆記錄，讓你第一時間知道每次事件是 **成功** 還是 **失敗**、屬於哪一類錯誤、以及相關訊息。

### 步驟 1：建立一個「Log App」

新增一個 kintone App（例如叫「外掛執行紀錄」），並建立以下 **7 個欄位**，欄位代碼必須**完全一致**：

| 欄位代碼 (Field Code) | 欄位類型 | 內容 |
|---|---|---|
| `LOG_EVENT` | 單行文字 | 觸發的事件（如 `process.proceed`） |
| `LOG_RESULT` | 單行文字 | `成功` 或 `失敗` |
| `LOG_CATEGORY` | 單行文字 | 分類：`success`／`session`／`permission`／`config`／`system` |
| `LOG_APP` | **數值** | 來源 App 的 ID |
| `LOG_RECORD` | **數值** | 來源記錄的編號 |
| `LOG_USER` | **使用者選擇** | 觸發事件的操作者 |
| `LOG_MESSAGE` | 多行文字 | 成功：命中了哪些規則；失敗：`[錯誤碼] 規則「名稱」: 原始訊息` |

> 💡 `LOG_CATEGORY` 讓你能快速篩選：`config`／`system` 是**需要處理的**（外掛設定錯誤或系統故障）；`permission`／`session` 多半是**使用者操作問題**，可忽略。

### 錯誤分類對照（`LOG_CATEGORY`）

| 分類 | 意思 | 常見錯誤碼 | 該怎麼辦 |
|---|---|---|---|
| `success` | 成功 | — | 無 |
| `session` | 登入逾時 | `CB_AU01` | 請使用者重新登入；畫面已顯示友善訊息 |
| `permission` | 無權限 | `GAIA_NO01`、`CB_NO01`、`GAIA_DA02` | 檢查使用者權限或改用 API Token |
| `config` | 外掛設定錯誤 | `GAIA_FE01`（欄位不存在）、`GAIA_AP01`（App 不存在）、`CB_IL02`（Token 無效） | **回外掛設定修正規則** |
| `system` | 系統／網路錯誤 | 無錯誤碼、`Failed to fetch`、5xx | 多為暫時性，重試；持續發生請找工程師 |

### 步驟 2：（建議）建立 Log App 的 API Token

1. Log App → App 設定 →「API Token」→「新增」
2. 勾選「**記錄追加**」權限 → 儲存 → 更新 App
3. 複製 Token 字串

> **為什麼建議用 Token？** 你通常會把 Log App 鎖起來，不讓一般使用者新增記錄。若不給 Token，沒有權限的使用者一觸發就會寫 log 失敗——而失敗的人往往正是你最想記錄的對象。Token 綁在 Log App 上、只給「新增記錄」權限，外掛改用它寫 log，就能**不管操作者本身有沒有權限都成功寫入**，使用者也看不到、改不到這個 Log App。

### 步驟 3：在外掛設定畫面填入

外掛設定頁最下方「**3. 執行 Log（選填）**」：

| 欄位 | 說明 |
|---|---|
| Log App ID | 步驟 1 建立的 Log App 的數字 ID（留空＝不啟用） |
| Log API Token | 步驟 2 複製的 Token（選填；留空＝用操作者本人身分寫入） |

填好按「**儲存**」→ 回到 App「**更新 App**」即生效。

> 🔸 只有 `create.submit`／`edit.submit`／`process.proceed` 且**至少命中一條規則**（或外掛本身發生例外）時才會寫 log，避免每次空白送出都產生噪音記錄。
> 🔸 寫 log 失敗**絕不會**阻擋使用者存檔。若整筆寫入失敗（通常是欄位代碼/類型設錯），外掛會**自動用最小欄位（`LOG_EVENT`／`LOG_RESULT`／`LOG_MESSAGE`）重試一次**，確保核心訊息至少能落地；兩次都失敗才放棄，並在 F12 Console 留下 `console.error` 說明可能原因。

---

## 附錄 A：欄位代碼在哪裡找

1. App 設定（右上角齒輪）
2. 上方分頁「**表單**」
3. 點你要查的欄位
4. 右側面板會顯示「**欄位代碼**」

> 注意：欄位「名稱」（顯示給使用者看的）和「欄位代碼」不一定相同。設定外掛時要填**欄位代碼**。

---

## 附錄 B：技術說明（開發者參考）

> 本節是原本寫在程式碼裡的註解整理。程式碼本身（`desktop.js` / `mobile.js` / `config.js`）已移除全部註解，維護時請參考本節。

### B-1. 檔案結構與平台

- `contents/dist/desktop.js`、`contents/dist/mobile.js`：**內容完全相同**（同一份 runtime）。維護時只改 `desktop.js`，再覆蓋到 `mobile.js`。
- 單一檔案同時註冊電腦版與手機版事件名稱（`app.record.*` 與 `mobile.app.record.*`）；kintone 會自動忽略與當前平台不符的事件名稱。
- `contents/dist/config.js`：設定畫面（純 JS 動態渲染到 `#ui-section`）。
- 設定值透過 `kintone.plugin.app.getConfig/setConfig` 以單一 JSON 字串（`data`）存取。

### B-2. 註冊的事件（被動觸發，無背景常駐）

只註冊 6 個「使用者操作」事件：`create.show`、`edit.show`、`create.submit`、`edit.submit`、`detail.process.proceed`、`detail.show`。

- **無** `setInterval`／輪詢／常駐迴圈；唯一的 `setTimeout` 是 `setFieldShown` 的下一個 tick（0ms）。
- 每次觸發先做快速退出：無規則就立刻 return；需要時間才打 API。對低階電腦無負擔。

### B-3. `process.proceed` 寫入流程（核心）

1. 先把規則套用到 `event.record`（記憶體內）。
2. `checkEditPermission()` 呼叫 `/k/v1/records/acl/evaluate.json` 判斷使用者在**新狀態**下是否仍可編輯：
   - **可編輯** → `return event`（與狀態轉換一起原子儲存）。
   - **不可編輯 + 有設定本 App Token（selfAppToken）** → 存 `pendingWrite`、`return undefined`；待下一個 `detail.show` 觸發時，用 Token 走 REST `PUT` 補償寫入（compensation write）。
   - **不可編輯 + 無 Token** → 仍 `return event`（狀態會轉換，但受欄位權限限制的欄位寫入可能被 kintone 拒絕）。
3. 補償寫入若失敗，以非阻擋方式提示（`Swal` 或 console），記錄狀態仍正確、只是履歷可能漏一列。

### B-4. Token 機制

- `CONFIG.tokens`：跨 App Token 對應表，轉成 `TOKENS`（key = appId 字串）。
- `CONFIG.selfAppToken`：本 App Token，補償寫入用。
- `CONFIG.logAppId` / `CONFIG.logToken`：執行 Log 用（見 B-8）；若兩者都有，啟動時把 logToken 併入 `TOKENS[logAppId]`。
- `apiWithToken(path, method, body, appIdForToken)`：有對應 Token 時用 `fetch` + `X-Cybozu-API-Token` header；否則退回 `kintone.api`（plugin proxy，走使用者 session）。

### B-5. 時間來源

`now`/`today`/`nowTime` 直接取自瀏覽器本機時鐘（`new Date()`），不發任何網路請求。早期版本曾以對 `location.href` 發 `HEAD` 取伺服器 `Date` header 來避開使用者端時鐘誤差，v1.5.0 起移除，換取簽核/存檔當下少一趟網路往返。

### B-6. `valueSource` 一覽與參數格式

純量類：`fixed`、`loginUser`、`today`、`nowTime`、`now`、`recordNumber`/`recordId`、`appId`、`uuid`、`timestamp`、`clear`、`nextStatus`、`currentStatus`、`actionName`、`fieldCopy`（valueParam＝來源欄位代碼）。

需要 JSON / 特殊參數：

- **`formula`**：如 `{数量}*{単価}+10`，欄位代碼用 `{}` 包；陣列欄位代換成長度。安全防護：代換後只允許 `數字 + - * / ( ) . 空白 " \ , 字母底線`，否則丟錯（防注入）。
- **`lookup`**：`{ app, keyField, keyExpr, returnField, onMiss: 'empty'|'error' }`。`keyExpr` 內 `{欄位代碼}` 會被代換。走 `kintone.api`（使用者 session 權限）。
- **`dateShift`**（v1.6.0，日期加減期間）：`{ base, amount, unit, output }`。
  - `base`：`{ from: 'this'|'target'|'now'|'today', field? }`。`from='target'` 讀 `ctx.targetRecord`（僅 `writeOther` 更新／Upsert 命中時存在，見 B-11）；`from='this'` 讀本記錄；`now`/`today` 取本機時鐘。
  - `amount`：數字（可負）；或 `{ from: 'this'|'target', field }` 從欄位讀數字。
  - `unit`：`days`／`hours`／`minutes`／`months`／`years`（`months`/`years` 用 `setMonth`/`setFullYear`，月底進位採 JS 原生行為，如 1/31 + 1 月 = 3/3）。
  - `output`：`date`(YYYY-MM-DD)／`datetime`(`toISOString()` 給 DATETIME 欄)／`time`(HH:mm)；省略＝沿用基準日期型別。
  - 解析：`parseBaseDate` 依字串形狀判別 DATE／TIME／DATETIME；無法解析（空值/壞值）回 `''`。`now` 取 UTC ISO、`today` 取本機日期；`date`/`time` 輸出用本機時區（`toISODate`/`toHHmm`），故 DATETIME→date 會以本機日界裁切。
- **`subtableLastRow`**：`{ table, field, row?, map?, onMiss? }`
  - `row`：省略/`'last'`＝最後一列；`'first'`＝第一列；數字 N＝第 N 列（0 起算，負數從尾端）；`'all'`＝掃整欄、收集所有非空去重值（回傳陣列，適合一次勾多個 CHECK_BOX）。
  - `map`：`{ "來源值": "目標選項名" }` 對照轉換；`onMiss`：`'raw'`（預設，用原值）/`'empty'`（略過）/其它字串（當固定替代值）。
- **`appendSubtable`**：`{ subRules: [...], historyMode?: true }`，在子表格新增一列。`subRules` 每筆 `{ targetField, valueSource, valueParam? }`。
- **`elapsedMinutes`**（僅用於 `appendSubtable` 的 subRules 內）：`{ sinceField: '執行日時' }`，回傳距上一列該時間欄位的分鐘數；第一列回 0。
- **`readonly`**：隱藏欄位（僅 `*.show` 時機有意義）。

### B-7. 子表格「履歷模式」（historyMode）

`appendSubtable` 且 `valueParam.historyMode === true` 時：

- `create.show`：清空所有列 + 隱藏（保留一列空白範本列；**範本列必須保留各 cell 的 `type` 中繼資料**，否則存檔會報「.type 錯誤」）。
- `edit.show`：隱藏（防止使用者手動竄改履歷）。
- `detail.show`：維持顯示。
- 第一次 proceed 會覆寫範本列（偵測 `nextStatus` 子規則對應欄位是否為空判斷），之後每次 proceed 改用 push 新增。

### B-8. 執行 Log（v1.3.0）

- 設定 `LOG_APP`（appId）後啟用；`loggedApply()` 包住 `create.submit`/`edit.submit`/`process.proceed`，另註冊 `create.submit.success`/`edit.submit.success`。
- 每次事件開始重置 `_runInfo`；`applyRules` 內記下命中規則數與標籤。寫 log 的時機（方案 A，v1.5.0）：
  - **失敗**（命中數 > 0 或發生例外，且 `event.error` 有值）→ 在 `loggedApply` 即時寫一筆失敗。
  - **簽核成功**（`process.proceed` 命中且無錯）→ 在 `loggedApply` 樂觀寫一筆成功；kintone 無 `process.proceed.success` 事件可掛。
  - **存檔成功**（`create.submit`/`edit.submit` 命中且無錯）→ 暫存於 `_pendingSubmitLog`，待官方 `*.submit.success` 觸發時由 `flushSubmitLog()` 確認存檔成功後才寫。
  - 早期（v1.4.0–v1.4.3）以全域 `fetch`/`XHR` 攔截器記錄原生動作成敗，v1.5.0 起移除，改為上述事件層做法，不再污染全域。
- 寫入欄位：`LOG_APP`／`LOG_RECORD` 寫數字字串（數值欄位）；`LOG_USER` 寫 `[{ code }]`（USER_SELECT 需陣列）；其餘為文字。
- 用 `LOG_TOKEN`（若有）寫入 → 無 Log App 權限的操作者也能成功。寫 log 失敗只 `console.error`，**絕不阻擋存檔**。
- Log App 需要的欄位代碼與型別見第 9 節表格。

### B-8a. 錯誤分類與友善訊息

- `errorCodeOf(err)`：同時支援兩種錯誤來源——`kintone.api`（proxy）的 `err.code`，以及 `apiWithToken`（fetch）的 `err.message` 內嵌 JSON／文字（用 regex 抓 `CB_*`／`GAIA_*`）。
- `classifyError(err)` → `session`／`permission`／`config`／`system`（碼表見 `PERMISSION_CODES`／`CONFIG_CODES`）。
- `friendlyError(err, prefix)`：`session`／`permission` 回傳固定友善訊息；`config`／`system` 回傳 `prefix: 原始訊息`（prefix 為規則名）。
- `recordError(event, err, ruleLabel)`：集中處理——友善訊息寫 `event.error`（畫面用）；技術細節 `{ category, code, rule, rawMessage }` 存進 `_runInfo.error`（Log 用）。
- 寫 Log 時：成功 → `LOG_CATEGORY=success`、訊息為命中規則清單；失敗 → 用 `_runInfo.error` 組 `[code] 規則「名稱」: rawMessage`。

### B-8b. 寫 Log 的兩層保底

`writeLog` 先寫完整 7 欄位；若失敗（最常見為欄位代碼/類型設錯），自動改用**最小欄位**（`LOG_EVENT`／`LOG_RESULT`／`LOG_MESSAGE`，皆純文字，並把分類併入訊息）重試一次，避開脆弱的數值（`LOG_APP`/`LOG_RECORD`）與 `USER_SELECT`（`LOG_USER`）欄位；兩次都失敗才放棄。`postLog()` 為純送出函式。

### B-9. 欄位值寫入判別（classifyWrite）

依目標欄位現況與來源值分三類：`userObject`（loginUser 物件 → USER_SELECT 陣列）、`arrayField`（CHECK_BOX/MULTI_SELECT/USER_SELECT 等陣列欄位，字串會用 `,;換行` 拆分；`appendMode` 可保留原值去重合併）、`scalar`（一般純量欄位）。

### B-10. 規則比對（conditions）

`rule.conditions = [{ field, value, op }]`，`op`：`eq`(預設)/`neq`/`startsWith`/`contains`/`inList`；`rule.conditionLogic`：`AND`(預設)/`OR`。多值欄位（複選/使用者/組織/群組）會把每個元素（物件取 `code` 與 `name`）展開成候選清單比對。

### B-10a. 狀態條件支援多值（v1.7.2）

`statusMatches` 的 `fromStatus`／`toStatus`／`actionName`（process.proceed）與 `statusCond`（edit.* 觸發）皆改用 `statusMatchesList(spec, actual)` 比對：以 `[,，;；\n]` 切分成清單，`actual` 命中**任一**即成立；空字串或含 `*` 視為任意。單一值的舊設定行為不變（向下相容）。比對為純記憶體字串運算、每次事件僅跑一次（O(N·k)，k＝清單長度，實務微秒級），不增任何 API 呼叫。`fromStatus` 在 `cur===''`（event.record 取不到 `$status`）時仍維持「略過 from 檢查並 `console.warn`」的既有語意。

### B-11. 寫入其他 App（writeOther）

`writeMode`：`create`/`update`/`upsert`。`update`/`upsert` 需 `keyMapping`（組 query 找 `$id`）；`fieldMapping` 為要寫入的欄位（由 `buildOtherPayload` 逐筆 `resolveValue` 組成）。`onError`：`block`（預設，擋下提交）/`log`/`ignore`。

**讀目標記錄回算（v1.6.0）**：`fieldMapping` 內若有 `dateShift` 且 `base.from`（或 `amount.from`）為 `target`，`ruleNeedsTargetRecord` 會回 `true`，此時 GET 找記錄**不加 `fields:['$id']` 限制**（抓整筆），把 `found.records[0]` 以 `ctx.targetRecord` 傳進 `buildOtherPayload`，讓 `dateShift` 能讀目標 App 現有欄位值；否則維持只抓 `$id`。Upsert 找不到改用 `create` 新增時無 `targetRecord`，`from='target'` 得空值。

### B-12. 安全性注意事項

- **絕不可 `console.log` 原始 config**：`rawConfig.data` 內含 API Token，會洩漏給所有開 DevTools 的使用者。
- `formula` 採白名單字元檢查再 `Function(...)` 執行，避免任意程式碼注入。
- `CB_AU01`（cybozu session 逾時）會轉成中文友善訊息，取代原始的英文 "Please login."。

### B-12a. 匯出 / 匯入設定（v1.7.0，僅 config.js）

- 設定頁工具列加 `exportConfig` / `importConfig` 兩鈕（皆呼叫 `openTextModal` 自製覆蓋層 modal，內含 readonly/可編輯 `textarea`，不依賴 `prompt`）。
- **匯出**：`JSON.stringify(state, null, 2)` → `navigator.clipboard.writeText`（失敗則退回手動全選複製），同時開 readonly modal 顯示。內容**含 API Token**（與 B-12「不可 `console.log` config」同等敏感，匯出檔請當機密處理）。
- **匯入**：解析貼上的 JSON，**只取 `parsed.rules`**（或最外層即陣列時當作 rules），`confirm` 後 `state.rules = rules` 並 `render()`；**刻意不覆蓋** `selfAppToken`／`tokens`／`logAppId`／`logToken`，避免把來源 App 的 Token／App ID 誤帶到別的 App。匯入後僅改記憶體 `state`，按「儲存」才 `setConfig` 落地。

### B-13. 重新打包

修改 `dist/*.js` 後，用簽章私鑰 `.ppk` 重新打包（私鑰已 `.gitignore`，請另外安全保管）：

```
npx @kintone/plugin-packer contents --ppk <你的.ppk> --out plugin.zip
```

使用相同 `.ppk` 可維持**相同 plugin ID**，於 kintone 後台「更新」即可覆蓋升級、設定自動保留。

---

*如有問題請聯繫系統管理員或工程師。*
