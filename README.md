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
10. [建立人狀態檢查（一覽表按鈕）](#10-建立人狀態檢查一覽表按鈕)
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

### 簽核人沒有編輯權限時會發生什麼事

外掛會自動判斷、不需要額外設定：

- **推進者有編輯權限**（例如經辦人自己送出）→ 欄位值隨狀態轉換一起原子儲存，不動用 Token。
- **推進者沒有編輯權限**（例如簽核人只是「作業者」，但沒有記錄編輯權）→ 自動改用「本 App Token」在推進完成後補寫，並重新整理畫面顯示結果。

> kintone 的「**作業者**」與「**記錄編輯權限**」是兩套獨立設定。簽核人可以是作業者（因此按得動推進鈕），同時完全沒有記錄編輯權限——這正是「除了經辦人，其他簽核人都不給編輯權」這種設計會遇到的情況，外掛判斷得出來並會自動用 Token 補寫。**你只要把「本 App Token」填好就行。**

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
| **跳出提醒視窗** | 不寫任何欄位，跳一個提醒視窗；按下確定後才繼續執行後面的規則（見 ⑩，v1.15.0） |

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

### ⑩ 跳出提醒視窗（v1.15.0）

動作選「**跳出提醒視窗**」時，這條規則不寫任何欄位，而是在事件觸發時跳一個視窗；**使用者按下「確定」後，才會繼續執行排在它下面的規則**。

> 📘 完整的操作步驟、實務範例與疑難排解，請參考 **[提醒視窗操作教學.md](提醒視窗操作教學.md)**。以下為設定欄位的速查說明。

| 欄位 | 說明 |
|---|---|
| 圖示 | 驚嘆號 / 資訊 / 完成 / 錯誤 / 詢問 / 不顯示 |
| 標題 | 視窗標題，留空＝不顯示標題列 |
| 內文 | 多行文字，**換行與縮排會原樣顯示**。文中的 `{欄位代碼}` 會代換成這筆記錄的實際值 |
| 確定鍵文字 | 預設 `OK` |
| 取消鍵文字 | **留空＝只有確定鍵**（純提醒，按了一定接續）。填了才出現取消鍵 |
| 取消時的訊息 | 按取消後顯示在 kintone 錯誤提示列的文字 |
| 強調色（圖示） | 只影響這條規則的圖示顏色；不設就用全域預設色 |

按「👁 預覽此提醒視窗」可以立刻看到實際長相（預覽用的是跟正式完全同一支渲染程式，不是另做的示意圖）。

#### 內文範例

```
※　請將同一筆請款單之傳統紙本發票及收據正本
　　① 釘起(或夾成)一份
　　② 首張憑證寫上請款單編號【{請款單編號}】
　　③ 盡速寄交會計課承辦

※　有收據及傳統紙本發票的請款單，
　　會計課於收到正本後方能執行請款作業
```

#### ⚠️ 四件一定要知道的事

1. **只有「儲存前 (`*.submit`)」和「流程推進時」按取消才擋得住。**
   「畫面載入時 (`*.show`)」畫面已經跑完了、「存檔後 (`*.submit.success`)」記錄已經存進去了，這兩類時機 kintone 不會等提醒視窗，所以取消鍵會被自動隱藏，只剩確定鍵。設定畫面會提示。

2. **提醒視窗只擋得住「排在它下面」的規則。** 要被它擋住的規則請排到它後面。另外「寫入其他 App」一律最後執行，所以一定會被提醒視窗擋住。

3. **`{欄位代碼}` 在「新增儲存前」抓不到記錄編號**——記錄還沒存進去，`{記錄編號}` 會是空的。要顯示新單號請改用「新增存檔後」，但那時就不能擋了。

4. **同一個事件命中多條提醒規則會依序跳**，一個按完才跳下一個。

#### 外觀（設定畫面第 4 區「提醒視窗外觀」）

最大寬度、字級、行高、標題字級、圓角、遮罩深淺、內文對齊、預設強調色、確定鍵顏色**由全域統一設定**，所有提醒視窗共用，改一次全部生效。

> **視窗寬度全自動，內文不會自動換行**（v1.16.0）：只有你在輸入框裡打的換行字元才斷行，視窗寬度長到最長那一行為止。排版怎麼打就怎麼顯示，不會被系統折在奇怪的位置。因此**沒有「寬度」這個設定項目**——寬度完全由內容決定。
>
> **螢幕寬度小於 600px（手機）時會自動恢復換行**，並把視窗收在 92vw 以內。不然 14px 的 40 個全形字約 560px，超過手機螢幕，使用者得左右滑才讀得完提醒。

> **關於 SweetAlert2（v1.16.0）**：若記錄頁上有載入 SweetAlert2（`window.Swal`），提醒視窗會直接用它渲染；沒有才用外掛內建的視窗元件。上述設定項目**兩種情況都適用**，差別主要在圖示畫法與開場動畫。設定畫面的「4. 提醒視窗外觀」會顯示本頁是否偵測到 SweetAlert2。

要更細的控制可用「進階：自訂 CSS」。選擇器依渲染器而異，建議兩套都寫，沒命中的那套不會有作用：

| 渲染器 | 選擇器 |
|---|---|
| SweetAlert2 | `.swal2-popup.sda-swal`（本體）、`.sda-swal` 底下的 `.swal2-title`、`.swal2-html-container`、`.swal2-icon`、`.swal2-confirm` |
| 內建元件 | `.sda-dlg`（本體）、`.sda-dlg-overlay`、`.sda-dlg-icon`、`.sda-dlg-title`、`.sda-dlg-text`、`.sda-dlg-ok`、`.sda-dlg-cancel` |

> 這組外觀設定**會**隨「匯出 / 匯入設定」一起帶到其他 App（與 Token / Log App ID 不同）。

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
| `cancelled` | 使用者在提醒視窗按了取消（`LOG_RESULT` 記為「取消」） | — | 正常操作，不是錯誤；統計時請與失敗分開看 |
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

## 10. 建立人狀態檢查（一覽表按鈕）

> v1.17.0 新增。用途：**快速找出「建立人已離職／帳號已停用」的申請單**，並就地修正或刪除。

### 這個功能在做什麼

在 App 一覽表的上方加一顆按鈕。按下去之後：

1. 抓取「**目前一覽表篩選條件下**」的記錄（不是整個 App，所以先用一覽表篩出你要檢查的範圍）。
2. 取出每筆記錄的「**建立人**」，向 cybozu.com 共通管理查這些帳號的狀態。
3. 用一個視窗列出全部記錄，並標記：

| 標記 | 意思 |
|---|---|
| 正常 | 帳號存在且啟用中 |
| **已停用** | 帳號還在共通管理裡，但已停用（`valid = false`）— 通常就是離職 |
| **已刪除** | 共通管理裡已經查不到這個帳號 |
| 查不到 | 沒填權杖、查詢失敗，或該筆沒有建立人資訊 |

4. 視窗裡可以：切換「只看異常」、勾選記錄、**就地修改**你指定的欄位、**刪除**勾選的記錄。

### 步驟 1：取得 cybozu.com 共通管理 API 權杖

1. 右上角使用者圖示 → **cybozu.com 共通管理**
2. 左側「**外部服務連携**」→「**API 權杖**」
3. 新增一支權杖，權限（Scope）勾 **Read** 就夠（本功能只讀取使用者資料）
4. 複製那串 `cy.s.api1.…` 開頭的字串

> ⚠️ 這**不是** App 設定裡的那種 API Token。兩者認證方式不同（共通管理權杖走 `Authorization: Bearer`），
> 所以一定要填在下面指定的那一欄，填錯位置不會生效。

### 步驟 2：填入外掛設定

**第 1 區「API Token 設定」** → 找到「**共通管理 API 權杖**」欄位貼上，按旁邊的「**測試連線**」確認。

> 測試會直接用瀏覽器打一次 `/v1/users.json`，不會先儲存任何設定，按了「測試連線」不等於按了「儲存」。
> 顯示「✓ 連線成功」才算可用。出現 401／403 表示權杖無效、已失效或 Scope 不足。

### 步驟 3：設定按鈕與表格

**第 5 區「建立人狀態檢查（一覽表按鈕）」**：

| 設定 | 說明 |
|---|---|
| 啟用 | 打勾才會在一覽表出現按鈕 |
| 按鈕文字 | 預設「建立人狀態檢查」 |
| 掃描上限 | 一次最多掃幾筆（預設 500，上限 5000）。避免一覽表沒篩選就整個 App 掃下去 |
| 預設檢視 | 打開視窗時就先只顯示異常的記錄（視窗內仍可切回全部） |
| 允許就地編輯 | 關掉＝整張表唯讀 |
| 允許刪除記錄 | 打開才會出現「刪除選取」鍵 |
| 限制可使用對象 | 打開才會顯示下面的使用者／部門／群組名單設定（見下一節）。不打開＝所有能看到一覽表的人都能看到按鈕 |
| 顯示欄位 | 表格要顯示哪些欄位（由上而下＝由左而右）。每個欄位可再勾「可編輯」 |

「建立人」與「帳號狀態」是固定欄，不用自己加。

### 步驟 4：（選填）限制可使用對象

按鈕預設所有能看到一覽表的人都能看到。若只想開放給特定人，把「限制可使用對象」打開，會出現三欄，**符合任一項就能看到按鈕**：

| 欄位 | 內容 |
|---|---|
| 使用者 | 個別使用者 |
| 部門 | 部門（組織） |
| 群組 | 群組 |

每一欄都是打一兩個字搜尋姓名／代碼，選一個就變成一個可移除的標籤（chip），可以繼續搜尋加下一個。**搜尋名單需要第 1 區的「共通管理 API 權杖」**（用來向 cybozu.com 共通管理要使用者／部門／群組清單）；還沒填的話，該欄會顯示提示，並改成一個文字框讓你直接輸入完整代碼、按 Enter 新增（沒有搜尋建議）。

三個名單都留空會被擋下無法儲存（等於按鈕永遠不顯示，多半是忘記填）。

**可以就地編輯的欄位型別**：所有非系統欄位——單行文字、多行文字、RTF 文字、數值、連結、下拉選單、單選按鈕、核取方塊、複選、日期、時間、日期時間、使用者選擇、組織選擇、群組選擇。
選擇類欄位都是「打字搜尋 → 點選」：
- 下拉／單選／核取方塊／複選：搜尋該欄位自己的選項。
- 使用者／組織／群組：搜尋 cybozu.com 通訊錄（需在第 1 區填「共通管理 API 權杖」；沒填時改成輸入完整代碼按 Enter）。已停用的帳號不會出現在搜尋結果。
- Lookup（關聯）欄位：直接搜尋關聯 App 的記錄（套用 Lookup 設定的篩選條件與排序），儲存後 kintone 會自動帶入對應欄位。

唯讀的只剩：系統欄位（記錄編號、建立人、更新人、建立／更新時間、狀態、作業者、類別）、計算欄位（kintone 不允許寫入），以及附件、子表格（不適合在一行表格裡編輯）。設定畫面會直接顯示「唯讀（型別）」，不讓你誤設。

填好按「**儲存**」→ 回到 App「**更新 App**」即生效。

### ⚠️ 三件要知道的事

1. **權限完全等同操作者本人。** 記錄的讀取、修改、刪除都用操作者自己的身分，不套任何 API Token。
   看不到的記錄不會出現在表格裡；沒有編輯權的列會標「🔒唯讀」；沒有刪除權的列會被刪除動作跳過並回報。
   「共通管理 API 權杖」只用來查帳號狀態，不會擴大任何記錄權限。
2. **刪除不可復原。** 按「刪除選取」後會出現紅色確認條，要再按一次「確定刪除 N 筆」才真的送出。
3. **建立人不能改。** kintone 的「建立人」是系統欄位，API 也不能改寫。要轉移承辦請改你自己的承辦人欄位
   （把該欄位設成顯示欄位並勾「可編輯」，就能在這張表批次改）。
4. **「可使用對象」只是隱藏按鈕，不是額外的安全機制。** 不符合名單的人一樣看不到記錄裡「共通管理 API 權杖」等機密內容——那些本來就沒有洩漏管道；這個設定純粹是「誰的一覽表上會出現這顆按鈕」。真正的記錄權限仍完全由 kintone 本身的權限設定決定（見上面第 1 點）。

### 常見狀況

| 狀況 | 原因 |
|---|---|
| 按鈕沒出現 | 第 5 區沒勾「啟用」，或 App 沒按「更新 App」 |
| 全部顯示「查不到」 | 沒填共通管理 API 權杖，或權杖失效（回設定頁按「測試連線」） |
| 表格是唯讀的 | 「允許就地編輯」沒開，或顯示欄位都沒勾「可編輯」，或該欄位型別不支援 |
| 沒有「刪除選取」鍵 | 「允許刪除記錄」沒開，或你對列出的記錄都沒有刪除權限 |
| 提示「已達上限」 | 篩選範圍超過掃描上限，請在一覽表縮小篩選條件再按 |
| 開了「限制可使用對象」但自己也看不到按鈕 | 檢查自己的登入代碼／部門／群組是否真的在名單裡；部門／群組限制沒填共通管理 API 權杖時一律視為不符合 |
| 「限制可使用對象」搜尋不到人／部門／群組 | 沒填第 1 區的共通管理 API 權杖就無法搜尋，該欄會改成純文字輸入；填好權杖後重新整理設定頁再試 |

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
- `contents/dist/dialog.js`（v1.15.0）：**三邊共用**的提醒視窗元件，`manifest.json` 的 `desktop.js` / `mobile.js` / `config.js` 三個陣列都載入它，且都排在各自主檔之前。它只掛 `window.SdaDialog = { show, showPanel, buildCss, hasSwal, DEFAULT_STYLE }`（`showPanel` 為 v1.17.0 新增的表格型面板，見 B-15），不註冊任何事件。**共用是刻意的**：設定畫面的「預覽」呼叫的就是 runtime 那支 `show()`，預覽與實際不可能不一致。這支檔案不需要像 desktop/mobile 那樣複製。
- 設定值透過 `kintone.plugin.app.getConfig/setConfig` 以單一 JSON 字串（`data`）存取。

### B-2. 註冊的事件（被動觸發，無背景常駐）

註冊 9 個「使用者操作」事件：`create.show`、`edit.show`、`index.edit.show`、`create.submit`、`edit.submit`、`index.edit.submit`、`detail.process.proceed`、`detail.show`、`index.show`（另加 `create.submit.success`／`edit.submit.success` 給 Log 確認存檔成功，見 B-8b）。

`index.show`（v1.17.0）**只掛「建立人狀態檢查」按鈕，不跑任何規則**——規則的一覽表時機是 `index.edit.*`。未啟用該功能時 handler 第一行就 return，零成本。

- **無** `setInterval`／輪詢／常駐迴圈；唯一的 `setTimeout` 是 `setFieldShown` 的下一個 tick（0ms）。
- 每次觸發先做快速退出：無規則就立刻 return；需要時間才打 API。對低階電腦無負擔。
- `index.edit.show`／`index.edit.submit`（一覽表內編輯列）走 `safeHandler` 直接呼叫 `applyRules`，**不**經過 `loggedApply`／存檔成功後的 `flushSubmitLog` 機制（kintone 沒有對應的 `index.edit.submit.success` 事件可掛），所以這兩個觸發**不會**寫進 Log App；只有 `writeSelf`／`writeOther` 動作本身會執行。`writeOther`（跨 App 寫入）目前只在 `process.proceed`／`create.submit`／`edit.submit`／`index.edit.submit` 執行，`*.show` 類觸發（含 `index.edit.show`）不執行 `writeOther`。
- 一覽表內編輯是 kintone 平台功能限制：**只有被設成「一覽表欄位」的欄位才能透過 index 編輯存檔**，JS 改了值但欄位沒被設成一覽表欄位一樣存不進去。

### B-3. `process.proceed` 寫入流程（核心）

1. 先把規則套用到 `event.record`（記憶體內）。
2. `checkEditPermission()` 呼叫 `/k/v1/records/acl/evaluate.json` 判斷**當前使用者現在是否可編輯這筆記錄**：
   - **可編輯** → `return event`（與狀態轉換一起原子儲存）。
   - **不可編輯 + 有設定本 App Token（selfAppToken）** → 存 `pendingWrite`、`return undefined`；待下一個 `detail.show` 觸發時，用 Token 走 REST `PUT` 補償寫入（compensation write），成功後 `location.reload()`。
   - **不可編輯 + 無 Token** → 仍 `return event`（狀態會轉換，但受欄位權限限制的欄位寫入可能被 kintone 拒絕）。
3. 補償寫入若失敗，以非阻擋方式提示（`SdaDialog`，見 B-14），記錄狀態仍正確、只是履歷可能漏一列。

> **為什麼查「現在」的權限是對的**：這支查詢問的是「隨狀態轉換一起送出的欄位寫入會不會成功」，而那取決於使用者對**當前**記錄的編輯權，不是推進後的新狀態。kintone 的「作業者」與「記錄編輯權限」是兩套獨立設定，簽核人可以是作業者（按得動推進鈕）卻沒有編輯權——此時這支查詢正確回傳 `editable: false`，補償寫入才會啟動。
>
> 這套判斷與 cybozu 原廠的「流程管理履歷外掛」（Process Management History Plug-in v2.1.0）完全一致：同樣的 `evaluatePermission` 呼叫、同樣的時機、同樣延後到 `detail.show` 以 `kintone.plugin.app.proxy` 寫入、同樣成功後 `location.reload()`。

### B-4. Token 機制

- `CONFIG.tokens`：跨 App Token 對應表，轉成 `TOKENS`（key = appId 字串）。
- `CONFIG.selfAppToken`：本 App Token，補償寫入用。
- `CONFIG.logAppId` / `CONFIG.logToken`：執行 Log 用（見 B-8）；若兩者都有，啟動時把 logToken 併入 `TOKENS[logAppId]`。
- `apiWithToken(path, method, body, appIdForToken)`：有對應 Token 時用 `fetch` + `X-Cybozu-API-Token` header；否則退回 `kintone.api`（plugin proxy，走使用者 session）。
- `CONFIG.hasAdminApiToken`（v1.17.0）：是否已設定 **cybozu.com 共通管理 API 權杖**。這支權杖與 App Token 是**兩套完全不同的認證**（`Authorization: Bearer` vs `X-Cybozu-API-Token`），因此它在 `config.js` 的 `save()` 裡是在 `combined` 算完之後才放進 `tokenMap`——絕不可混進那串逗號分隔的 `X-Cybozu-API-Token`。代理設定另外註冊一組 `${location.origin}/v1/` 的 GET header，見 B-15。

### B-5. 時間來源

`now`/`today`/`nowTime` 直接取自瀏覽器本機時鐘（`new Date()`），不發任何網路請求。早期版本曾以對 `location.href` 發 `HEAD` 取伺服器 `Date` header 來避開使用者端時鐘誤差，v1.5.0 起移除，換取簽核/存檔當下少一趟網路往返。

### B-6. `valueSource` 一覽與參數格式

純量類：`fixed`、`loginUser`、`today`、`nowTime`、`now`、`recordNumber`/`recordId`、`appId`、`uuid`、`timestamp`、`clear`、`nextStatus`、`currentStatus`、`actionName`、`fieldCopy`（valueParam＝來源欄位代碼）。

需要 JSON / 特殊參數：

- **`formula`**：如 `{数量}*{単価}+10`，欄位代碼用 `{}` 包；陣列欄位代換成長度，非數字欄位代換成加引號的字串字面值（換行/Tab/反斜線/引號皆會跳脫，多行文字欄位也能安全串接），故 `+` 在字串間會做串接，可拿來組合字串，如 `"No."+{單據編號}+" "+{受邀公司名稱}+"_"+{申請原因_略述}`。安全防護：先把代換後字串裡的引號包住的內容（欄位值本身，可含中文、換行等任意字元）挖空成 `""` 取得「骨架」，只檢查骨架是否僅含 `數字 + - * / ( ) . 空白 " ,`，否則丟錯（防注入）；欄位值本身不受此白名單限制。
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
- **`appendText`**（v1.11.0，文字欄位串接追加）：`{ value, separator?, dedup? }`。
  - `value`：巢狀 `{ valueSource, valueParam? }`，用來計算要附加的「新值」，可遞迴使用任何其他 `valueSource`（如 `fixed`／`fieldCopy`／`recordId`／`recordNumber`／`today`）。
  - `separator`：串接分隔字元，省略預設 `" / "`。
  - `dedup`：省略預設 `true`；為 `true` 時，若新值已存在於目標欄位現有內容中（依 `separator` 切分後逐一比對，去除頭尾空白），則直接沿用現有值不重複附加。
  - 現有值讀取來源依動作而異：`writeSelf` 讀 `ctx.record[targetField]`（本記錄）；`writeOther` 讀 `ctx.targetRecord[targetField]`——只有 `update`／`upsert` 命中既有記錄時才有 `targetRecord`，故 `ruleNeedsTargetRecord` 已納入 `appendText` 判斷（見 B-11），確保這種情況下 GET 會抓整筆而非只抓 `$id`；`upsert` 未命中改走 `create` 時無既有記錄可讀，視為空值，直接寫入新值本身（不加分隔字元）。
  - 目標欄位型別須為文字類（`SINGLE_LINE_TEXT`／`MULTI_LINE_TEXT`）；若目標欄位實際是陣列型（CHECK_BOX 等），`appendText` 算出的字串仍會整串塞進 `classifyWrite` 判定的陣列分割規則，語意上不建議混用——陣列型欄位請改用既有的 `appendMode`（見 B-9）。
  - 與 `skipIfFilled` 併用時：`skipIfFilled` 在目標欄位已有值時會讓整條規則直接跳過（含 `appendText` 本身），等同「只在第一次寫入」，不會進到附加判斷；如需「每次都嘗試附加去重」，`skipIfFilled` 應設為 `false`（或不設）。
- **`copyAttachment`**（v1.14.0，**附件檔案複製**，**限 `*.submit.success` 觸發**）：`{ from, mode?, maxFileSize?, onError? }`。把來源附件欄位的**檔案本身**複製到目標附件欄位。設計背景與 kintone 限制見 spec `docs/superpowers/specs/2026-07-15-attachment-copy-design.md`。
  - `from`：來源。`{ app, keyField, keyExpr, attachmentField }`。`app` 省略或 `"this"`＝本記錄；否則以 `keyExpr`（`{欄位代碼}` 代換本記錄值）在 `app` 查一筆、讀 `attachmentField`。
  - 目標＝此規則的「目標欄位」（附件欄位）；`writeSelf` 寫本記錄、`writeOther` 寫目標 App 那筆。
  - `mode`：`replace`（預設，覆蓋）／`append`（附加）。附加時**既有檔案會重新上傳保留**（既有下載 key 不可再寫入），並以 `檔名::大小` 去重避免重跑重複附加；`copyAttachment` 一律不吃 `appendMode`（`runWriteSelf` 對此 valueSource 強制 `append:false`），模式只看 `valueParam.mode`。
  - `maxFileSize`：單檔上限 bytes，預設 10485760（10MB）；超過依 `onError` 跳過或中斷。`onError`：`log`（預設，跳過該檔續跑）／`block`（整條規則失敗）。
  - **來源無檔案時不動目標**（回傳目標現有值）；非 `*.submit.success` 觸發時只記 `console.warn` 並不動目標。
  - **認證＝登入者 session**：附件的 binary 下載（`GET /k/v1/file.json`）與 multipart 上傳（`POST /k/v1/file.json`）**都不經外掛 proxy／Token**（proxy 不吃 binary/multipart、加密 Token runtime 讀不到），一律用 `fetch` + `credentials:'include'` + `X-Requested-With`。⇒ **執行者需對來源 App 有下載權、對目標 App 有上傳權**；若對來源無權限則做不到（需後端，非本外掛範疇）。
  - `append` 需目標既有附件，故 `ruleNeedsTargetRecord` 已納入 `copyAttachment(mode:append)`（見 B-11），確保 `writeOther` 撈整筆目標記錄含附件欄位。
- **`elapsedMinutes`**（僅用於 `appendSubtable` 的 subRules 內）：`{ sinceField: '執行日時' }`，回傳距上一列該時間欄位的分鐘數；第一列回 0。
- **`readonly`**：唯讀鎖定，僅 `*.show` 時機有意義（v1.9.0 起依觸發事件分兩種機制）：
  - `index.edit.show`（一覽表內編輯列）：直接對 `ctx.record[targetField].disabled = true` 賦值——欄位仍顯示在該列，但輸入框變灰階不可編輯。`kintone.app.record.setFieldShown` 在一覽表編輯列沒有對應元素，故不適用。
  - 其餘 `*.show`（`create.show`／`edit.show`）：沿用 `setFieldShown(code, false)` **隱藏欄位**，跟舊版行為相同。

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

退化到最小欄位時，`LOG_MESSAGE` 會把完整寫入失敗的原始錯誤（`e.message`）一併附加在訊息末尾（`\n（完整欄位寫入失敗，已退化為最小欄位；原始錯誤：...）`），讓事後查 Log App 也能直接看到失敗原因，不必只靠當下操作者瀏覽器的 console（console 內容通常留不久、且很少人會截圖回報）。

### B-9. 欄位值寫入判別（classifyWrite）

依目標欄位現況與來源值分三類：`userObject`（loginUser 物件 → USER_SELECT 陣列）、`arrayField`（CHECK_BOX/MULTI_SELECT/USER_SELECT 等陣列欄位，字串會用 `,;換行` 拆分；`appendMode` 可保留原值去重合併）、`scalar`（一般純量欄位）。

### B-10. 規則比對（conditions）

`rule.conditions = [{ field, value, op }]`，`op`：`eq`(預設)/`neq`/`startsWith`/`contains`/`inList`；`rule.conditionLogic`：`AND`(預設)/`OR`。多值欄位（複選/使用者/組織/群組）會把每個元素（物件取 `code` 與 `name`）展開成候選清單比對。

### B-10a. 狀態條件支援多值（v1.7.2）

`statusMatches` 的 `fromStatus`／`toStatus`／`actionName`（process.proceed）與 `statusCond`（edit.* 觸發）皆改用 `statusMatchesList(spec, actual)` 比對：以 `[,，;；\n]` 切分成清單，`actual` 命中**任一**即成立；空字串或含 `*` 視為任意。單一值的舊設定行為不變（向下相容）。比對為純記憶體字串運算、每次事件僅跑一次（O(N·k)，k＝清單長度，實務微秒級），不增任何 API 呼叫。`fromStatus` 在 `cur===''`（event.record 取不到 `$status`）時仍維持「略過 from 檢查並 `console.warn`」的既有語意。

### B-10b. `trigger` 支援複選（v1.9.0）

`rule.trigger` 存成**逗號分隔字串**（單一值時行為與舊版相同，向下相容）。`triggerMatches(rule, trigger)` 拆成清單後用 `includes` 判斷，`statusMatches` 則改成依**實際觸發的事件**（`applyRules` 的 `trigger` 參數，而非 `rule.trigger`）決定要檢查 `fromStatus/toStatus/actionName` 還是 `statusCond`——因為同一條規則若複選了 `create.show`+`edit.show`，實際觸發時只會是其中一種事件，用哪個分支要看當下真正發生的是哪個。

設定畫面（`config.js` 的 `triggerCheckboxGroup`）用勾選群組限制合法組合，寫進 `rule.trigger` 前先做互斥檢查：

- `process.proceed` 只能單獨勾選（狀態語意跟其他觸發完全不同，混選會讓 `fromStatus/toStatus` 跟 `statusCond` 打架）。
- 「顯示類」（`create.show`／`edit.show`／`index.edit.show`）彼此可自由複選。
- 「儲存類」（`create.submit`／`edit.submit`／`index.edit.submit`）彼此可自由複選。
- 顯示類與儲存類不能混選（`TRIGGER_GROUPS` 分組後，勾選新群組會清掉舊群組的勾選）。

`create.show`／`create.submit` 因為新增時記錄尚無狀態，`statusMatches` 一律略過 `statusCond` 檢查（即使規則裡有填也不生效）；所以同一條規則勾 `create.show + edit.show` 沒問題，`statusCond` 只在觸發事件是 `edit.show`／`index.edit.show` 等既有記錄類事件時才會生效。

### B-11. 寫入其他 App（writeOther）

`writeMode`：`create`/`update`/`upsert`。`update`/`upsert` 需 `keyMapping`（組 query 找 `$id`）；`fieldMapping` 為要寫入的欄位（由 `buildOtherPayload` 逐筆 `resolveValue` 組成）。`onError`：`block`（預設，擋下提交）/`log`/`ignore`。

**讀目標記錄回算（v1.6.0；v1.11.0 擴及 `appendText`）**：`fieldMapping` 內若有 `dateShift` 且 `base.from`（或 `amount.from`）為 `target`，或有 `appendText`，`ruleNeedsTargetRecord` 會回 `true`，此時 GET 找記錄**不加 `fields:['$id']` 限制**（抓整筆），把 `found.records[0]` 以 `ctx.targetRecord` 傳進 `buildOtherPayload`，讓 `dateShift`／`appendText` 能讀目標 App 現有欄位值；否則維持只抓 `$id`。Upsert 找不到改用 `create` 新增時無 `targetRecord`，`from='target'` 得空值、`appendText` 視現有值為空。

**`ctx.isOther` 標記（v1.11.0）**：`runWriteOther` 一律以 `{ ...ctx, isOther: true }` 呼叫 `resolveValue`／`buildOtherPayload`（含 `create`／找不到記錄改新增等所有分支），讓 `appendText` 能分辨當前是 `writeSelf`（讀 `ctx.record`）還是 `writeOther`（讀 `ctx.targetRecord`，避免誤讀觸發規則的來源記錄）。此標記不影響其他既有 `valueSource` 的行為。

### B-12. 安全性注意事項

- **絕不可 `console.log` 原始 config**：`rawConfig.data` 內含 API Token，會洩漏給所有開 DevTools 的使用者。
- `formula` 採白名單字元檢查再 `Function(...)` 執行，避免任意程式碼注入。
- `CB_AU01`（cybozu session 逾時）會轉成中文友善訊息，取代原始的英文 "Please login."。

### B-12a. 匯出 / 匯入設定（v1.7.0，僅 config.js）

- 設定頁工具列加 `exportConfig` / `importConfig` 兩鈕（皆呼叫 `openTextModal` 自製覆蓋層 modal，內含 readonly/可編輯 `textarea`，不依賴 `prompt`）。
- **匯出**：`JSON.stringify(state, null, 2)` → `navigator.clipboard.writeText`（失敗則退回手動全選複製），同時開 readonly modal 顯示。內容**含 API Token**（與 B-12「不可 `console.log` config」同等敏感，匯出檔請當機密處理）。
- **匯入**：解析貼上的 JSON，**只取 `parsed.rules`**（或最外層即陣列時當作 rules）與 `parsed.dialogStyle`（v1.15.0，有才套用），`confirm` 後寫回 `state` 並 `render()`；**刻意不覆蓋** `selfAppToken`／`tokens`／`logAppId`／`logToken`，避免把來源 App 的 Token／App ID 誤帶到別的 App。`dialogStyle` 之所以帶、Token 之所以不帶，判準是「是不是本 App 專屬的機密或識別碼」——外觀兩者皆非，且不跟著走的話匯入的提醒規則會長得跟來源 App 不一樣。匯入後僅改記憶體 `state`，按「儲存」才 `setConfig` 落地。

### B-12c. 存檔後觸發 `*.submit.success`（v1.13.0）

`create.submit.success` / `edit.submit.success` 除了原本寫 Log，現在也會跑 `runSuccessRules`，可當成一般規則的觸發時機。

- **用途**：`create.submit` / `edit.submit` 在「存檔前」執行，新增時記錄尚無 `$id`，無法把「這筆新記錄的編號」回寫來源單。`*.submit.success` 在「存檔後」執行，`event.recordId` 已存在，適合這種回寫（例如把本筆請款單的 `$id` 追加到來源請購單的「請款單據編號」欄位）。
- **執行方式**：比照 `runProceedRulesViaApi`——以 API 重取整筆記錄（含 `$id`、完整子表、附件欄位），跑命中規則；本表 `writeSelf` 變更以 API `PUT` 落地（success 階段 `event.record` 已無法直接改存），跨 App `writeOther` 照常。全段包在 try/catch，任何錯誤只記 console，**絕不中斷已完成的存檔**。
- **設定畫面**：觸發時機新增「新增存檔後」「編輯存檔後」兩個複選項，自成一組（`submitSuccess`），與「顯示類 / 儲存前」不可混選。
- **狀態條件**：走 `statusMatches` 的 default 分支，以 `statusCond` 比對當前記錄的「狀態」（與 `edit.submit` 相同；無流程管理的 App 用 `*` 即全部命中）。
- **回寫來源單範例**（把本筆 `$id` 追加到來源 App 的「請款單據編號」，以「來源單號」為 key）：

```json
{
  "rules": [
    {
      "label": "請款存檔後→回寫請款單號到來源請購單(135)",
      "enabled": true,
      "trigger": "create.submit.success,edit.submit.success",
      "statusCond": "*",
      "conditions": [ { "field": "類型", "op": "eq", "value": "請購單➞請款單" } ],
      "action": "writeOther",
      "writeMode": "update",
      "targetApp": "135",
      "keyMapping":  [ { "targetField": "請購單據編號", "valueSource": "fieldCopy", "valueParam": "請購單據編號" } ],
      "fieldMapping": [ { "targetField": "請款單據編號", "valueSource": "appendText",
        "valueParam": { "value": { "valueSource": "recordId" }, "separator": " / ", "dedup": true } } ],
      "onError": "log"
    }
  ]
}
```

> 三個來源 App（135 請購 / 274 庶務 / 588 出差）各設一條、以 `類型` 條件區分、`targetApp` 對應改掉即可。需先在設定畫面登錄各來源 App 的 Token（`writeOther` 由外掛伺服器端注入）。

### B-12b. 對外暴露的全域 helper（供 App 自訂 JS 呼叫）

外掛在 `window` 上掛兩個具名 helper，讓**同頁的純 JavaScript 自訂**（非外掛程式碼）也能借用外掛能力。兩者都在 runtime 載入時掛載，App 端呼叫前建議先判斷是否存在。

- **`window.NXSdaProceed.run({ recordId, action, fromStatus, toStatus })`**（v1.9.0）
  以 REST API 推進流程時，kintone 不送 `process.proceed` 事件，本表掛在該事件的規則（含簽核履歷 `appendSubtable`）不會執行。呼叫此函式即以「同一份規則」補建並寫入該筆 row。回傳 `{ matched, written }`。本表寫入優先用 `selfAppToken`，避開推進後使用者已無編輯權的問題。

- **`window.NXSdaApi.call(path, method, body, appIdForToken)`**（v1.12.0）
  讓 App 端以「呼叫外掛」的方式，用外掛**加密儲存的 API Token** 存取 kintone REST API。Token 由伺服器端在轉發時注入，**前端拿到的是資料、永遠拿不到 Token**。內部即 `apiWithToken`（三路徑：舊版明文 Token → 加密 proxy → 無 Token 退回 session）。回傳已解析 JSON，失敗時 throw。
  - 典型用途：純 JS 自訂需存取「登入者無權限、需 Token」的 App（例如分攤表 619 的讀取／寫回）。純 JS 自訂無法直接用 `kintone.plugin.app.proxy`，故透過此 helper 借道。
  - 範例：`const data = await window.NXSdaApi.call('/k/v1/record.json', 'GET', { app: 619, id: 12 }, 619);`
  - **安全範圍**：此 helper 可及範圍 = 外掛已登錄 Token 的所有 App。請只在設定畫面登錄前端真正需要的 App Token（kintone Token 本身即單一 App 綁定，未登錄的 App 會自動退回 session）。

### B-13. 重新打包

修改 `dist/*.js` 後，用簽章私鑰 `.ppk` 重新打包（私鑰已 `.gitignore`，請另外安全保管）：

```
npx @kintone/plugin-packer contents --ppk <你的.ppk> --out plugin.zip
```

使用相同 `.ppk` 可維持**相同 plugin ID**，於 kintone 後台「更新」即可覆蓋升級、設定自動保留。

### B-14. 提醒視窗（`action: 'dialog'`，v1.15.0）

第三種 `action`，與 `writeSelf` / `writeOther` 並列。它不寫任何欄位，只是在規則命中時跳一個 modal 並 `await` 使用者的回應，因此**完整沿用既有的比對引擎**（`triggerMatches`、`statusMatches`、`conditions` + AND/OR），runtime 沒有為它另開比對路徑。

**規則結構**

```jsonc
{
  "action": "dialog",
  "dialog": {
    "icon": "warn",              // warn|info|success|error|question|none
    "title": "提醒",
    "text": "…{欄位代碼}…",       // 純文字，textContent 寫入
    "confirmLabel": "OK",
    "cancelLabel": "",           // 空 = 純提醒，不顯示取消鍵
    "cancelMessage": "已取消操作。",
    "accent": ""                 // 空 = 用全域 dialogStyle.accent
  }
}
```

全域外觀存在 `state.dialogStyle`（`width`／`fontSize`／`lineHeight`／`titleSize`／`radius`／`overlay`／`accent`／`buttonColor`／`align`／`customCss`），非機密，隨匯出匯入走（見 B-12a）。

**runtime 接點（`desktop.js`）**

- `applyRules` 的 selfRules 迴圈開頭分流 `rule.action === 'dialog'` → `await runDialog(rule, ctx)`。回傳 `false` 時寫 `_runInfo.cancelled`、設 `event.error = dialog.cancelMessage` 並 `return event`，因此**中止點就是它在規則清單裡的位置**；排在它之前的規則已經跑完、之後的不會跑。`writeOther` 一律在所有 selfRules 之後執行，故必定被擋。
- `interpolateFields` 以 `/\{([^}]+)\}/` 代換記錄欄位值（沿用 `formula`／`keyExpr` 的 `{}` 慣例）；多值欄位取 `name || code` 以 `、` 串接；欄位不存在代成空字串並 `console.warn`。
- **可中止判別**：`ctx.trigger === 'process.proceed' || /\.submit$/.test(ctx.trigger)`。只有這些時機 kintone 會等 handler 回傳的 Promise。不符時 `cancelLabel` 強制清空，視窗只出現確定鍵——`*.show` 畫面已渲染完、`*.submit.success` 記錄已存檔，讓使用者以為能取消是騙人的。
- `runProceedRulesViaApi` 傳 `noBlock: true`：狀態已由 REST API 推進完畢，取消無法回滾。
- `runSuccessRules` 走 `*.submit.success`，可中止判別本來就是 false，不需另外傳旗標。
- **Log**：`loggedApply` 在既有失敗分支**之前**先判 `_runInfo.cancelled`，寫 `result: '取消'` / `category: 'cancelled'`。使用者主動取消是正常操作，混進 `system`／`config` 會讓錯誤統計失真。

**兩種渲染器（v1.16.0）**

`SdaDialog.show()` 在**呼叫當下**偵測 `window.Swal`：有就用 SweetAlert2，沒有才用內建的原生元件。兩條路的回傳值語意完全相同（`true`＝確定／`false`＝取消），呼叫端不需要知道用了哪一個。

- **偵測時機必須在 `show()` 內，不可在載入時做。** 外掛 JS 可能早於 App 自訂 JS 執行，載入當下 `window.Swal` 還不存在，但事件觸發時它已經在了。
- **樣式一律以 `.sda-swal` / `.sda-swal-container` 收斂**（`customClass` 指定），避免外掛的寬度、字級設定去污染 App 自己呼叫的 SweetAlert2。
- `.swal2-container.sda-swal-container` 的 `z-index` 拉到 `100000`：SweetAlert2 預設 1060，會被設定畫面自製的 `openTextModal`（9999）蓋住。
- **`accent` 停在預設值 `#f5a623` 時，不覆寫 SweetAlert2 的圖示配色**，讓它保持原生的淺橘圈線＋深橘驚嘆號。管理者改成別的顏色才會覆寫——沒表達意見就不要把它壓平。
- **`success` / `error` 圖示一律用語意色**（`#a5dc86` / `#f27474`），`accent` 不介入。SweetAlert2 這兩個圖示由多個子元素組成（勾線、叉線各有底色），只改 `border-color` 與 `color` 會得到半染色的結果；兩種渲染器在這點行為一致。
- 呼叫 `Swal.fire` 若同步拋錯，`catch` 後退回內建元件，不會讓整條規則失敗。

**設定畫面的誠實揭露**：外掛設定畫面是 kintone 管理端頁面，不一定載得到全域的 SweetAlert2。「4. 提醒視窗外觀」會以 `SdaDialog.hasSwal()` 偵測並顯示綠色（偵測到）或橘色（未偵測到，預覽改用內建元件、與實際可能有出入）提示。

**自適應寬度與圖示動畫（v1.16.0）**

- 內文用 `white-space: pre`（不是 `pre-wrap`）且不設 `word-break`：**完全不自動換行**，只在設定內容裡的換行字元處斷行。管理者在輸入框排的版面就是使用者看到的版面。
- **寬度沒有上限、也沒有對應的設定項目**：`.sda-dlg` 用 `width:auto; min-width:280px`，SweetAlert2 傳 `width:'auto'` 並以 `.sda-swal{max-width:none}` 解掉 SweetAlert2 自帶的 `max-width:100%`（不解就長不出容器寬度）。`dialogStyle.width` 已從樣式模型移除，舊設定殘留的該鍵會被忽略。
- **遮罩改成 `overflow:auto` + 視窗 `margin:auto` 置中**，並拿掉 flex 的 `align-items/justify-content: center`。原因：flex 的置中對齊在內容超出容器時會把**起始邊裁掉且捲不回去**，左側文字會永久看不到。`margin:auto` 沒有這個問題，超寬時遮罩整片可捲。
- **`@media (max-width:600px)` 恢復 `pre-wrap` 並補回 `max-width:92vw`**：14px 的 40 個全形字約 560px，超過手機螢幕寬度。堅持不換行等於逼手機使用者左右滑才讀得完提醒，這條斷點是刻意的取捨——電腦版照管理者排的版，手機版保可讀性。該區段排在 `customCss` 之前，管理者仍可覆寫。
- 內建元件的圖示改用 SVG：圓環與勾／叉都以 `stroke-dasharray` + `stroke-dashoffset` 動畫畫出來（`.sda-dlg-ring` / `.sda-dlg-mark`），`warn`／`info`／`question` 保留文字字元（`.sda-dlg-glyph`）只讓圓環動。目的是讓「沒有 SweetAlert2 時的退路」不會明顯比較廉價——`success` 少了打勾動畫是最容易被一眼看出來的差異。
- `success`／`error` 的圓環用 `opacity:.32`（比照 SweetAlert2 的淡色環），其餘用 `.78`。
- 全部動畫都在 `@media (prefers-reduced-motion: reduce)` 下關閉。

**兩個安全 / 體感決定**

- 內文一律走純文字路徑（內建元件用 `textContent`、SweetAlert2 用 `text:` 而非 `html:`）搭配 `white-space: pre-wrap`：換行縮排原樣保留，且設定內容永遠不會被當成標記解析。
- 沒有取消鍵時 `Esc`／點擊外部視同「確定」，有取消鍵時視同「取消」；有取消鍵時另設 `allowOutsideClick: false`，避免誤觸外部就中止了儲存。

**設定畫面不再使用原生 `alert` / `confirm`（v1.16.0）**

`config.js` 的所有提示與確認改走 `notify()` / `askConfirm()`，兩者都是 `SdaDialog.show()` 的薄包裝（僅在 `SdaDialog` 本身未載入時才退回原生，確保訊息不會消失）。連帶調整：

- `openTextModal` 的確定鈕改為 `async`（`await onConfirm(...)`），因為「匯入設定」需要在 modal 內再跳一層確認並依結果決定要不要關閉 modal。
- 儲存成功的提示改為 `.then()` 後才 `location.href` 跳轉——原本 `alert` 是同步阻塞，換成非同步視窗後若不等它關閉，導頁會把訊息一起帶走。
- `compensationWrite` 的失敗警告從直接呼叫 `window.Swal` 改為 `SdaDialog.show()`。舊版在沒有 Swal 時只寫 `console.warn`，使用者完全看不到補償寫入失敗、履歷漏記卻無人察覺。

### B-15. 建立人狀態檢查（v1.17.0）

一覽表按鈕 → 掃描篩選結果 → 查建立人帳號狀態 → 可就地編輯／刪除。與規則引擎**完全無關**，不共用任何比對路徑。

**設定結構（`state.creatorCheck`，非機密，隨匯出匯入走）**

```jsonc
{
  "enabled": false,
  "buttonLabel": "建立人狀態檢查",
  "columns": [ { "field": "請款單編號", "editable": false } ],
  "allowEdit": true,
  "allowDelete": false,
  "maxRecords": 500,
  "onlyInvalidDefault": false,
  "visibility": {                 // 可使用對象（v1.17.1）
    "mode": "all",                 // all=所有人 / restricted=限制名單
    "users": [],                   // 登入代碼陣列
    "organizations": [],           // 部門代碼陣列（需共通管理 API 權杖才能驗證）
    "groups": []                   // 群組代碼陣列（需共通管理 API 權杖才能驗證）
  }
}
```

權杖本身存 `state.adminApiToken`，但**不進一般設定**：`save()` 只寫 `hasAdminApiToken` 旗標，明文送進加密代理設定（同 B-12 的保護模型）。匯入時 `creatorCheck` **會**被覆蓋（純欄位代碼與開關），`adminApiToken` 不會。

**兩套認證，兩組代理設定**

| API | 前置比對 URL | Header |
|---|---|---|
| kintone REST | `kintone.api.url('/k/v1/record.json', true)` 去掉 `record.json` | `X-Cybozu-API-Token: <逗號分隔多把>` |
| 共通管理 User API | `${location.origin}/v1/` | `Authorization: Bearer <cy.s.api1.…>` |

兩個前置字串不會互相命中（`https://d/v1/` 不是 `https://d/k/v1/` 的前置），客人空間也不影響——User API 不在 `/k/guest/<id>/` 底下。**權杖清空時仍要把 header 覆寫成 `{}`**，否則舊權杖會留在代理設定裡繼續生效。

**設定畫面的「測試連線」直接 `fetch`，不經代理**

一開始的實作是「先 `setProxyConfig` 寫入、再 `kintone.plugin.app.proxy` 呼叫」，想比照 runtime 完全不讓明文權杖進瀏覽器。但 `kintone.plugin.app.proxy` 只在**記錄畫面**（App 自訂 JS／外掛的 `desktop.js`／`mobile.js`）可正常以 Promise 形式使用；在**外掛設定畫面**（`config.js` 執行的頁面）呼叫時，await 後拿到的不是 `[body, status, headers]` 陣列，解構賦值直接丟 `TypeError: … is not iterable`。

因此改成設定畫面的測試連線直接在瀏覽器用 `fetch(url, { headers: { Authorization: 'Bearer '+token } })` 打 `/v1/users.json?size=1`。這不是新的外洩面——`state.adminApiToken` 這個明文值本來就在管理者自己瀏覽器的 JS 記憶體裡（他剛打進 password 欄位），直接 `fetch` 沒有讓任何**其他人**看到它；只是不再假裝走加密代理。同域（同一個 `*.cybozu.com`）也不會有 CORS 問題。**測試不再需要事先寫入任何東西**，按「儲存」才會把權杖送進加密代理設定，因此也不再跳確認框。

runtime（`desktop.js`）本身仍然走加密代理（`kintone.plugin.app.proxy`），因為記錄畫面上的呼叫是原本就驗證過可行的路徑，也是唯一能不讓一般使用者看到權杖的做法。

**按鈕外觀（v1.17.1）**

一覽表工具列本身是白底，早期版本的按鈕也是白底＋灰框，混在原生 kintone 按鈕堆裡不容易一眼找到。改成實心色底（`background: DIALOG_STYLE.buttonColor`，預設 `#7b68ee`，管理者可在第 4 區「提醒視窗外觀」改，兩處共用同一個顏色設定，不必為這顆按鈕另開一組配色）＋白字＋前綴一個 🔍 圖示、輕微陰影。查詢中會把按鈕文字換成「查詢中…」並停用 —— 圖示與文字分別是獨立的 `<span>`（`btn._sdaLabelEl` 存文字節點的引用），查詢結束只換文字節點，圖示不會被覆蓋掉。

**可使用對象（v1.17.1，`ccCheckVisibility`）**

`mountCreatorCheckButton` 掛按鈕前先問 `ccCheckVisibility()`：`visibility.mode !== 'restricted'` 直接放行（預設行為，向下相容）。限制模式下依序判斷：

1. 三個名單都空 → 直接不顯示（設定畫面的 `validate()` 已擋下這種存檔，但 runtime 仍防禦一次，避免手動改壞的設定檔造成按鈕對所有人可見或不可見的意外行為）。
2. `kintone.getLoginUser().code` 在 `visibility.users` 裡 → 放行。拿不到 `getLoginUser()`（理論上不會發生）時**放行**而非擋下——寧可多顯示，不要因為一個取不到登入資訊的邊角情況讓所有人都看不到按鈕。
3. 都不在 `users` 名單，但 `organizations`／`groups` 有值 → 沒有 `HAS_ADMIN_API` 時直接不放行（`console.warn` 說明原因）；有的話依序打 `/v1/user/organizations.json?code=` 與 `/v1/user/groups.json?code=`（`userApiGet`，與帳號狀態查詢共用同一支加密代理），比對 `organizationTitles[].organization.code` 與 `groups[].code` 是否命中名單。
4. 任一查詢拋錯 → 視為不符合（不放行），`console.warn` 記下原因，不讓錯誤直接把按鈕漏顯示給不該看到的人（保守方向：查不到就當作沒有權限，而不是當作有權限）。

這個限制只決定「誰的一覽表上會出現按鈕」，不是額外的資料保護層——按下按鈕之後的記錄讀取／修改／刪除仍完全由 kintone 記錄權限決定（B-15 前段「權限模型」一節）。

**設定畫面的可使用對象搜尋（v1.17.2，`config.js`）**

`visibility.users`／`organizations`／`groups` 一開始是「填代碼、逗號分隔」的純文字輸入，管理者反映打代碼太不直覺，改成打一兩個字就能搜尋姓名／代碼、點選加入的多選 chips 元件。實作重點：

- **一次抓全部、之後全在瀏覽器篩選**，不是每打一個字就打一次 API。共通管理 User API（`/v1/users.json`／`/v1/organizations.json`／`/v1/groups.json`）不支援關鍵字模糊搜尋，只能用 `codes`/`ids`/`size`/`offset` 精確查或分頁列舉，所以 `ccFetchAllPages(kind)` 用 `size=100` + `offset` 分頁把整份名單（使用者／部門／群組）抓完（上限 50 頁＝5000 筆，與 runtime `ccFetchUsersAll` 的上限一致），`ensureCcDirectory(kind)` 快取結果到 `CC_DIRECTORY[kind]`（`idle`／`loading`／`done`／`error` 四態），同一次設定畫面 session 只抓一次。抓的時候直接用 `fetch` + `Authorization: Bearer`，理由與「測試連線」相同：這裡是外掛設定畫面，`kintone.plugin.app.proxy` 在這個情境下不可靠（見上一節）。
- **`searchAddInput(options, onPick, placeholder)`**：套用既有的 `.sda-ss-*` 樣式（跟規則編輯器的 `searchableSelect`／`fieldCombo` 同一組 CSS，設定畫面視覺一致），差別是「選中即呼叫 `onPick` 並清空輸入框」而非「設成目前值」——這樣才能連續加好幾個人不用重新點欄位。列表本身也做了 50 筆的顯示上限，避免大型租戶一次渲染幾千個 `<div>`。
- **`renderCodePicker(kind, arr)`**：已選的項目顯示成 chip（帶 ✕ 移除鍵），下拉排除已選項目（`dirEntry.opts.filter(o => !arr.includes(o.v))`），避免選兩次。**沒有共通管理 API 權杖時**直接退化成一個「輸入完整代碼、按 Enter 新增」的純文字框——不擋住整個功能，只是失去搜尋能力；沒填權杖也想先把已知代碼打進去的情境仍然可行。chip 上的名稱若名單還沒載入完成，先顯示「代碼（尚未載入名稱）」，名單載入後 `render()` 會補上正確姓名。

**runtime 流程（`openCreatorCheckPanel`）**

1. `/k/v1/app/form/fields.json` 取欄位 metadata（label／type／下拉選項）。
2. **探測一筆記錄認出「建立人」的欄位代碼**：內建欄位代碼會隨 App 建立語系而異（中文 `建立人` / 日文 `作成者` / 英文 `Created_by`），且沒放到表單上時 `form/fields.json` 不一定查得到；`records.json` 一定會回內建欄位，所以用 `limit 1` 撈一筆、找 `type === 'CREATOR'` 的 key，再退回 `form/fields.json`，最後才逐一試 `CC_CREATOR_FALLBACK_CODES`（`建立人` 優先）。同時這一步也負責「沒有記錄」的早退。
3. `ccFetchRecords`：`kintone.app.getQueryCondition()`（手機版走 `kintone.mobile.app`）+ `limit/offset` 分頁，只取需要的 `fields`（`$id`／`$revision`／建立人／設定的顯示欄位），累積到 `maxRecords` 為止。`getQueryCondition()` 不含 `order by`／`limit`，可直接串接。
4. `ccFetchUsers`：`/v1/users.json?codes[]=…&size=100`。`size` 上限是 100，所以 codes 也以 100 為一批（`chunk(codes, 100)`）並明示 `size=100`——依賴對方的預設值等於把批次大小的正確性交給別人。回傳裡沒有的 code＝共通管理已刪除（`gone`）；`valid === false`＝停用（`off`）。
   **退路 `ccFetchUsersAll`**：codes 查詢整批拋錯時（例如某個 code 已刪除而 API 直接回錯而不是略過），改成 `size=100` + `offset` 分頁把全部使用者列出來，上限 50 頁（5000 人）。慢，但不受「查不到的 code」影響。
5. `ccEvaluateRights`：`/k/v1/records/acl/evaluate.json`（一次最多 100 筆 ids）取每筆的 `editable`／`deletable`。查詢失敗時該批視為可編輯可刪除——最終仍由 kintone 擋，寧可讓使用者撞到真正的錯誤訊息，也不要因為輔助查詢失敗就把整個功能鎖死。
6. 建表、掛事件、`SdaDialog.showPanel()`。有實際改動過（`needsReload`）才在關閉後 `location.reload()`。

表格第一欄固定是「記錄編號」（`row.id`），做成 `<a target="_blank" rel="noopener">` 連到 `${location.origin}/k/${appId}/show#record=${row.id}`——點了在新分頁開啟該筆記錄詳細畫面，方便核對異常帳號時直接跳過去看記錄內容（v1.17.3）。純前端組字串，不額外打 API；連結本身沒有欄位權限或 App 存取權判斷，實際能不能看到該筆記錄仍由 kintone 原生的記錄／App 權限決定。

**權限模型：記錄操作一律用操作者 session**

讀取（`records.json`）、更新（`PUT records.json`）、刪除（`DELETE records.json`）全部走 `kintone.api`，**不經 `apiWithToken`、不套任何 App Token**。這是刻意的：這顆按鈕是給人操作的批次工具，能看到什麼、能改能刪什麼，必須完全等同他本來的權限。共通管理權杖只用來讀帳號狀態，不會擴大任何記錄權限。

**就地編輯的型別白名單**

`CC_EDITABLE_TYPES`（v1.17.5 起）＝所有「非系統、API 可寫」的型別：`SINGLE_LINE_TEXT`、`MULTI_LINE_TEXT`、`RICH_TEXT`、`NUMBER`、`LINK`、`DROP_DOWN`、`RADIO_BUTTON`、`CHECK_BOX`、`MULTI_SELECT`、`DATE`、`TIME`、`DATETIME`、`USER_SELECT`、`ORGANIZATION_SELECT`、`GROUP_SELECT`。`config.js` 的 `CREATOR_CHECK_EDITABLE_TYPES` **必須與它一致**，否則設定畫面說可以編、實際卻是唯讀。
不在清單內而唯讀的：系統欄位（`RECORD_NUMBER`／`CREATOR`／`MODIFIER`／`CREATED_TIME`／`UPDATED_TIME`／`STATUS`／`STATUS_ASSIGNEE`／`CATEGORY`）與 `CALC`（API 不能寫）；`FILE`、`SUBTABLE` 雖可由 API 寫，但需上傳檔案／整張子表列結構，塞進單列表格不實際，維持唯讀。

**依型別的編輯器（`ccMakeEditor`）**

| 型別 | 編輯器 | 送出的 value 形狀 |
|---|---|---|
| Lookup 欄位（`field.lookup` 存在，不論 `SINGLE_LINE_TEXT`／`NUMBER`） | `ccPicker` 單選；`ccLookupSearch` 以操作者 session 查 `lookup.relatedApp`：`(filterCond) and 關鍵欄位 like "關鍵字" order by sort limit 30`，選單附帶 `lookupPickerFields` 前 3 個欄位當副標。關鍵欄位型別由關聯 App 的 `form/fields.json` 判斷（快取一次）：文字類用 `like`，數值類只接受數字並用 `=`，留空列出前 30 筆 | 字串；kintone 存檔時會自己執行 Lookup 並帶入對應欄位 |
| `DROP_DOWN`／`RADIO_BUTTON` | `ccPicker` 單選，選項過濾；`RADIO_BUTTON` 不可清空（沒有 × 鍵） | 字串 |
| `CHECK_BOX`／`MULTI_SELECT` | `ccPicker` 複選 chips，已選的選項不再出現在選單 | 字串陣列 |
| `USER_SELECT`／`ORGANIZATION_SELECT`／`GROUP_SELECT` | `ccPicker` 複選；有共通管理 API 權杖時 `ccDirectory(type)` 分頁抓整份名單（`users.json`／`organizations.json`／`groups.json`，上限 50 頁，快取 promise，失敗會清快取下次重抓），依姓名或代碼過濾，**已停用（`valid=false`）的使用者不列入**；沒有權杖時退化成「輸入完整代碼按 Enter」 | `[{ code }]` |
| `DATETIME` | `input[type=datetime-local]`；顯示時 ISO → 本地時間，送出時本地時間 → `toISOString()` 去掉毫秒 | `YYYY-MM-DDTHH:mm:ssZ`（UTC） |
| `MULTI_LINE_TEXT`／`RICH_TEXT` | `textarea`（`RICH_TEXT` 直接編 HTML 原始碼） | 字串 |
| 其他（文字／數值／連結／日期／時間） | 原生 `input` | 字串 |

`DATE` → `input[type=date]`、`TIME` → `input[type=time]`，kintone 的值格式（`YYYY-MM-DD`／`HH:mm`）與原生控件完全一致，不需轉換。

**`ccPicker` 下拉選單定位**：選單 `append` 到 `document.body` 並用 `position:fixed`（z-index 100100，高於面板的 100000），因為表格外層 `.sda-panel-scroll` 是 `overflow:auto`，放在格子裡會被裁掉。捲動時（capture 監聽所有捲動）**跟著輸入框重新定位而不是關閉**——點進一個部分在畫面外的欄位時，瀏覽器會自動把表格捲過去，若捲動就關閉，選單會一閃即逝。選項用 `mousedown` + `preventDefault` 觸發，避免先觸發輸入框 blur 把選單關掉。整個 `.sda-pick` 框（含 chip 與空白處，× 鍵除外）的 `mousedown` 都會把焦點導到輸入框並開選單（v1.17.6）——否則只有 chip 旁那一小段輸入框能點，使用者會以為欄位不能改。

**dirty 判定（`ccNormValue`）**：陣列值比較時取每個元素的 `code`（物件）或字串本身、排序後比對，所以使用者把值改掉又改回原樣，該列不會被當成待儲存，也不會被送出。

**批次寫入**

`PUT /k/v1/records.json` 每批 100 筆，帶 `revision`（樂觀鎖；別人同時改過就讓它失敗，比默默覆蓋好）。成功後把回傳的新 `revision` 寫回列狀態、清掉 `dirty`，所以同一個視窗裡可以連續存好幾次。每批獨立 try/catch，一批失敗不影響其他批，訊息列顯示成功筆數與第一個錯誤。

**`SdaDialog.showPanel()`（`dialog.js`）**

`show()` 的表格版：內容是呼叫端給的 `HTMLElement`，面板只負責標題、外框、關閉鍵。有 `window.Swal` 就用 `Swal.fire({ html: node })`，沒有就用內建 `.sda-pnl` 覆蓋層；`onReady({ close })` 讓呼叫端拿到程式化關閉的手把。

- **動作鍵一律做在 content 裡，不做成面板按鈕**：SweetAlert2 同時只能開一個視窗，在面板裡再 `fire` 一次確認框會把面板整個換掉。所以刪除的二次確認用**行內紅色確認條**（`.sda-panel-confirm`），不用嵌套視窗。
- SweetAlert2 那邊要另外把 `.swal2-html-container` 的 `white-space: pre` 解掉（提醒視窗需要 `pre`，表格需要 `normal`，不解會把儲存格硬撐開）——這就是 `.sda-swal-panel` 這個額外 class 存在的唯一原因。
- 表格樣式（`.sda-panel-*`）與提醒視窗共用同一個 `<style id="sda-dlg-style">`，`PANEL_CSS` 接在 `buildCss()` 的輸出裡，兩種渲染器都吃得到。

**對外暴露**

```js
const { users } = await window.NXSdaUserApi.get('users.json', { codes: ['a', 'b'] });
const orgs      = await window.NXSdaUserApi.get('user/organizations.json', { code: 'a' });
```

`get(path, params)` 走同一組代理設定（`/v1/` 前置的 GET），所以 App 自訂 JS 也能查帳號／組織而不接觸權杖。陣列參數自動展開成 `key[]=`。

---

*如有問題請聯繫系統管理員或工程師。*
