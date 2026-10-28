# 附件跨記錄複製（copyAttachment）設計 spec

> 日期：2026-07-15
> 狀態：**已實作 v1.14.0**（需求方拍板：接受 session 模式、雙向都做）。實作見 README 附錄 B-6a。
> 觸發限制：僅 `create.submit.success` / `edit.submit.success`（已於 v1.13.0 加入 success 觸發）

---

## 1. 需求

規則能把「某筆記錄的附件欄位的檔案本身」複製到另一筆記錄的附件欄位（不是複製 metadata，是真的搬檔案）。典型場景：存檔後把來源單（請購/庶務/出差）的發票附件搬進本筆請款單，或反向。

---

## 2. kintone 硬限制與可行性結論（**最重要，先讀**）

kintone **沒有**「把 A 記錄的 fileKey 直接寫進 B 記錄」的 API。附件欄位裡的 `fileKey` 是**下載用的一次性 key，不能拿去寫入別筆記錄**。真的要搬檔案，只有一條路：

```
① 讀來源記錄附件欄位 → 取得 [{fileKey, name, contentType, size}, ...]
② 逐檔下載： GET /k/v1/file.json?fileKey=<來源key>   → 拿到 binary(blob)
③ 逐檔上傳： POST /k/v1/file.json (multipart/form-data) → 拿到「新的上傳 fileKey」
④ 寫入目標記錄附件欄位 = [{ fileKey: 新key }, ...]   （這步是 JSON，可照常）
```

### 關鍵限制：步驟 ②③ 不能用外掛的 token/proxy

- **proxy 不吃 binary / multipart**：`kintone.plugin.app.proxy` 是為 JSON 設計的，回傳的 body 是「字串」，binary 下載會被破壞；multipart 上傳的 body 也無法正確傳遞。
- **加密 token 在 runtime 讀不到**：已遷移的 Token 存在 `setProxyConfig`，**只有 kintone 伺服器端**有；`desktop.js` 執行期根本拿不到 Token 值，無法自己組一個帶 Token 的 fetch。（唯一能讀到的是「舊版明文 Token」，但那正是我們要淘汰的東西，不能走回頭路。）

### ⇒ 結論：附件複製**只能靠登入者的 session（cookie）**

也就是說，**執行複製的那個人，必須同時對「來源 App」有檢視/下載權、對「目標 App」有編輯/上傳權**。

- 若請款單填寫人**本來就看得到來源單**（例如自己轉入的）→ 可行，用 session 即可，不需 Token。
- 若填寫人**對來源單沒有權限**（就是當初要用 Token 的原因）→ **純前端做不到**，需要後端（webhook / 服務帳號）代為搬檔，那就不是這個外掛的範疇了。

> 這是需求方要拍板的核心決策：**接受「session 模式：使用者需雙邊權限」，還是需要跨權限（就得走後端）？**

---

## 3. 設計方案（假設「session 模式」可接受）

### 3.1 新 valueSource：`copyAttachment`（僅 writeSelf / writeOther，且僅 submit.success 生效）

```jsonc
{
  "valueSource": "copyAttachment",
  "valueParam": {
    "from": {                         // 來源
      "app": "135",                   // 來源 App（省略或 "this" = 本記錄）
      "keyField": "請購單據編號",       // 來源查詢鍵欄位（app≠this 時必填）
      "keyExpr": "{請購單據編號}",       // 以本記錄欄位組 key；{欄位代碼} 會代換
      "attachmentField": "發票附件"     // 來源的附件欄位代碼
    },
    "onError": "log",                 // log(預設，跳過該檔) / block(整筆失敗)
    "maxFileSize": 10485760,          // 單檔上限(bytes)，預設 10MB；超過跳過並記錄
    "mode": "replace"                 // replace(覆蓋目標附件) / append(附加到既有附件)
  }
}
```
- `writeSelf`：目標 = 本記錄的 `targetField`（附件欄位）。
- `writeOther`：目標 = 目標 App 那筆的 `targetField`。
- 回傳值 = 新上傳 fileKey 陣列 `[{fileKey}, ...]`，交給 `writeToField`。

