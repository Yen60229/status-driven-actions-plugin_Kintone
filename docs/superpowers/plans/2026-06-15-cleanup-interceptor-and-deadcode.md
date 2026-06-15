# 清理攔截器與死碼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除全域 fetch/XHR 攔截器與伺服器時間網路請求，log 改走 kintone 官方事件（方案 A），並清掉連帶死碼。

**Architecture:** 所有 runtime 變更集中在 `contents/dist/desktop.js`，全部改完後整檔覆蓋 `contents/dist/mobile.js`（兩者須位元組相同）。設定畫面 `config.js` 不動。log 失敗仍由事件層 `loggedApply` 記錄；成功改由 `process.proceed` 樂觀記錄與 `*.submit.success` 官方事件記錄。

**Tech Stack:** 純 ES2017 IIFE、kintone JS API（`kintone.events.on`、`kintone.api`）、kintone plugin packer。無建置步驟、無測試框架。

> **驗證方式說明：** 本專案無自動化測試。每個任務以 Grep 驗證（符號與其引用已完全移除/新增），最後在裝有外掛的測試 App 上做一次手動回歸（Task 6）。所有編輯只動 `desktop.js`，`mobile.js` 於 Task 5 一次同步。
>
> **前置：** 已在分支 `cleanup/v1.5.0-remove-interceptor`。

---

### Task 1: 伺服器時間改用本機 `new Date()`，並移除 applyRules 內的空殼

**Files:**
- Modify: `contents/dist/desktop.js`（移除 135–174、改 372–373 / 378–380 / 463、改 841–855）

- [ ] **Step 1: 移除整組 server-time 定義（約 135–174 行）**

刪除下列整段（從 `const TIME_VALUE_SOURCES` 起，到 `getServerTime` 的結尾 `};` 止）：

```js
  const TIME_VALUE_SOURCES = new Set(['now', 'today', 'nowTime']);
  const ruleNeedsServerTime = (rule) => {
    if (TIME_VALUE_SOURCES.has(rule.valueSource)) return true;
    if (rule.valueSource === 'appendSubtable') {
      const subRules = (rule.valueParam && rule.valueParam.subRules) || [];
      return subRules.some((sr) => TIME_VALUE_SOURCES.has(sr.valueSource));
    }
    if ((rule.fieldMapping || []).some((m) => TIME_VALUE_SOURCES.has(m.valueSource))) return true;
    if ((rule.keyMapping || []).some((m) => TIME_VALUE_SOURCES.has(m.valueSource))) return true;
    return false;
  };

  let _timeCache = { at: 0, value: null };
  const SERVER_TIME_CACHE_MS = 5000;
  const SERVER_TIME_TIMEOUT_MS = 500;

  const getServerTime = async () => {

    if (_timeCache.value && (Date.now() - _timeCache.at) < SERVER_TIME_CACHE_MS) {
      return _timeCache.value;
    }

    try {

      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), SERVER_TIME_TIMEOUT_MS);
      const res = await fetch(location.href, { method: 'HEAD', cache: 'no-store', signal: ctl.signal });
      clearTimeout(timer);
      const dateHeader = res.headers.get('Date');
      const t = dateHeader ? new Date(dateHeader) : new Date();
      _timeCache = { at: Date.now(), value: t };
      return t;
    } catch (e) {

      console.warn('[sda][getServerTime] fallback to local time:', e.name || e.message);
      const t = new Date();
      _timeCache = { at: Date.now(), value: t };
      return t;
    }
  };
```

- [ ] **Step 2: 改 `resolveValue` 的解構與時間值（約 373、378–380 行）**

找到：

```js
    const { event, record, serverTime } = ctx;
```

改為：

```js
    const { event, record } = ctx;
```

找到：

```js
      case 'today':         _resolvedValue = toISODate(serverTime || new Date()); break;
      case 'nowTime':       _resolvedValue = toHHmm(serverTime || new Date()); break;
      case 'now':           _resolvedValue = (serverTime || new Date()).toISOString(); break;
```

改為：

