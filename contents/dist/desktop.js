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

  const TOKENS = (CONFIG.tokens || []).reduce((m, t) => {
    if (t && t.appId && t.token) m[String(t.appId)] = t.token;
    return m;
  }, {});

  const SELF_TOKEN = CONFIG.selfAppToken || '';

  const LOG_APP = String(CONFIG.logAppId || '').trim();
  const LOG_TOKEN = String(CONFIG.logToken || '').trim();

  if (LOG_APP && LOG_TOKEN) TOKENS[LOG_APP] = LOG_TOKEN;

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

  const PERMISSION_CODES = new Set(['GAIA_NO01', 'GAIA_NO02', 'CB_NO01', 'CB_NO02', 'GAIA_DA02']);
  const CONFIG_CODES = new Set(['GAIA_FE01', 'GAIA_AP01', 'GAIA_IQ11', 'GAIA_IL26', 'CB_IL02', 'CB_VA01']);

  const errorCodeOf = (err) => {
    if (err && err.code) return err.code;
    const msg = (err && err.message) || '';
    const fromJson = /"code"\s*:\s*"([A-Z0-9_]+)"/.exec(msg);
    if (fromJson) return fromJson[1];
    const fromText = /\b(CB_[A-Z0-9]+|GAIA_[A-Z0-9]+)\b/.exec(msg);
    return fromText ? fromText[1] : '';
  };

  const classifyError = (err) => {
    const code = errorCodeOf(err);
    if (code === 'CB_AU01') return 'session';
    if (PERMISSION_CODES.has(code)) return 'permission';
    if (CONFIG_CODES.has(code)) return 'config';
    return 'system';
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

  const apiWithToken = async (path, method, body, appIdForToken) => {
    const token = TOKENS[String(appIdForToken)] || (String(appIdForToken) === getAppId() ? SELF_TOKEN : '');
    if (!token) return kintone.api(kintone.api.url(path, true), method, body);
    const url = kintone.api.url(path, true);
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Cybozu-API-Token': token },
    };
    if (method === 'GET') {
      const qs = new URLSearchParams();
      Object.entries(body || {}).forEach(([k, v]) => {
        if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x));
        else qs.append(k, v);
      });
      const r = await fetch(`${url}?${qs}`, opts);
      if (!r.ok) throw new Error(`API ${path} ${r.status}: ${await r.text()}`);
      return r.json();
    }
    opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`API ${path} ${r.status}: ${await r.text()}`);
    return r.json();
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
              if (onMiss === 'empty') return null;
              if (onMiss !== 'raw')   v = onMiss;
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
        if (p.row === 'first') idx = 0;
        else if (typeof p.row === 'number') idx = p.row < 0 ? rows.length + p.row : p.row;
        else idx = rows.length - 1;
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
      return Number.isFinite(n) ? n : `"${String(v || '').replace(/"/g, '\\"')}"`;
    });
    if (!/^[\d+\-*/().\s"\\,a-zA-Z_]+$/.test(replaced)) throw new Error(`formula unsafe: ${replaced}`);
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

  const triggerMatches = (rule, trigger) => rule.trigger === trigger;

  const statusMatches = (rule, event, record) => {

    switch (rule.trigger) {
      case 'process.proceed': {

        const cur  = (event.status && event.status.value) ||
                     (record.$status && record.$status.value) ||
                     record['狀態']?.value || '';
        const next = (event.nextStatus && event.nextStatus.value) || '';
        const act  = (event.action && event.action.value) || '';
        if (rule.fromStatus && rule.fromStatus !== '*' && cur !== '' && rule.fromStatus !== cur) {
          return false;
        }
        if (rule.fromStatus && rule.fromStatus !== '*' && cur === '') {
          console.warn(`[sda][statusMatches] ⚠ $status unavailable in event.record — fromStatus check skipped`);
        }
        if (rule.toStatus && rule.toStatus !== '*' && rule.toStatus !== next) {
          return false;
        }
        if (rule.actionName && rule.actionName !== '*' && rule.actionName !== act) {
          return false;
        }
        break;
      }
      case 'create.show':
      case 'create.submit':

        break;
      case 'edit.show':
      case 'edit.submit':
      case 'detail.show':
      default: {
        const cur = (record.$status && record.$status.value) || record['狀態']?.value || '';
        if (rule.statusCond && rule.statusCond !== '*' && rule.statusCond !== cur) return false;
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
        if (/\.show$/.test(rule.trigger)) setFieldShown(rule.targetField, false);
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

  const runWriteOther = async (rule, ctx) => {
    const app = rule.targetApp;
    if (!app) throw new Error('writeOther: targetApp missing');

    const payload = {};
    for (const m of (rule.fieldMapping || [])) {
      const v = await resolveValue(m, ctx);
      payload[m.targetField] = { value: v == null ? '' : (typeof v === 'object' ? v : String(v)) };
    }

    switch (rule.writeMode) {
      case 'create': {
        await apiWithToken('/k/v1/record.json', 'POST', { app, record: payload }, app);
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

        const found = await apiWithToken('/k/v1/records.json', 'GET', { app, query, fields: ['$id'] }, app);
        if (found.records && found.records.length) {
          const id = found.records[0].$id.value;
          await apiWithToken('/k/v1/record.json', 'PUT', { app, id, record: payload }, app);
        } else if (rule.writeMode === 'upsert') {
          await apiWithToken('/k/v1/record.json', 'POST', { app, record: payload }, app);
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

    const editCheckPromise  = (trigger === 'process.proceed' && SELF_TOKEN && record.$id?.value)
      ? checkEditPermission(record.$id.value)
      : null;

    const ctx = { event, record, trigger };

    const matched = (CONFIG.rules || []).filter((r) =>
      r.enabled !== false && triggerMatches(r, trigger) && statusMatches(r, event, record)
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

    if (trigger === 'process.proceed') {
      if (touchedFields.length > 0 && SELF_TOKEN) {
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

    if (/submit/.test(trigger)) {
      for (const rule of otherRules) {
        try { await runWriteOther(rule, ctx); }
        catch (e) {
          console.error(`[sda] cross-app rule "${rule.label || rule.id}" failed`, e);
          if (rule.onError === 'block' || !rule.onError) { recordError(event, e, rule.label || rule.id); return event; }
        }
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

  kintone.events.on(E(['create.submit']), loggedApply('create.submit'));

  kintone.events.on(E(['edit.submit']), loggedApply('edit.submit'));

  kintone.events.on(E(['detail.process.proceed']), loggedApply('process.proceed'));

  kintone.events.on(E(['detail.show']),
    safeHandler(handleDetailShow)
  );

})();