### 3.2 執行流程（實作要點）

1. **只在 submit.success 生效**：`resolveValue` 遇到 `copyAttachment` 但 `ctx.trigger` 不是 `*.submit.success` → 略過並 `console.warn`（附件搬移重、且需 $id，限定在 success）。
2. 解析來源記錄：`app==="this"|省略` 用 `ctx.record`；否則以 `keyExpr` 查來源 App 一筆（沿用 `lookupAcrossApp` 的查詢邏輯）。
3. 讀 `attachmentField` → 檔案清單。逐檔：
   - 下載：`fetch(kintone.api.url('/k/v1/file.json',true)+'?fileKey='+key, { headers:{'X-Requested-With':'XMLHttpRequest'}, credentials:'include' })` → `blob()`。（session；**不經 apiWithToken**，因為要 binary。）
   - 大小檢查：超過 `maxFileSize` → 依 `onError` 跳過或整筆失敗。
   - 上傳：`FormData` 塞 blob（帶原檔名）→ `fetch(kintone.api.url('/k/v1/file.json',true), { method:'POST', headers:{'X-Requested-With':'XMLHttpRequest'}, credentials:'include', body: form })` → `{fileKey: 新key}`。
4. 收集新 fileKey 陣列回傳。
5. `writeToField` 加一個「附件」寫入分類：`target.value = mode==='append' ? [...既有, ...新] : 新`。

### 3.3 `writeToField` / `classifyWrite` 調整

- 目前 `classifyWrite` 只分 userObject / arrayField / scalar。附件值是 `[{fileKey,...}]` 物件陣列，需新增判別：若 raw 是 `[{fileKey}]` 形狀 → 走「附件寫入」分支，直接指派（不做去重字串化）。

### 3.4 設定畫面

- `VALUE_SOURCES` / `MAPPING_VALUE_SOURCES` 加 `copyAttachment`（JSON 參數，附 placeholder 範例）。
- 提示：此來源只在「存檔後」觸發生效，且需登入者對來源/目標雙邊有權限。

---

## 4. 錯誤處理 / 邊界

- 來源無附件 / 欄位不存在 → 回空陣列，`mode:replace` 會清空目標、`append` 則不動（需在 spec 決定；建議「來源空就不動目標」以免誤清）。
- 部分檔案失敗（下載/上傳其一）→ 依 `onError`：`log` 跳過該檔續跑、`block` 整筆規則失敗（但因在 success，**不回滾已存檔的主記錄**，只是目標附件沒寫成，需記 Log 供人工補）。
- 大量/大檔：submit.success 同步等待多檔上傳會卡存檔後畫面；建議加總量上限（檔數 × 大小）與逾時。
- 冪等：success 可能因重試重複觸發 → `mode:replace` 天然冪等；`append` 需去重（比對檔名+size）避免重複附加。

---

## 5. 開放問題（需拍板）

1. **權限模型**：接受「session 模式（使用者需雙邊權限）」？還是必須跨權限（→ 改後端，本外掛不做）？← **最關鍵**
2. 複製方向以哪個為主：來源單附件 → 本請款單（writeSelf），還是本請款單 → 來源單（writeOther）？（兩者都設計得出來，但先確認主場景以便先做。）
3. `mode` 預設 replace 還是 append？來源空時是否清空目標？
4. 單檔/總量上限數字。

---

## 6. 影響檔案（實作時）

- `contents/dist/desktop.js`：`resolveValue` 加 `copyAttachment` case、`downloadFile`/`uploadFile` helper、`classifyWrite`/`writeToField` 附件分支、submit.success guard。同步 `mobile.js`。
- `contents/dist/config.js`：`VALUE_SOURCES` / `MAPPING_VALUE_SOURCES` 加項 + placeholder。
- `manifest.json` / `config.js` 版本 +（預計 1.14.0）。
- `README.md` 附錄 B 新增小節。