```js
      case 'today':         _resolvedValue = toISODate(new Date()); break;
      case 'nowTime':       _resolvedValue = toHHmm(new Date()); break;
      case 'now':           _resolvedValue = new Date().toISOString(); break;
```

- [ ] **Step 3: 改 `elapsedMinutes` 的 now（約 463 行）**

找到：

```js
        const now = serverTime || new Date();
```

改為：

```js
        const now = new Date();
```

- [ ] **Step 4: 改 `applyRules` 開頭，移除 needsTime/serverTime 與兩個空殼（約 841–855 行）**

找到：

```js
    const needsTime = CONFIG.rules.some((r) =>
      r.enabled !== false && triggerMatches(r, trigger) && ruleNeedsServerTime(r)
    );

    const serverTimePromise = needsTime ? getServerTime() : Promise.resolve(null);
    const editCheckPromise  = (trigger === 'process.proceed' && SELF_TOKEN && record.$id?.value)
      ? checkEditPermission(record.$id.value)
      : null;

    const serverTime = await serverTimePromise;
    if (trigger === 'process.proceed') {
    }
    (CONFIG.rules || []).forEach((r, i) => {
    });
    const ctx = { event, record, trigger, serverTime };
```

改為：

```js
    const editCheckPromise  = (trigger === 'process.proceed' && SELF_TOKEN && record.$id?.value)
      ? checkEditPermission(record.$id.value)
      : null;

    const ctx = { event, record, trigger };
```

- [ ] **Step 5: 驗證所有 server-time 符號已絕跡**

用 Grep 在 `contents/dist/desktop.js` 搜尋：
`getServerTime|_timeCache|SERVER_TIME_|ruleNeedsServerTime|TIME_VALUE_SOURCES|serverTimePromise|needsTime|serverTime`

Expected: **0 筆**。

- [ ] **Step 6: 驗證沒有殘留空殼**

用 Grep 在 `contents/dist/desktop.js` 搜尋：`forEach\(\(r, i\)`
Expected: **0 筆**。

- [ ] **Step 7: Commit**

```bash
git add contents/dist/desktop.js
git commit -m "refactor: 時間改用本機 new Date()，移除伺服器時間請求與 applyRules 空殼

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 移除全域 fetch/XHR 攔截器

**Files:**
- Modify: `contents/dist/desktop.js`（移除約 285–364 行整段攔截器）

- [ ] **Step 1: 刪除攔截器輔助函式與 monkey-patch（約 285–364 行）**

刪除從註解 `// ===== 網路攔截器` 起，到 XHR patch 區塊結尾（緊接 `const uuid = ...` 之前）止的整段，內容如下：

