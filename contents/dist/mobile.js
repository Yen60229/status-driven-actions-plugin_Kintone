(() => {
  'use strict';

  const PLUGIN_ID = kintone.$PLUGIN_ID;

  const rawConfig = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  let CONFIG;
  try {
    CONFIG = JSON.parse(rawConfig.data || '{"rules":[],"tokens":[],"selfAppToken":""}');
  } catch (e) {
    console.error('[sda] config parse failed', e);
    CONFIG = { rules: [], tokens: [], selfAppToken: '' };
  }

  (CONFIG.rules || []).forEach((r) => {
    if (typeof r.valueParam === 'string') {
      const t = r.valueParam.trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        try {
          r.valueParam = JSON.parse(t);
        } catch (e) {
          console.warn(`[sda][config] valueParam JSON parse FAILED for rule "${r.label||r.id}": ${e.message}. Raw:`, t);
        }
      }
    }

    if (r.valueParam && Array.isArray(r.valueParam.subRules)) {
      r.valueParam.subRules.forEach((sr) => {
        if (typeof sr.valueParam === 'string') {
          const t = sr.valueParam.trim();
          if (t.startsWith('{') || t.startsWith('[')) {
            try { sr.valueParam = JSON.parse(t); } catch (e) {  }
          }
        }
      });
    }
  });

  Object.freeze(CONFIG);

  // ---------- TOKEN MODEL ----------
  // API Token 一律不以明文存在設定檔（getConfig 可被任何使用者讀取）。正式作法：
  // Token 存在外掛代理設定（setProxyConfig，加密於 kintone 伺服器），執行期以
  // kintone.plugin.app.proxy() 由伺服器端注入，瀏覽器永遠看不到 Token。
  // 這裡只保留「非機密」中繼資料：哪些 App 有設定 Token（用來決定要不要走代理）。
  //
  // 舊版相容：更新程式後、管理者尚未重新儲存設定前，設定檔仍可能帶有明文 Token。
  // 此時沿用舊的 fetch 直送路徑，確保功能不中斷；管理者一旦重新儲存，Token 就會搬進
  // 加密代理設定，之後這條舊路徑不再被觸發（RAW_* 皆為空）。
  const LOG_APP = String(CONFIG.logAppId || '').trim();

  const RAW_TOKENS = (CONFIG.tokens || []).reduce((m, t) => {
    if (t && t.appId && t.token) m[String(t.appId)] = t.token;
    return m;
  }, {});
  const RAW_SELF_TOKEN = CONFIG.selfAppToken || '';
  const RAW_LOG_TOKEN = String(CONFIG.logToken || '').trim();
  if (LOG_APP && RAW_LOG_TOKEN) RAW_TOKENS[LOG_APP] = RAW_LOG_TOKEN;

  // 已搬進加密代理設定的目標 App（新版設定會在每個有 Token 的列標記 secured:true）
  const SECURED_APP_IDS = new Set(
    (CONFIG.tokens || []).filter((t) => t && t.appId && t.secured).map((t) => String(t.appId))
  );
  const HAS_SECURED_SELF = CONFIG.hasSelfToken === true;
  if (LOG_APP && CONFIG.hasLogToken === true) SECURED_APP_IDS.add(LOG_APP);

  // 本 App 是否有可用的補償 Token（明文舊值或加密新值皆算）— 決定是否啟用補償寫入流程
  const HAS_SELF_TOKEN = !!RAW_SELF_TOKEN || HAS_SECURED_SELF;

  const APP_NS = (() => {
    try { return kintone.app; } catch (e) { return null; }
  })();
  const MOBILE_NS = (() => {
    try { return kintone.mobile && kintone.mobile.app; } catch (e) { return null; }
  })();

  const getRecord = () => {
    if (APP_NS && APP_NS.record && APP_NS.record.get) return APP_NS.record.get().record;
    if (MOBILE_NS && MOBILE_NS.record && MOBILE_NS.record.get) return MOBILE_NS.record.get().record;
    return null;
  };

  const setFieldShown = (code, visible) => {

    const tryCall = (tag) => {
      let called = 0;
      const desktop = (typeof kintone !== 'undefined') && kintone.app && kintone.app.record && kintone.app.record.setFieldShown;
      const mobile  = (typeof kintone !== 'undefined') && kintone.mobile && kintone.mobile.app && kintone.mobile.app.record && kintone.mobile.app.record.setFieldShown;
      if (desktop) {
        try { kintone.app.record.setFieldShown(code, visible); called++; }
        catch (e) { console.warn(`[sda][setFieldShown ${tag}] desktop "${code}" failed:`, e.message); }
      }
      if (mobile) {
        try { kintone.mobile.app.record.setFieldShown(code, visible); called++; }
        catch (e) { console.warn(`[sda][setFieldShown ${tag}] mobile "${code}" failed:`, e.message); }
      }
      if (!called) console.warn(`[sda][setFieldShown ${tag}] ⚠ no platform namespace available for "${code}"`);
    };

    tryCall('sync');
    setTimeout(() => tryCall('deferred'), 0);
  };

  const getAppId = () => {
    if (APP_NS && APP_NS.getId) return String(APP_NS.getId());
    if (MOBILE_NS && MOBILE_NS.getId) return String(MOBILE_NS.getId());
    return '';
  };

  const SESSION_EXPIRED_MESSAGE = '登入已逾時，請開「新分頁」重新登入 kintone 後，回到本頁再執行一次（已填寫的內容不會消失）。';
  const PERMISSION_DENIED_MESSAGE = '您沒有執行此操作的權限，請聯繫系統管理員確認權限或 API Token 設定。';

  const errorCodeOf = (err) => {
    if (err && err.code) return err.code;
    const msg = (err && err.message) || '';
    const fromJson = /"code"\s*:\s*"([A-Z0-9_]+)"/.exec(msg);
    if (fromJson) return fromJson[1];
    const fromText = /\b(CB_[A-Z0-9]+|GAIA_[A-Z0-9]+)\b/.exec(msg);
    return fromText ? fromText[1] : '';
  };

  const classifyError = (err) => {
    switch (errorCodeOf(err)) {
      case 'CB_AU01':
        return 'session';
      case 'GAIA_NO01': case 'GAIA_NO02': case 'CB_NO01': case 'CB_NO02': case 'GAIA_DA02':
        return 'permission';
      case 'GAIA_FE01': case 'GAIA_AP01': case 'GAIA_IQ11': case 'GAIA_IL26': case 'CB_IL02': case 'CB_VA01':
        return 'config';
      default:
        return 'system';
    }
  };

  const friendlyError = (err, prefix) => {
    switch (classifyError(err)) {
      case 'session':    return SESSION_EXPIRED_MESSAGE;
      case 'permission': return PERMISSION_DENIED_MESSAGE;
      default:           return `${prefix}: ${err.message}`;
    }
  };

  const safeHandler = (fn) => async (event) => {
    try { return await fn(event); }
    catch (err) {
      console.error('[sda]', err);
      if (event && event.type && /submit|process/.test(event.type)) {
        event.error = friendlyError(err, 'Status-Driven Actions error');
      }
      return event;
    }
  };

  const checkEditPermission = async (recordId) => {
    try {
      const resp = await kintone.api(
        kintone.api.url('/k/v1/records/acl/evaluate.json', true),
        'GET',
        { app: getAppId(), ids: [recordId] }
      );
      return resp.rights && resp.rights[0] && resp.rights[0].record.editable;
    } catch (e) {
      console.warn('[sda] checkEditPermission failed', e);
      return true;
    }
  };

  const pad = (n) => String(n).padStart(2, '0');
  const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toHHmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  // 帶權限的 REST API 呼叫（跨 App 寫入 / 補償寫入 / Log 寫入）。三種路徑依序判斷：
  //   1) 舊版明文 Token 仍在設定檔（尚未遷移）→ 沿用 fetch 直送，維持相容。
  //   2) Token 已加密存於代理設定 → 走 kintone.plugin.app.proxy，由伺服器端注入 Token，
  //      前端拿不到也看不到（代理設定以「網址前置比對」注入，故 /k/v1/ 底下皆涵蓋）。
  //   3) 該 App 沒有設定 Token → 用呼叫者本身的 session（kintone.api），行為與原本一致。
  const apiWithToken = async (path, method, body, appIdForToken) => {
    const sApp = String(appIdForToken);
    const isSelf = sApp === getAppId();

    // 1) 舊版明文 Token（遷移前的相容路徑；遷移後 RAW_* 皆空，不會進來）
    const rawToken = RAW_TOKENS[sApp] || (isSelf ? RAW_SELF_TOKEN : '');
    if (rawToken) {
      const url = kintone.api.url(path, true);
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Cybozu-API-Token': rawToken },
      };
      switch (method) {
        case 'GET': {
          const qs = new URLSearchParams();
          Object.entries(body || {}).forEach(([k, v]) => {
            if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x));
            else qs.append(k, v);
          });
          const r = await fetch(`${url}?${qs}`, opts);
          if (!r.ok) throw new Error(`API ${path} ${r.status}: ${await r.text()}`);
          return r.json();
        }
        default: {
          opts.body = JSON.stringify(body);
          const r = await fetch(url, opts);
          if (!r.ok) throw new Error(`API ${path} ${r.status}: ${await r.text()}`);
          return r.json();
        }
      }
    }

    // 2) 加密代理路徑：Token 由 kintone 伺服器注入，前端完全不接觸
    const secured = SECURED_APP_IDS.has(sApp) || (isSelf && HAS_SECURED_SELF);
    if (secured) {
      let url = kintone.api.url(path, true);
      let data = body;
      if (method === 'GET' || method === 'DELETE') {
        // 代理對 GET / DELETE 會忽略 data，參數需放在 query string
        const qs = new URLSearchParams();
        Object.entries(body || {}).forEach(([k, v]) => {
          if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x));
          else qs.append(k, v);
        });
        url = `${url}?${qs}`;
        data = {};
      }
      // proxy 回傳 [body(字串), status(數字), headers(物件)]；非 2xx 需自行判斷
      const [respBody, status] = await kintone.plugin.app.proxy(PLUGIN_ID, url, method, {}, data);
      if (status < 200 || status >= 300) throw new Error(`API ${path} ${status}: ${respBody}`);
      return respBody ? JSON.parse(respBody) : {};
    }

    // 3) 無 Token → 用呼叫者自身 session
    return kintone.api(kintone.api.url(path, true), method, body);
  };

  const LOG_FIELDS = {
    event:    'LOG_EVENT',
    result:   'LOG_RESULT',
    category: 'LOG_CATEGORY',
    app:      'LOG_APP',
    record:   'LOG_RECORD',
    user:     'LOG_USER',
    message:  'LOG_MESSAGE',
  };

  let _runInfo = { matched: 0, labels: [] };

  // 集中處理錯誤：設定畫面用的友善訊息 → event.error；技術細節 → _runInfo.error（供寫 Log）。
  const recordError = (event, err, ruleLabel) => {
    _runInfo.error = {
      category:   classifyError(err),
      code:       errorCodeOf(err) || '',
      rule:       ruleLabel || '',
      rawMessage: (err && err.message) || String(err),
    };
    event.error = friendlyError(err, ruleLabel || 'Status-Driven Actions error');
  };

  const postLog = (rec) =>
    apiWithToken('/k/v1/record.json', 'POST', { app: LOG_APP, record: rec }, LOG_APP);

  const writeLog = async ({ ev, trigger, result, category, message }) => {
    if (!LOG_APP) return;
    const u = (kintone.getLoginUser && kintone.getLoginUser()) || {};
    const recIdFromPage = () => {
      const m = /[#&?]record(?:%3D|=)(\d+)/i.exec(window.location.href || '');
      return m ? m[1] : '';
    };
    const recId = (ev && ev.recordId) ||
      (ev && ev.record && ev.record.$id && ev.record.$id.value) ||
      recIdFromPage() || '';
    const text = (v) => ({ value: String(v == null ? '' : v).slice(0, 60000) });

    const full = {
      [LOG_FIELDS.event]:    text(trigger || (ev && ev.type)),
      [LOG_FIELDS.result]:   text(result),
      [LOG_FIELDS.category]: text(category),
      [LOG_FIELDS.app]:      { value: getAppId() },
      [LOG_FIELDS.record]:   { value: String(recId) },
      [LOG_FIELDS.user]:     { value: u.code ? [{ code: u.code }] : [] },
      [LOG_FIELDS.message]:  text(message),
    };

    try {
      await postLog(full);
    } catch (e) {
      console.error('[sda] writeLog 失敗（請確認 Log App ID / Token / 欄位代碼與類型是否正確），改用最小欄位重試', e);
      // 最小保底：只寫三個必有的文字欄位，避開可能設錯的數值(LOG_APP)/USER_SELECT(LOG_USER)/分類欄位，
      // 並把分類併入訊息，確保核心資訊不遺失。
      const minimal = {
        [LOG_FIELDS.event]:   text(trigger || (ev && ev.type)),
        [LOG_FIELDS.result]:  text(result),
        [LOG_FIELDS.message]: text(`[${category}] ${message}`),
      };
      try {
        await postLog(minimal);
      } catch (e2) {
        console.error('[sda] writeLog 最小欄位重試仍失敗，本次未寫入 Log（請檢查 Log App 是否存在、Token 權限是否含「記錄追加」）', e2);
      }
    }
  };

  const uuid = () => (crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));

  const resolveValue = async (spec, ctx) => {
    const { event, record } = ctx;
    let _resolvedValue;
    switch (spec.valueSource) {
      case 'fixed':         _resolvedValue = spec.valueParam; break;
      case 'loginUser':     _resolvedValue = kintone.getLoginUser(); break;
      case 'today':         _resolvedValue = toISODate(new Date()); break;
      case 'nowTime':       _resolvedValue = toHHmm(new Date()); break;
      case 'now':           _resolvedValue = new Date().toISOString(); break;
      case 'recordNumber':  _resolvedValue = record.$id && record.$id.value; break;
      case 'recordId':      _resolvedValue = record.$id && record.$id.value; break;
      case 'appId':         _resolvedValue = getAppId(); break;
      case 'uuid':          _resolvedValue = uuid(); break;
      case 'timestamp':     _resolvedValue = String(Date.now()); break;
      case 'clear':         _resolvedValue = ''; break;
      case 'nextStatus':    _resolvedValue = event && event.nextStatus ? event.nextStatus.value : ''; break;
      case 'currentStatus': {

        _resolvedValue = (event && event.status && event.status.value) ||
                         (record.$status && record.$status.value) ||
                         (record['狀態'] && record['狀態'].value) || '';
        break;
      }
      case 'actionName':    _resolvedValue = event && event.action ? event.action.value : ''; break;
      case 'fieldCopy': {
        const src = record[spec.valueParam];
        const _raw = src ? src.value : '';
        _resolvedValue = typeof _raw === 'string' ? _raw.trim() : _raw;
        break;
      }

      case 'subtableLastRow': {
        const p = spec.valueParam || {};
        const tbl = record[p.table];
        const rows = (tbl && Array.isArray(tbl.value)) ? tbl.value : [];
        if (!tbl || !Array.isArray(tbl.value)) {
          console.warn(`[sda][subtableLastRow] "${p.table}" 不是子表或不存在`);
          _resolvedValue = '';
          break;
        }
        if (!rows.length) { _resolvedValue = ''; break; }

        const applyMap = (rawVal) => {
          let v = typeof rawVal === 'string' ? rawVal.trim() : String(rawVal ?? '');
          if (p.map && typeof p.map === 'object') {
            const key = v;
            if (Object.prototype.hasOwnProperty.call(p.map, key)) {
              v = p.map[key];
            } else {
              const onMiss = p.onMiss === undefined ? 'raw' : p.onMiss;
              switch (onMiss) {
                case 'empty': return null;
                case 'raw':   break;
                default:      v = onMiss;
              }
            }
          }
          return v;
        };

        if (p.row === 'all') {
          const collected = [];
          rows.forEach((r) => {
            const cell = r.value && r.value[p.field];
            const rawV = cell ? cell.value : '';
            if (rawV === '' || rawV == null) return;
            const mapped = applyMap(rawV);
            if (mapped === null || mapped === '') return;
            if (!collected.includes(mapped)) collected.push(mapped);
          });
          _resolvedValue = collected;
          break;
        }

        let idx;
        switch (p.row) {
          case 'first': idx = 0; break;
          default:
            idx = typeof p.row === 'number'
              ? (p.row < 0 ? rows.length + p.row : p.row)
              : rows.length - 1;
        }
        const targetRow = rows[idx];
        const cell = targetRow && targetRow.value && targetRow.value[p.field];
        const _raw0 = cell ? cell.value : '';
        const _val  = applyMap(_raw0) ?? '';

        _resolvedValue = _val;
        break;
      }

      case 'elapsedMinutes': {
        const prev = ctx.subContext && ctx.subContext.previousRow;
        if (!prev) { _resolvedValue = 0; break; }
        const sinceField = (spec.valueParam && spec.valueParam.sinceField) || '執行日時';
        const prevTimeStr = prev.value[sinceField] && prev.value[sinceField].value;
        if (!prevTimeStr) { _resolvedValue = 0; break; }
        const prevDate = new Date(prevTimeStr);
        const now = new Date();
        const diffMin = Math.round((now.getTime() - prevDate.getTime()) / 60000);
        _resolvedValue = Number.isFinite(diffMin) && diffMin >= 0 ? diffMin : 0;
        break;
      }
      case 'formula':
        _resolvedValue = evalFormula(spec.valueParam || '', record);
        break;
      case 'lookup':
        _resolvedValue = await lookupAcrossApp(spec.valueParam || {}, record);
        break;
      case 'dateShift':
        _resolvedValue = computeDateShift(spec.valueParam || {}, ctx);
        break;
      default:
        console.warn('[sda] unknown valueSource', spec.valueSource);
        return null;
    }
    return _resolvedValue;
  };

  const evalFormula = (expr, record) => {
    const replaced = expr.replace(/\{([^}]+)\}/g, (_, code) => {
      const f = record[code.trim()];
      const v = f && f.value;
      if (Array.isArray(v)) return v.length;
      const n = Number(v);
      return Number.isFinite(n) ? n : `"${String(v || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')}"`;
    });
    const skeleton = replaced.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    if (!/^[\d+\-*/().\s",]+$/.test(skeleton)) throw new Error(`formula unsafe: ${replaced}`);
    try { return Function('"use strict";return (' + replaced + ')')(); }
    catch (e) { throw new Error(`formula failed: ${expr}`); }
  };

  const lookupAcrossApp = async (params, record) => {
    const { app, keyField, keyExpr, returnField, onMiss = 'empty' } = params;
    if (!app || !keyField || !returnField) return '';
    const keyVal = String(keyExpr || '').replace(/\{([^}]+)\}/g, (_, c) => {
      const f = record[c.trim()];
      return f ? String(f.value || '') : '';
    });

    const resp = await kintone.api(
      kintone.api.url('/k/v1/records.json', true),
      'GET',
      { app, query: `${keyField} = "${keyVal}" limit 1`, fields: [returnField] }
    ).catch((e) => { throw new Error(`lookup failed: ${e.message || e}`); });
    if (!resp.records || !resp.records.length) {
      if (onMiss === 'error') throw new Error(`lookup miss: ${keyField}="${keyVal}"`);
      return '';
    }
    return resp.records[0][returnField] && resp.records[0][returnField].value;
  };

  const parseBaseDate = (val) => {
    if (val == null || val === '') return null;
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map(Number);
      return { d: new Date(y, m - 1, d), kind: 'date' };
    }
    if (/^\d{1,2}:\d{2}/.test(s) && !s.includes('-')) {
      const [hh, mm] = s.split(':').map(Number);
      const t = new Date(); t.setHours(hh, mm, 0, 0);
      return { d: t, kind: 'time' };
    }
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : { d: dt, kind: 'datetime' };
  };

  const addPeriod = (date, amount, unit) => {
    const n = Number(amount) || 0;
    const r = new Date(date.getTime());
    switch (unit) {
      case 'minutes': r.setMinutes(r.getMinutes() + n); break;
      case 'hours':   r.setHours(r.getHours() + n); break;
      case 'months':  r.setMonth(r.getMonth() + n); break;
      case 'years':   r.setFullYear(r.getFullYear() + n); break;
      case 'days':
      default:        r.setDate(r.getDate() + n); break;
    }
    return r;
  };

  const formatDateOut = (date, output) => {
    switch (output) {
      case 'datetime': return date.toISOString();
      case 'time':     return toHHmm(date);
      case 'date':
      default:         return toISODate(date);
    }
  };

  const computeDateShift = (params, ctx) => {
    const p = params || {};
    const base = p.base || {};
    let baseVal;
    if (base.from === 'now')        baseVal = new Date().toISOString();
    else if (base.from === 'today') baseVal = toISODate(new Date());
    else {
      const rec = base.from === 'this' ? ctx.record : ctx.targetRecord;
      if (!rec) return '';
      const f = rec[base.field];
      baseVal = f && f.value;
    }
    const parsed = parseBaseDate(baseVal);
    if (!parsed) return '';

    let amount = p.amount;
    if (amount && typeof amount === 'object') {
      const rec = amount.from === 'target' ? ctx.targetRecord : ctx.record;
      const f = rec && rec[amount.field];
      amount = f ? Number(f.value) : 0;
    }
    const shifted = addPeriod(parsed.d, amount, p.unit || 'days');
    return formatDateOut(shifted, p.output || parsed.kind);
  };

  const dateShiftNeedsTarget = (m) =>
    m && m.valueSource === 'dateShift' && m.valueParam &&
    (((m.valueParam.base || {}).from === 'target') ||
     (m.valueParam.amount && typeof m.valueParam.amount === 'object' && m.valueParam.amount.from === 'target'));

  const ruleNeedsTargetRecord = (rule) => (rule.fieldMapping || []).some(dateShiftNeedsTarget);

  const classifyWrite = (existing, raw) => {
    if (raw && typeof raw === 'object' && raw.code && !Array.isArray(raw)) return 'userObject';
    if (Array.isArray(existing)) return 'arrayField';
    return 'scalar';
  };
  const writeToField = (record, fieldCode, raw, opts = {}) => {
    const target = record[fieldCode];
    if (!target) {
      console.warn(`[sda][writeToField] ✗ field "${fieldCode}" not found in record. Available fields: ${Object.keys(record).join(', ')}`);
      return false;
    }
    const existing = target.value;
    const kind = classifyWrite(existing, raw);

    switch (kind) {
      case 'userObject': {
        target.value = [{ code: raw.code, name: raw.name }];
        return true;
      }
      case 'arrayField': {

        let next;
        if (Array.isArray(raw))             next = raw;
        else if (raw === '' || raw == null) next = [];
        else next = String(raw).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

        if (opts.append && Array.isArray(existing)) {
          const merged = existing.slice();
          next.forEach((v) => { if (!merged.includes(v)) merged.push(v); });
          target.value = merged;
        } else {
          target.value = next;
        }
        return true;
      }
      case 'scalar':
      default: {
        target.value = raw == null ? '' : String(raw);
        return true;
      }
    }
  };

  const buildSubRow = async (subRules, ctx, templateRow) => {
    const row = { id: null, value: {} };

    if (templateRow && templateRow.value) {
      Object.keys(templateRow.value).forEach((code) => {
        const ref = templateRow.value[code];
        if (ref && typeof ref === 'object') {
          row.value[code] = { ...ref, value: Array.isArray(ref.value) ? [] : null };
        }
      });
    }

    for (const sr of (subRules || [])) {
      const v = await resolveValue(sr, ctx);
      const cell = row.value[sr.targetField];
      if (!cell) {

        const shaped = (v == null) ? '' : (typeof v === 'object' ? v : String(v));
        row.value[sr.targetField] = { value: shaped };
        console.warn(`[sda][buildSubRow] field "${sr.targetField}" missing in template row — type unknown`);
        continue;
      }
      switch (classifyWrite(cell.value, v)) {
        case 'userObject':
          cell.value = [{ code: v.code, name: v.name }];
          break;
        case 'arrayField':
          switch (true) {
            case Array.isArray(v):        cell.value = v; break;
            case v === '' || v == null:   cell.value = []; break;
            default:                      cell.value = String(v).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
          }
          break;
        case 'scalar':
        default:
          cell.value = v == null ? '' : (typeof v === 'object' ? v : String(v));
          break;
      }
    }
    return row;
  };

  const initSubtableOnCreate = (record, subtableCode, subFieldCodes) => {
    const table = record[subtableCode];
    if (!table || !Array.isArray(table.value)) {
      console.warn(`[sda][initSubtableOnCreate] "${subtableCode}" is not a subtable in event.record`);
      return;
    }
    const before = table.value.length;
    const refRow = table.value[0];

    if (refRow && refRow.value && typeof refRow.value === 'object') {

      const blankRow = { id: null, value: {} };
      Object.keys(refRow.value).forEach((code) => {
        const ref = refRow.value[code];
        if (ref && typeof ref === 'object') {
          blankRow.value[code] = { ...ref, value: Array.isArray(ref.value) ? [] : null };
        }
      });
      table.value = [blankRow];
    } else {

      table.value = [];
    }
  };

  const triggerMatches = (rule, trigger) => {
    const list = String(rule.trigger || '').split(',').map((s) => s.trim()).filter(Boolean);
    return list.includes(trigger);
  };

  const statusMatchesList = (spec, actual) => {
    if (!spec) return true;
    const list = String(spec).split(/[,，;；\n]/).map((s) => s.trim()).filter(Boolean);
    if (!list.length || list.includes('*')) return true;
    return list.includes(actual);
  };

  const statusMatches = (rule, event, record, trigger) => {

    switch (trigger) {
      case 'process.proceed': {

        const cur  = (event.status && event.status.value) ||
                     (record.$status && record.$status.value) ||
                     record['狀態']?.value || '';
        const next = (event.nextStatus && event.nextStatus.value) || '';
        const act  = (event.action && event.action.value) || '';
        if (cur !== '' && !statusMatchesList(rule.fromStatus, cur)) {
          return false;
        }
        if (rule.fromStatus && String(rule.fromStatus).trim() !== '*' && cur === '') {
          console.warn(`[sda][statusMatches] ⚠ $status unavailable in event.record — fromStatus check skipped`);
        }
        if (!statusMatchesList(rule.toStatus, next)) {
          return false;
        }
        if (!statusMatchesList(rule.actionName, act)) {
          return false;
        }
        break;
      }
      case 'create.show':
      case 'create.submit':

        break;
      case 'edit.show':
      case 'edit.submit':
      case 'index.edit.show':
      case 'index.edit.submit':
      default: {
        const cur = (record.$status && record.$status.value) || record['狀態']?.value || '';
        if (!statusMatchesList(rule.statusCond, cur)) return false;
        break;
      }
    }

    if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
      const logic = rule.conditionLogic === 'OR' ? 'OR' : 'AND';

      const actualValuesOf = (fv) => {
        if (!fv || fv.value === undefined || fv.value === null) return [''];
        const v = fv.value;
        if (Array.isArray(v)) {
          if (v.length === 0) return [''];
          const out = [];
          v.forEach((item) => {
            if (item && typeof item === 'object') {
              if (item.code != null) out.push(String(item.code));
              if (item.name != null) out.push(String(item.name));
            } else {
              out.push(String(item));
            }
          });
          return out.length ? out : [''];
        }
        return [String(v)];
      };

      const splitList = (s) => String(s ?? '').split(/[,，;；\n]/).map((x) => x.trim()).filter((x) => x !== '');

      const evalCond = (cond) => {
        const fv      = record[cond.field];
        const actuals = actualValuesOf(fv);
        const exp     = String(cond.value ?? '');
        switch (cond.op || 'eq') {
          case 'neq':        return !actuals.includes(exp);
          case 'startsWith': return actuals.some((a) => a.startsWith(exp));
          case 'contains':   return actuals.some((a) => a.includes(exp));
          case 'inList': {
            const list = splitList(cond.value);
            return actuals.some((a) => list.includes(a));
          }
          case 'eq':
          default:           return actuals.includes(exp);
        }
      };

      const results = rule.conditions.map(evalCond);
      const passed  = logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
      const detail  = rule.conditions.map((c, i) =>
        `[${c.field} ${c.op||'eq'} "${c.value}"→${results[i]}]`).join(' ');
      if (!passed) {
        return false;
      }
    }

    return true;
  };

  const runWriteSelf = async (rule, ctx) => {
    switch (rule.valueSource) {

      case 'readonly': {
        if (ctx.trigger === 'index.edit.show') {
          const f = ctx.record[rule.targetField];
          if (f) f.disabled = true;
          return;
        }
        if (/\.show$/.test(ctx.trigger)) setFieldShown(rule.targetField, false);
        return;
      }

      case 'appendSubtable': {
        const target = ctx.record[rule.targetField];
        if (!target || !Array.isArray(target.value)) {
          console.warn(`[sda] appendSubtable: ${rule.targetField} is not a SUBTABLE`);
          return;
        }
        const subRules = (rule.valueParam && rule.valueParam.subRules) || [];

        const rows = target.value;
        const isCellEmpty = (cell) => {
          if (!cell) return true;
          const v = cell.value;
          return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
        };
        const detectionSubRule = subRules.find((sr) => sr.valueSource === 'nextStatus') || subRules[0];
        const detectionField = detectionSubRule && detectionSubRule.targetField;
        const isTemplateRow = rows.length === 1 && !!detectionField &&
          isCellEmpty(rows[0].value[detectionField]);

        const previousRow = (rows.length > 0 && !isTemplateRow) ? rows[rows.length - 1] : null;
        const subCtx = { ...ctx, subContext: { subtableCode: rule.targetField, previousRow } };

        const templateRow = rows[0] || rows[rows.length - 1] || null;
        const newRow = await buildSubRow(subRules, subCtx, templateRow);
        if (isTemplateRow) rows[0] = newRow;
        else               rows.push(newRow);
        return;
      }

      default: {

        if (rule.skipIfFilled) {
          const cur = ctx.record[rule.targetField] && ctx.record[rule.targetField].value;
          const filled = Array.isArray(cur) ? cur.length > 0 : (cur != null && cur !== '');
          if (filled) { return; }
        }

        const raw = await resolveValue(rule, ctx);
        const ok = writeToField(ctx.record, rule.targetField, raw, { append: rule.appendMode === true });
        return;
      }
    }
  };

  const buildOtherPayload = async (rule, ctx) => {
    const payload = {};
    const errs = [];
    const suspects = [];
    for (const m of (rule.fieldMapping || [])) {
      if (m.valueSource === 'fieldCopy' && ctx.record && !(m.valueParam in ctx.record)) {
        suspects.push(`「${m.targetField}」（來源欄位代碼「${m.valueParam}」在本記錄找不到，請確認是否打錯字）`);
      }

      let v;
      try {
        v = await resolveValue(m, ctx);
      } catch (e) {
        errs.push(`「${m.targetField}」值計算失敗: ${e.message}`);
        continue;
      }
      if (m.valueSource === 'dateShift' && (v === '' || v == null)) {
        suspects.push(`「${m.targetField}」（dateShift 找不到基準日期或計算失敗，請確認來源欄位代碼與資料格式）`);
      }
      payload[m.targetField] = { value: v == null ? '' : (typeof v === 'object' ? v : String(v)) };
    }
    if (errs.length) throw new Error(errs.join('; '));
    return { payload, suspects };
  };

  const badFieldsFromError = (err) => {
    let errObj = err && err.errors;
    if (!errObj && err && typeof err.message === 'string') {
      const brace = err.message.indexOf('{');
      if (brace >= 0) {
        try { errObj = JSON.parse(err.message.slice(brace)).errors; } catch (e) {  }
      }
    }
    if (!errObj || typeof errObj !== 'object') return [];
    const out = [];
    Object.keys(errObj).forEach((k) => {
      const m = /record\.([^.\[]+)/.exec(k) || /^([^.\[]+)/.exec(k);
      const field = m ? m[1] : k;
      const msg = errObj[k] && Array.isArray(errObj[k].messages) ? errObj[k].messages.join(' / ') : '';
      out.push(msg ? `${field}（${msg}）` : field);
    });
    return out;
  };

  const apiWrite = async (method, body, app, suspects) => {
    try {
      return await apiWithToken(`/k/v1/record.json`, method, body, app);
    } catch (e) {
      const bad = badFieldsFromError(e);
      if (bad.length) throw new Error(`${e.message} → 問題欄位: ${bad.join('、')}`);
      if (suspects && suspects.length) throw new Error(`${e.message} → 可疑欄位: ${suspects.join('、')}`);
      throw e;
    }
  };

  const runWriteOther = async (rule, ctx) => {
    const app = rule.targetApp;
    if (!app) throw new Error('writeOther: targetApp missing');

    switch (rule.writeMode) {
      case 'create': {
        const { payload, suspects } = await buildOtherPayload(rule, ctx);
        await apiWrite('POST', { app, record: payload }, app, suspects);
        return;
      }
      case 'update':
      case 'upsert':
      default: {
        const keyParts = await Promise.all((rule.keyMapping || []).map(async (m) => {
          const v = await resolveValue(m, ctx);
          return `${m.targetField} = "${String(v || '').replace(/"/g, '\\"')}"`;
        }));
        if (!keyParts.length) throw new Error('writeOther: keyMapping required for update/upsert');
        const query = `${keyParts.join(' and ')} limit 1`;

        const getOpts = { app, query };
        if (!ruleNeedsTargetRecord(rule)) getOpts.fields = ['$id'];
        const found = await apiWithToken('/k/v1/records.json', 'GET', getOpts, app);

        if (found.records && found.records.length) {
          const targetRecord = found.records[0];
          const id = targetRecord.$id.value;
          const { payload, suspects } = await buildOtherPayload(rule, { ...ctx, targetRecord });
          await apiWrite('PUT', { app, id, record: payload }, app, suspects);
        } else if (rule.writeMode === 'upsert') {
          const { payload, suspects } = await buildOtherPayload(rule, ctx);
          await apiWrite('POST', { app, record: payload }, app, suspects);
        } else {
          throw new Error(`writeOther: no record found for ${query}`);
        }
        return;
      }
    }
  };

  let pendingWrite = null;

  const compensationWrite = async (recordId, changedFields) => {
    const appId = getAppId();
    try {
      await apiWithToken('/k/v1/record.json', 'PUT', { app: appId, id: recordId, record: changedFields }, appId);
      location.reload();
    } catch (e) {
      console.error('[sda] compensation write failed', e);

      const msg = `[Status-Driven Actions] 補償寫入失敗，請聯繫管理員手動補記錄。\n${e.message}`;
      if (window.Swal) {
        window.Swal.fire({ icon: 'warning', title: '警告', text: msg });
      } else {
        console.warn(msg);
      }
    }
  };

  const snapshotFields = (record, fieldCodes) => {
    const snap = {};
    fieldCodes.forEach((code) => {
      if (record[code]) snap[code] = { value: record[code].value };
    });
    return snap;
  };

  const applyRules = async (trigger, event) => {
    const record = event.record;
    if (!record) { console.warn('[sda][applyRules] event.record is null/undefined'); return event; }

    if (!CONFIG.rules || CONFIG.rules.length === 0) return event;

    const editCheckPromise  = (trigger === 'process.proceed' && HAS_SELF_TOKEN && record.$id?.value)
      ? checkEditPermission(record.$id.value)
      : null;

    const ctx = { event, record, trigger };

    const matched = (CONFIG.rules || []).filter((r) =>
      r.enabled !== false && triggerMatches(r, trigger) && statusMatches(r, event, record, trigger)
    );

    _runInfo.matched = matched.length;
    _runInfo.labels = matched.map((r) => r.label || r.id);

    const selfRules  = matched.filter((r) => r.action !== 'writeOther');
    const otherRules = matched.filter((r) => r.action === 'writeOther');

    const touchedFields = [];

    for (const rule of selfRules) {
      try {
        await runWriteSelf(rule, ctx);
        if (rule.targetField && rule.action !== 'writeOther') touchedFields.push(rule.targetField);
      } catch (e) {
        console.error(`[sda] rule "${rule.label || rule.id}" failed`, e);
        if (/submit|process/.test(trigger)) { recordError(event, e, rule.label || rule.id); return event; }
      }
    }

    switch (trigger) {
      case 'process.proceed': {
        if (touchedFields.length > 0 && HAS_SELF_TOKEN) {
          const recordId = record.$id && record.$id.value;
          const canEdit = editCheckPromise ? await editCheckPromise : await checkEditPermission(recordId);
          if (!canEdit) {
            pendingWrite = {
              recordId,
              changedFields: snapshotFields(record, [...new Set(touchedFields)]),
            };
            for (const rule of otherRules) {
              try { await runWriteOther(rule, ctx); }
              catch (e) {
                console.error(`[sda] cross-app rule "${rule.label || rule.id}" failed`, e);
                if (rule.onError === 'block' || !rule.onError) { recordError(event, e, rule.label || rule.id); return event; }
              }
            }
            return;
          }
        }

        for (const rule of otherRules) {
          try { await runWriteOther(rule, ctx); }
          catch (e) {
            console.error(`[sda] cross-app rule "${rule.label || rule.id}" failed`, e);
            if (rule.onError === 'block' || !rule.onError) { recordError(event, e, rule.label || rule.id); return event; }
          }
        }
        return event;
      }
      case 'create.submit':
      case 'edit.submit':
      case 'index.edit.submit': {
        for (const rule of otherRules) {
          try { await runWriteOther(rule, ctx); }
          catch (e) {
            console.error(`[sda] cross-app rule "${rule.label || rule.id}" failed`, e);
            if (rule.onError === 'block' || !rule.onError) { recordError(event, e, rule.label || rule.id); return event; }
          }
        }
        break;
      }
    }

    return event;
  };

  const handleDetailShow = async (event) => {
    if (pendingWrite) {
      const { recordId, changedFields } = pendingWrite;
      pendingWrite = null;
      await compensationWrite(recordId, changedFields);
    }
  };

  const isHistoryRule = (r) =>
    r && r.enabled !== false &&
    r.valueSource === 'appendSubtable' &&
    r.targetField &&
    r.valueParam && r.valueParam.historyMode === true;

  const handleCreateShow = (event) => {
    const record = event.record;
    const allSubtableRules = (CONFIG.rules || []).filter((r) =>
      r.enabled !== false && r.valueSource === 'appendSubtable' && r.targetField
    );
    const historyRules = allSubtableRules.filter(isHistoryRule);
    if (allSubtableRules.length > 0 && historyRules.length === 0) {
      console.warn(`[sda][handleCreateShow] ⚠ found appendSubtable rule(s) but NONE have valueParam.historyMode === true — clear & hide skipped. Add "historyMode": true to enable.`);
    }
    const seen = new Set();
    historyRules.forEach((rule) => {
      if (seen.has(rule.targetField)) return;
      seen.add(rule.targetField);
      const subCodes = ((rule.valueParam && rule.valueParam.subRules) || []).map((sr) => sr.targetField);
      initSubtableOnCreate(record, rule.targetField, subCodes);
      setFieldShown(rule.targetField, false);
    });
    return event;
  };

  const handleEditShow = (event) => {
    const historyRules = (CONFIG.rules || []).filter(isHistoryRule);
    const seen = new Set();
    historyRules.forEach((rule) => {
      if (seen.has(rule.targetField)) return;
      seen.add(rule.targetField);
      setFieldShown(rule.targetField, false);
    });
    return event;
  };

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
    switch (trigger) {
      case 'create.submit':
      case 'edit.submit':
        _pendingSubmitLog = null;
        break;
    }

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
      switch (trigger) {
        case 'process.proceed':
          try {
            await writeLog({
              ev, trigger, result: '成功', category: 'success',
              message: successLogMessage(_runInfo.matched, _runInfo.labels),
            });
          } catch (e) {
            console.error('[sda] writeLog failed', e);
          }
          break;
        case 'create.submit':
        case 'edit.submit':
          _pendingSubmitLog = { trigger, matched: _runInfo.matched, labels: _runInfo.labels.slice() };
          break;
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

  // ===== 對外暴露：以 REST API 推進狀態時，補觸發 process.proceed 規則 =====
  // 背景：App 自訂 JS 用 /k/v1/record/status 推進流程時，kintone 不會送出 process.proceed
  //       事件，本外掛掛在 process.proceed 的規則（含簽核履歷 appendSubtable）因此不會執行。
  //       呼叫此函式即可用「同一份規則」補建並寫入該筆 row，避免 App 端重複實作建 row 邏輯。
  //
  // 用法（建議在「API 推進成功之後」呼叫；nextStatus 省略時自動讀取記錄當下的狀態）：
  //   await window.NXSdaProceed.run({
  //     recordId: '123',
  //     action:   '廠商代號登錄完成',                 // 對應 kintone 流程動作名稱
  //     fromStatus: '總務部會計課經辦登錄廠商代號',     // 推進前狀態（供規則 fromStatus 比對）
  //     // toStatus: '流程結束',                       // 可省略；省略時取記錄當下 狀態 值
  //   });
  //
  // 回傳：{ matched: number, written: boolean }
  // 注意：本表寫入會優先使用外掛設定的 selfAppToken（若有），可避開推進後使用者已無編輯權的問題。
  const runProceedRulesViaApi = async ({ recordId, action = '', fromStatus = '', toStatus = '' } = {}) => {
    if (!recordId) throw new Error('[sda] runProceedRulesViaApi: recordId 必填');
    if (!CONFIG.rules || CONFIG.rules.length === 0) return { matched: 0, written: false };

    const appId = getAppId();

    // 1. 取最新整筆記錄（含完整子表，供 append 既有列 + 新列一起 PUT）
    const getResp = await apiWithToken('/k/v1/record.json', 'GET', { app: appId, id: recordId }, appId);
    const record = getResp.record;
    if (!record) throw new Error(`[sda] runProceedRulesViaApi: 找不到記錄 ${recordId}`);

    // 2. 組合擬真 process.proceed 事件（讓 resolveValue 的 actionName/currentStatus/nextStatus 正確）
    const resolvedNext = toStatus || (record['狀態'] && record['狀態'].value) ||
      (record.$status && record.$status.value) || '';
    const event = {
      type: 'app.record.detail.process.proceed',
      record,
      action: { value: action },
      status: { value: fromStatus },
      nextStatus: { value: resolvedNext },
    };

    // 3. 用既有比對邏輯找出命中的 process.proceed 規則
    const matched = (CONFIG.rules || []).filter((r) =>
      r.enabled !== false && triggerMatches(r, 'process.proceed') && statusMatches(r, event, record, 'process.proceed')
    );
    if (matched.length === 0) {
      console.warn('[sda][runProceedRulesViaApi] 無命中 process.proceed 規則，未寫入', { action, fromStatus, toStatus: resolvedNext });
      return { matched: 0, written: false };
    }

    const ctx = { event, record, trigger: 'process.proceed' };
    const selfRules = matched.filter((r) => r.action !== 'writeOther');
    const otherRules = matched.filter((r) => r.action === 'writeOther');

    // 4. 跑本表規則（appendSubtable 會把新列 push 進 record[targetField].value）
    const touchedFields = [];
    for (const rule of selfRules) {
      await runWriteSelf(rule, ctx);
      if (rule.targetField) touchedFields.push(rule.targetField);
    }

    // 5. 把被改動的本表欄位（含 append 後的完整子表）PUT 回去
    let written = false;
    const uniqueFields = [...new Set(touchedFields)];
    if (uniqueFields.length > 0) {
      const changed = snapshotFields(record, uniqueFields);
      await apiWithToken('/k/v1/record.json', 'PUT', { app: appId, id: recordId, record: changed }, appId);
      written = true;
    }

    // 6. 跨 App 規則（如有）
    for (const rule of otherRules) {
      await runWriteOther(rule, ctx);
    }

    return { matched: matched.length, written };
  };

  window.NXSdaProceed = window.NXSdaProceed || { run: runProceedRulesViaApi };

  const E = (names) => names.flatMap((n) => [`app.record.${n}`, `mobile.app.record.${n}`]);

  kintone.events.on(E(['create.show']),
    safeHandler(async (ev) => {
      handleCreateShow(ev);
      return applyRules('create.show', ev);
    })
  );

  kintone.events.on(E(['edit.show']),
    safeHandler(async (ev) => {
      handleEditShow(ev);
      return applyRules('edit.show', ev);
    })
  );

  kintone.events.on(E(['index.edit.show']),
    safeHandler(async (ev) => applyRules('index.edit.show', ev))
  );

  kintone.events.on(E(['index.edit.submit']),
    safeHandler(async (ev) => applyRules('index.edit.submit', ev))
  );

  kintone.events.on(E(['create.submit']), loggedApply('create.submit'));

  kintone.events.on(E(['edit.submit']), loggedApply('edit.submit'));

  kintone.events.on(E(['detail.process.proceed']), loggedApply('process.proceed'));

  kintone.events.on(E(['create.submit.success']), async (ev) => { await flushSubmitLog(ev); return ev; });

  kintone.events.on(E(['edit.submit.success']), async (ev) => { await flushSubmitLog(ev); return ev; });

  kintone.events.on(E(['detail.show']),
    safeHandler(handleDetailShow)
  );

})();