```js
  // ===== 網路攔截器：記錄 kintone 自身的記錄動作請求（簽核 / 存檔）成敗 =====
  // 這些動作發生在外掛 event handler return 之後，事件模型攔不到，必須包裝底層 fetch / XHR。
  // 只記「動作型」端點（updateWithStatus = 簽核+編輯、update、create、status），且僅 LOG_APP 有設定時。
  const ACTION_URL_RE = /\/k\/(api\/record\/(updateWithStatus|update|create)|v1\/record\/status)\b/;
  // 防遞迴：外掛自己寫 Log（postLog）也會發 fetch，期間設 true 讓攔截器跳過。
  let _logInFlight = false;

  const actionEventName = (url) => {
    if (/updateWithStatus/.test(url)) return 'kintone.proceed';
    if (/\/api\/record\/update/.test(url)) return 'kintone.update';
    if (/\/api\/record\/create/.test(url)) return 'kintone.create';
    return 'kintone.status';
  };

  const recordIdFromUrl = (url) => {
    const fromReq = /record(?:%3D|=)(\d+)/i.exec(url || '');
    if (fromReq) return fromReq[1];
    const fromPage = /[#&?]record(?:%3D|=)(\d+)/i.exec(window.location.href || '');
    return fromPage ? fromPage[1] : '';
  };

  const logKintoneAction = async (url, status, bodyText) => {
    if (!LOG_APP) return;
    const ok = status >= 200 && status < 300;
    const fakeErr = { message: bodyText || '' };
    const code = ok ? '' : errorCodeOf(fakeErr);
    const category = ok ? 'success' : classifyError(fakeErr);
    const trigger = actionEventName(url);
    const recId = recordIdFromUrl(url);
    const message = ok
      ? `HTTP ${status}：${trigger} 成功`
      : `[${code || 'no-code'}] HTTP ${status || 'network'}：${trigger} 失敗 ${String(bodyText || '').slice(0, 500)}`;
    _logInFlight = true;
    try {
      await writeLog({ ev: { recordId: recId }, trigger, result: ok ? '成功' : '失敗', category, message });
    } catch (e) {
      console.error('[sda] 攔截器寫 Log 失敗', e);
    } finally {
      _logInFlight = false;
    }
  };

  if (LOG_APP) {
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (...args) {
        const req = args[0];
        const url = (typeof req === 'string') ? req : (req && req.url) || '';
        const p = origFetch.apply(this, args);
        if (!_logInFlight && ACTION_URL_RE.test(url)) {
          p.then((res) => {
            res.clone().text()
              .then((t) => logKintoneAction(url, res.status, t))
              .catch(() => logKintoneAction(url, res.status, ''));
          }).catch((err) => logKintoneAction(url, 0, (err && err.message) || 'network error'));
        }
        return p;
      };
    }

    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      const origOpen = XHR.prototype.open;
      const origSend = XHR.prototype.send;
      XHR.prototype.open = function (method, url, ...rest) {
        this.__sda_url = url || '';
        return origOpen.call(this, method, url, ...rest);
      };
      XHR.prototype.send = function (...sendArgs) {
        const url = this.__sda_url || '';
        if (!_logInFlight && ACTION_URL_RE.test(url)) {
          this.addEventListener('loadend', () => {
            logKintoneAction(url, this.status, this.responseText || '');
          });
        }
        return origSend.apply(this, sendArgs);
      };
    }
  }
```

> 注意：保留其後的 `const uuid = ...` 與其前的 `writeLog` 結尾 `};`。只刪上面這段。

- [ ] **Step 2: 驗證攔截器符號已絕跡**

用 Grep 在 `contents/dist/desktop.js` 搜尋：
`ACTION_URL_RE|_logInFlight|actionEventName|recordIdFromUrl|logKintoneAction|window\.fetch|__sda_url|XMLHttpRequest`

Expected: **0 筆**。

- [ ] **Step 3: Commit**

```bash
git add contents/dist/desktop.js
git commit -m "refactor: 移除全域 fetch/XHR 攔截器（改用官方事件記 log）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> 此 commit 後，成功 log 暫時停止（原由攔截器負責），失敗 log 仍正常。Task 3 補回成功 log。

---

### Task 3: 以方案 A 補回成功 log（proceed 樂觀 + submit.success 官方事件）

**Files:**
- Modify: `contents/dist/desktop.js`（改寫 `loggedApply`，約原 967–998 行；新增 success 事件註冊，約原 1016–1018 行附近）

- [ ] **Step 1: 改寫 `loggedApply` 並新增 `_pendingSubmitLog` / `flushSubmitLog`**

找到整段 `loggedApply`（從 `const loggedApply = (trigger) => async (ev) => {` 到其結尾 `};`）：

```js
  const loggedApply = (trigger) => async (ev) => {
    _runInfo = { matched: 0, labels: [] };
    let out;
    let thrown = null;
    try {
      out = await applyRules(trigger, ev);
    } catch (err) {
      thrown = err;
      console.error('[sda]', err);
      if (ev && ev.type) recordError(ev, err, '');
      out = ev;
    }
    const errored = !!(ev && ev.error);
    // 簽核(proceed)的成敗改由網路攔截器（updateWithStatus）記錄，避免一次簽核出現兩筆。
    // 但「規則錯誤導致簽核被中止」時 kintone 不會送出 updateWithStatus、攔截器看不到，這裡仍要補記。
    // 成功一律由網路攔截器（來源 B）記錄，A 只補記「規則出錯擋住動作」的失敗。
    if (LOG_APP && (_runInfo.matched > 0 || thrown) && errored) {
      const info = _runInfo.error;
      const category = errored ? (info ? info.category : 'system') : 'success';
      const message = errored
        ? (info
            ? `[${info.code || 'no-code'}] ${info.rule ? '規則「' + info.rule + '」: ' : ''}${info.rawMessage}`
            : String(ev.error))
        : `已套用 ${_runInfo.matched} 條規則：${_runInfo.labels.join('、')}`;
      try {
        await writeLog({ ev, trigger, result: errored ? '失敗' : '成功', category, message });
      } catch (e) {
        console.error('[sda] writeLog failed（請確認 Log App ID / Token / 欄位代碼是否正確）', e);
      }
    }
    return out;
  };
```

整段替換為：

```js
  // 待確認的存檔成功 log：submit 階段先暫存，待 *.submit.success 確認存檔後才寫。
  let _pendingSubmitLog = null;

  const successLogMessage = (matched, labels) => `已套用 ${matched} 條規則：${labels.join('、')}`;

  const failureLogMessage = (ev) => {
    const info = _runInfo.error;
    return info
      ? `[${info.code || 'no-code'}] ${info.rule ? '規則「' + info.rule + '」: ' : ''}${info.rawMessage}`
      : String(ev && ev.error);
  };

  const loggedApply = (trigger) => async (ev) => {
    _runInfo = { matched: 0, labels: [] };
    if (/submit/.test(trigger)) _pendingSubmitLog = null;

    let out;
    let thrown = null;
    try {
      out = await applyRules(trigger, ev);
    } catch (err) {
      thrown = err;
      console.error('[sda]', err);
      if (ev && ev.type) recordError(ev, err, '');
      out = ev;
    }

    const errored = !!(ev && ev.error);
    if (!LOG_APP) return out;

    // 失敗：規則出錯擋下動作（含丟例外）。proceed 與 submit 皆於此即時記錄。
    if (errored && (_runInfo.matched > 0 || thrown)) {
      const info = _runInfo.error;
      try {
        await writeLog({
          ev, trigger, result: '失敗',
          category: info ? info.category : 'system',
          message: failureLogMessage(ev),
        });
      } catch (e) {
        console.error('[sda] writeLog failed（請確認 Log App ID / Token / 欄位代碼是否正確）', e);
      }
      return out;
    }

    // 成功且有命中規則：
    //   proceed → 樂觀記錄（kintone 無 process.proceed.success 事件可掛）。
    //   submit  → 暫存，待 *.submit.success 確認存檔成功後再寫（見 flushSubmitLog）。
    if (!errored && _runInfo.matched > 0) {
      if (trigger === 'process.proceed') {
        try {
          await writeLog({
            ev, trigger, result: '成功', category: 'success',
            message: successLogMessage(_runInfo.matched, _runInfo.labels),
          });
        } catch (e) {
          console.error('[sda] writeLog failed', e);
        }
      } else if (/submit/.test(trigger)) {
        _pendingSubmitLog = { trigger, matched: _runInfo.matched, labels: _runInfo.labels.slice() };
      }
    }
    return out;
  };

  const flushSubmitLog = async (ev) => {
    if (!LOG_APP || !_pendingSubmitLog) return;
    const { trigger, matched, labels } = _pendingSubmitLog;
    _pendingSubmitLog = null;
    try {
      await writeLog({
        ev, trigger, result: '成功', category: 'success',
        message: successLogMessage(matched, labels),
      });
    } catch (e) {
      console.error('[sda] writeLog failed', e);
    }
  };
```

- [ ] **Step 2: 註冊 `*.submit.success` 事件**

找到既有的 submit 註冊（約原 1016–1020 行）：

```js
  kintone.events.on(E(['create.submit']), loggedApply('create.submit'));

  kintone.events.on(E(['edit.submit']), loggedApply('edit.submit'));

  kintone.events.on(E(['detail.process.proceed']), loggedApply('process.proceed'));
```

在其後緊接新增：

```js
  kintone.events.on(E(['create.submit.success']), async (ev) => { await flushSubmitLog(ev); return ev; });

  kintone.events.on(E(['edit.submit.success']), async (ev) => { await flushSubmitLog(ev); return ev; });
```

- [ ] **Step 3: 驗證新符號存在、舊註解已移除**

用 Grep 在 `contents/dist/desktop.js` 搜尋 `flushSubmitLog`，Expected: **3 筆**（定義 1 + 兩個 success handler 呼叫 2）。
用 Grep 搜尋 `submit.success`，Expected: **2 筆**。
用 Grep 搜尋 `來源 B|網路攔截器`，Expected: **0 筆**。

- [ ] **Step 4: Commit**

```bash
git add contents/dist/desktop.js
git commit -m "feat: 方案 A — proceed 樂觀記成功、存檔由 *.submit.success 記成功

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 移除 statusMatches 內無法觸及的 detail.show 分支

**Files:**
- Modify: `contents/dist/desktop.js`（約原 654–656 行）

- [ ] **Step 1: 移除 `case 'detail.show':` 標籤**

找到：

```js
      case 'edit.show':
      case 'edit.submit':
      case 'detail.show':
      default: {
```

改為：

```js
      case 'edit.show':
      case 'edit.submit':
      default: {
```

> 只移除 `detail.show` 標籤；該 `default` 區塊邏輯不變。`detail.show` 事件本身的 `handleDetailShow`（補償寫入入口）不在此檔此處，不受影響。

- [ ] **Step 2: 驗證**

用 Grep 在 `contents/dist/desktop.js` 搜尋 `case 'detail.show'`，Expected: **0 筆**。
用 Grep 搜尋 `handleDetailShow`，Expected: **2 筆**（定義 + 事件註冊，確認補償寫入入口仍在）。

- [ ] **Step 3: Commit**

```bash
git add contents/dist/desktop.js
git commit -m "refactor: 移除 statusMatches 內無法觸及的 detail.show 分支

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 同步 mobile.js、提升版本、更新 README

**Files:**
- Overwrite: `contents/dist/mobile.js`（內容 = `desktop.js`）
- Modify: `contents/manifest.json:3`
- Modify: `README.md`

- [ ] **Step 1: 用 desktop.js 覆蓋 mobile.js**

PowerShell：

```powershell
Copy-Item "contents\dist\desktop.js" "contents\dist\mobile.js" -Force
```

- [ ] **Step 2: 驗證兩檔完全相同**

PowerShell（無輸出代表相同）：

```powershell
if ((Get-FileHash contents\dist\desktop.js).Hash -ne (Get-FileHash contents\dist\mobile.js).Hash) { Write-Error "FILES DIFFER" } else { "IDENTICAL" }
```

Expected: `IDENTICAL`。

- [ ] **Step 3: 提升 manifest 版本至 1.5.0**

`contents/manifest.json` 找到：

```json
  "version": "1.4.3",
```

改為：

```json
  "version": "1.5.0",
```

- [ ] **Step 4: 更新 README — B-2 的 setTimeout 描述**

找到（約 520 行）：

```
- **無** `setInterval`／輪詢／常駐迴圈；唯一的 `setTimeout` 是 `setFieldShown` 的下一個 tick（0ms）與伺服器時間 500ms 逾時保護。
```

改為：

```
- **無** `setInterval`／輪詢／常駐迴圈；唯一的 `setTimeout` 是 `setFieldShown` 的下一個 tick（0ms）。
```

- [ ] **Step 5: 更新 README — 改寫 B-5（伺服器時間 → 本機時間）**

找到整段 B-5（約 539–541 行）：

```
### B-5. 伺服器時間

`getServerTime()` 對 `location.href` 發 `HEAD` 取回應的 `Date` header，避免使用者端時區/時鐘誤差。5 秒快取、500ms 逾時則退回本機時間。**Lazy**：只有當命中規則真的需要 `now`/`today`/`nowTime` 時才呼叫。
```

改為：

```
### B-5. 時間來源

`now`/`today`/`nowTime` 直接取自瀏覽器本機時鐘（`new Date()`），不發任何網路請求。早期版本曾以對 `location.href` 發 `HEAD` 取伺服器 `Date` header 來避開使用者端時鐘誤差，v1.5.0 起移除，換取簽核/存檔當下少一趟網路往返。
```

- [ ] **Step 6: 更新 README — 改寫攔截器相關說明（來源 B）**

用 Grep 在 `README.md` 搜尋 `攔截器|來源 B|updateWithStatus|網路攔截`，逐處將「以網路攔截器記錄原生簽核/存檔成敗」的敘述，改述為方案 A：

- 失敗（規則出錯擋住動作）由事件層即時記錄；
- 簽核成功由 `process.proceed` 處理當下樂觀記錄；
- 存檔成功由官方 `create.submit.success`／`edit.submit.success` 事件記錄。

並將提及 v1.4.0「新增網路攔截器」之段落標註為 v1.5.0 已改為事件層方案 A。確保 README 內不再有「攔截器／來源 B」字樣殘留（Grep 應為 0 筆）。

- [ ] **Step 7: Commit**

```bash
git add contents/dist/mobile.js contents/manifest.json README.md
git commit -m "chore: 同步 mobile.js、版本進 1.5.0、README 改述方案 A

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 手動回歸驗證（裝有外掛的測試 App）

**Files:** 無（人工操作 + 重新打包）

> 需要使用者提供測試環境與簽章 `.ppk`。此任務為驗收，逐項對照 spec 第五節。

- [ ] **Step 1: 重新打包**

```bash
npx @kintone/plugin-packer contents --ppk <你的.ppk> --out plugin.zip
```

Expected: 產生 `plugin.zip`，無錯誤。

- [ ] **Step 2: 上傳更新外掛並更新各使用 App**（依 README 第 7 節）

- [ ] **Step 3: 逐項驗證**（對照 spec 第五節）

1. 存檔成功 → Log App 新增一筆「成功」，訊息列出命中規則。
2. 存檔失敗（故意設錯欄位代碼）→ Log「失敗」+ 分類。
3. 簽核成功 → Log「成功」。
4. 簽核失敗（規則出錯擋下）→ Log「失敗」。
5. `today`/`now`/`nowTime` 值正確；F12 Network 不再有對 `location.href` 的 `HEAD`。
6. F12 Console `window.fetch.toString()` → 原生 `[native code]`。
7. 回歸：補償寫入、子表履歷、欄位條件、跨 App 寫入行為與改前一致。

- [ ] **Step 4: 完成 finishing-a-development-branch**

全部通過後，依 superpowers:finishing-a-development-branch 決定合併/PR/收尾。

---

## Self-Review

**Spec coverage：**
- 移除全域攔截器 → Task 2 ✓
- 方案 A log（submit.success / proceed 樂觀）→ Task 3 ✓
- 時間改本機 → Task 1 ✓
- 死碼（攔截器組、server-time 組、空迴圈、detail.show 分支）→ Task 2 / Task 1 / Task 1 / Task 4 ✓
- 保留 reload、handleDetailShow、triggerMatches、recIdFromPage → 未被任何任務移除，Task 2/4 並以 Grep 確認 handleDetailShow 仍在 ✓
- mobile.js 同步、manifest 1.5.0、README 更新、重新打包 → Task 5 / Task 6 ✓

**Placeholder scan：** 無 TBD/TODO；所有程式碼步驟均含完整片段。`<你的.ppk>` 為使用者環境變數，非佔位符疏漏。

**Type/名稱一致性：** `_pendingSubmitLog`、`flushSubmitLog`、`successLogMessage`、`failureLogMessage` 於 Task 3 定義並使用；`successLogMessage(matched, labels)` 兩處呼叫簽名一致。`ctx` 於 Task 1 去掉 `serverTime` 後，`resolveValue` 解構同步調整，無殘留引用（Step 5 Grep 把關）。
