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

  const LOG_APP = String(CONFIG.logAppId || '').trim();

  const DIALOG_STYLE = CONFIG.dialogStyle || {};

  const RAW_TOKENS = (CONFIG.tokens || []).reduce((m, t) => {
    if (t && t.appId && t.token) m[String(t.appId)] = t.token;
    return m;
  }, {});
  const RAW_SELF_TOKEN = CONFIG.selfAppToken || '';
  const RAW_LOG_TOKEN = String(CONFIG.logToken || '').trim();
  if (LOG_APP && RAW_LOG_TOKEN) RAW_TOKENS[LOG_APP] = RAW_LOG_TOKEN;

  const SECURED_APP_IDS = new Set(
    (CONFIG.tokens || []).filter((t) => t && t.appId && t.secured).map((t) => String(t.appId))
  );
  const HAS_SECURED_SELF = CONFIG.hasSelfToken === true;
  if (LOG_APP && CONFIG.hasLogToken === true) SECURED_APP_IDS.add(LOG_APP);

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
    const pick = (ns) => {
      try {
        const id = ns && ns.getId ? ns.getId() : null;
        return id != null && /^\d+$/.test(String(id)) ? String(id) : '';
      } catch (e) { return ''; }
    };
    return pick(APP_NS) || pick(MOBILE_NS) ||
      ((/\/k\/(?:m\/)?(?:guest\/\d+\/)?(\d+)\//.exec(window.location.pathname || '') || [])[1] || '');
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

  const apiWithToken = async (path, method, body, appIdForToken) => {
    const sApp = String(appIdForToken);
    const isSelf = sApp === getAppId();

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

    const secured = SECURED_APP_IDS.has(sApp) || (isSelf && HAS_SECURED_SELF);
    if (secured) {
      let url = kintone.api.url(path, true);
      let data = body;
      if (method === 'GET' || method === 'DELETE') {

        const qs = new URLSearchParams();
        Object.entries(body || {}).forEach(([k, v]) => {
          if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x));
          else qs.append(k, v);
        });
        url = `${url}?${qs}`;
        data = {};
      }

      const [respBody, status] = await kintone.plugin.app.proxy(PLUGIN_ID, url, method, {}, data);
      if (status < 200 || status >= 300) throw new Error(`API ${path} ${status}: ${respBody}`);
      return respBody ? JSON.parse(respBody) : {};
    }

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

      const fullWriteErr = (e && e.message) || String(e);
      const minimal = {
        [LOG_FIELDS.event]:   text(trigger || (ev && ev.type)),
        [LOG_FIELDS.result]:  text(result),
        [LOG_FIELDS.message]: text(`[${category}] ${message}\n（完整欄位寫入失敗，已退化為最小欄位；原始錯誤：${fullWriteErr}）`),
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

  const downloadFileBlob = async (fileKey) => {
    const url = kintone.api.url('/k/v1/file.json', true) + '?fileKey=' + encodeURIComponent(fileKey);
    const resp = await fetch(url, { method: 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
    if (!resp.ok) throw new Error(`file download ${resp.status}`);
    return await resp.blob();
  };

  const uploadFileBlob = async (blob, name) => {
    const form = new FormData();
    form.append('file', blob, name || 'file');
    const resp = await fetch(kintone.api.url('/k/v1/file.json', true), { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include', body: form });
    if (!resp.ok) throw new Error(`file upload ${resp.status}`);
    const data = await resp.json();
    return data.fileKey;
  };

  const copyAttachments = async (files, maxFileSize, onError) => {
    const out = [];
    for (const f of (files || [])) {
      try {
        if (f && Number(f.size) > maxFileSize) {
          const msg = `附件「${f.name}」(${f.size} bytes) 超過上限 ${maxFileSize}`;
          if (onError === 'block') throw new Error(msg);
          console.warn('[sda] copyAttachment 跳過：' + msg);
          continue;
        }
        const blob = await downloadFileBlob(f.fileKey);
        const newKey = await uploadFileBlob(blob, f.name);
        out.push({ fileKey: newKey });
      } catch (e) {
        if (onError === 'block') throw e;
        console.warn(`[sda] copyAttachment 跳過檔案「${f && f.name}」：`, e.message || e);
      }
    }
    return out;
  };

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
      case 'appendText': {
        const p = spec.valueParam || {};
        const newRaw = await resolveValue(p.value || {}, ctx);
        const newVal = newRaw == null ? '' : String(newRaw).trim();
        const sep = typeof p.separator === 'string' ? p.separator : ' / ';
        const dedup = p.dedup !== false;

        const existingField = ctx.isOther
          ? (ctx.targetRecord && ctx.targetRecord[spec.targetField])
          : record[spec.targetField];
        const existingRaw = existingField ? existingField.value : '';
        const existing = typeof existingRaw === 'string' ? existingRaw.trim() : String(existingRaw ?? '');

        if (!newVal) { _resolvedValue = existing; break; }
        if (!existing) { _resolvedValue = newVal; break; }

        const parts = existing.split(sep).map((s) => s.trim()).filter(Boolean);
        if (dedup && parts.includes(newVal)) { _resolvedValue = existing; break; }
        parts.push(newVal);
        _resolvedValue = parts.join(sep);
        break;
      }
      case 'copyAttachment': {

        const p = spec.valueParam || {};
        const from = p.from || {};
        const onErr = p.onError === 'block' ? 'block' : 'log';
        const maxSize = Number(p.maxFileSize) || 10485760;
        const mode = p.mode === 'append' ? 'append' : 'replace';
        const srcField = from.attachmentField;

        const existingField = ctx.isOther
          ? (ctx.targetRecord && ctx.targetRecord[spec.targetField])
          : record[spec.targetField];
        const existingVal = (existingField && Array.isArray(existingField.value)) ? existingField.value : [];

        if (!/\.submit\.success$/.test(ctx.trigger || '')) {
          console.warn('[sda] copyAttachment 僅在 *.submit.success 生效，已略過');
          _resolvedValue = existingVal;
          break;
        }
        if (!srcField) {
          console.warn('[sda] copyAttachment: from.attachmentField 未設定');
          _resolvedValue = existingVal;
          break;
        }

        let srcFiles = [];
        if (!from.app || from.app === 'this') {
          const f = record[srcField];
          srcFiles = (f && Array.isArray(f.value)) ? f.value : [];
        } else {
          const keyVal = String(from.keyExpr || '').replace(/\{([^}]+)\}/g, (_, c) => {
            const ff = record[c.trim()];
            return ff ? String(ff.value || '') : '';
          });
          const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET',
            { app: from.app, query: `${from.keyField} = "${keyVal}" limit 1`, fields: [srcField] });
          const rec0 = resp.records && resp.records[0];
          srcFiles = (rec0 && rec0[srcField] && Array.isArray(rec0[srcField].value)) ? rec0[srcField].value : [];
        }

        if (srcFiles.length === 0) { _resolvedValue = existingVal; break; }

        if (mode === 'append') {

          const sig = (x) => `${x && x.name}::${x && x.size}`;
          const existingSig = new Set(existingVal.map(sig));
          const toCopy = srcFiles.filter((x) => !existingSig.has(sig(x)));
          const keptExisting = await copyAttachments(existingVal, maxSize, 'log');
          const copied = await copyAttachments(toCopy, maxSize, onErr);
          _resolvedValue = [...keptExisting, ...copied];
        } else {
          _resolvedValue = await copyAttachments(srcFiles, maxSize, onErr);
        }
        break;
      }
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

  const appendTextNeedsTarget = (m) => m && m.valueSource === 'appendText';

  const copyAttachmentNeedsTarget = (m) => m && m.valueSource === 'copyAttachment' && m.valueParam && m.valueParam.mode === 'append';

  const ruleNeedsTargetRecord = (rule) => (rule.fieldMapping || []).some((m) => dateShiftNeedsTarget(m) || appendTextNeedsTarget(m) || copyAttachmentNeedsTarget(m));

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

        const appendOpt = rule.valueSource === 'copyAttachment' ? false : (rule.appendMode === true);
        const ok = writeToField(ctx.record, rule.targetField, raw, { append: appendOpt });
        return;
      }
    }
  };

  const CANCEL_MESSAGE_DEFAULT = '已取消操作。';

  const interpolateFields = (text, record) => String(text == null ? '' : text).replace(/\{([^}]+)\}/g, (_, code) => {
    const c = code.trim();
    const f = record && record[c];
    if (!f) {
      console.warn(`[sda][dialog] 訊息中的欄位代碼 "${c}" 在本記錄找不到，已代成空字串`);
      return '';
    }
    const v = f.value;
    if (Array.isArray(v)) {
      return v.map((x) => (x && typeof x === 'object') ? String(x.name || x.code || '') : String(x)).join('、');
    }
    return v == null ? '' : String(v);
  });

  const runDialog = async (rule, ctx) => {
    if (!window.SdaDialog) {
      console.warn('[sda][dialog] SdaDialog 未載入，規則已略過');
      return true;
    }
    const d = rule.dialog || {};
    const blockable = !ctx.noBlock &&
      (ctx.trigger === 'process.proceed' || /\.submit$/.test(ctx.trigger || ''));
    const cancelLabel = blockable ? String(d.cancelLabel || '').trim() : '';
    return window.SdaDialog.show({
      icon: d.icon || 'warn',
      title: interpolateFields(d.title, ctx.record),
      text: interpolateFields(d.text, ctx.record),
      confirmLabel: d.confirmLabel || 'OK',
      cancelLabel,
      accent: d.accent,
      style: DIALOG_STYLE,
    });
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
    const otherCtx = { ...ctx, isOther: true };

    switch (rule.writeMode) {
      case 'create': {
        const { payload, suspects } = await buildOtherPayload(rule, otherCtx);
        await apiWrite('POST', { app, record: payload }, app, suspects);
        return;
      }
      case 'update':
      case 'upsert':
      default: {
        const keyParts = await Promise.all((rule.keyMapping || []).map(async (m) => {
          const v = await resolveValue(m, otherCtx);
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
          const { payload, suspects } = await buildOtherPayload(rule, { ...otherCtx, targetRecord });
          await apiWrite('PUT', { app, id, record: payload }, app, suspects);
        } else if (rule.writeMode === 'upsert') {
          const { payload, suspects } = await buildOtherPayload(rule, otherCtx);
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

      const msg = `補償寫入失敗，請聯繫管理員手動補記錄。\n${e.message}`;
      if (window.SdaDialog) {
        window.SdaDialog.show({ icon: 'warn', title: '警告', text: msg, confirmLabel: '確定', style: DIALOG_STYLE });
      } else {
        console.warn(`[sda] ${msg}`);
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
        if (rule.action === 'dialog') {
          const confirmed = await runDialog(rule, ctx);
          if (!confirmed) {
            const label = rule.label || rule.id;
            const message = String((rule.dialog && rule.dialog.cancelMessage) || '').trim() || CANCEL_MESSAGE_DEFAULT;
            _runInfo.cancelled = { rule: label, message };
            event.error = message;
            return event;
          }
          continue;
        }
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

    if (errored && _runInfo.cancelled) {
      const c = _runInfo.cancelled;
      try {
        await writeLog({
          ev, trigger, result: '取消', category: 'cancelled',
          message: `規則「${c.rule}」的提醒視窗被使用者取消：${c.message}`,
        });
      } catch (e) {
        console.error('[sda] writeLog failed', e);
      }
      return out;
    }

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

  const runProceedRulesViaApi = async ({ recordId, action = '', fromStatus = '', toStatus = '' } = {}) => {
    if (!recordId) throw new Error('[sda] runProceedRulesViaApi: recordId 必填');
    if (!CONFIG.rules || CONFIG.rules.length === 0) return { matched: 0, written: false };

    const appId = getAppId();

    const getResp = await apiWithToken('/k/v1/record.json', 'GET', { app: appId, id: recordId }, appId);
    const record = getResp.record;
    if (!record) throw new Error(`[sda] runProceedRulesViaApi: 找不到記錄 ${recordId}`);

    const resolvedNext = toStatus || (record['狀態'] && record['狀態'].value) ||
      (record.$status && record.$status.value) || '';
    const event = {
      type: 'app.record.detail.process.proceed',
      record,
      action: { value: action },
      status: { value: fromStatus },
      nextStatus: { value: resolvedNext },
    };

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

    const touchedFields = [];
    for (const rule of selfRules) {

      if (rule.action === 'dialog') { await runDialog(rule, { ...ctx, noBlock: true }); continue; }
      await runWriteSelf(rule, ctx);
      if (rule.targetField) touchedFields.push(rule.targetField);
    }

    let written = false;
    const uniqueFields = [...new Set(touchedFields)];
    if (uniqueFields.length > 0) {
      const changed = snapshotFields(record, uniqueFields);
      await apiWithToken('/k/v1/record.json', 'PUT', { app: appId, id: recordId, record: changed }, appId);
      written = true;
    }

    for (const rule of otherRules) {
      await runWriteOther(rule, ctx);
    }

    return { matched: matched.length, written };
  };

  window.NXSdaProceed = window.NXSdaProceed || { run: runProceedRulesViaApi };

  window.NXSdaApi = window.NXSdaApi || { call: (path, method, body, appIdForToken) => apiWithToken(path, method, body, appIdForToken) };

  const runSuccessRules = async (trigger, ev) => {
    try {
      if (!CONFIG.rules || CONFIG.rules.length === 0) return;
      const recordId = ev.recordId || (ev.record && ev.record.$id && ev.record.$id.value);
      if (!recordId) return;

      const appId = getAppId();
      const getResp = await apiWithToken('/k/v1/record.json', 'GET', { app: appId, id: recordId }, appId);
      const record = getResp.record;
      if (!record) return;

      const event = { type: ev.type, record };
      const ctx = { event, record, trigger };

      const matched = (CONFIG.rules || []).filter((r) =>
        r.enabled !== false && triggerMatches(r, trigger) && statusMatches(r, event, record, trigger)
      );
      if (matched.length === 0) return;

      const selfRules = matched.filter((r) => r.action !== 'writeOther');
      const otherRules = matched.filter((r) => r.action === 'writeOther');

      const touchedFields = [];
      for (const rule of selfRules) {
        if (rule.action === 'dialog') { await runDialog(rule, ctx); continue; }
        await runWriteSelf(rule, ctx);
        if (rule.targetField) touchedFields.push(rule.targetField);
      }
      const uniqueFields = [...new Set(touchedFields)];
      if (uniqueFields.length > 0) {
        const changed = snapshotFields(record, uniqueFields);
        await apiWithToken('/k/v1/record.json', 'PUT', { app: appId, id: recordId, record: changed }, appId);
      }

      for (const rule of otherRules) {
        try { await runWriteOther(rule, ctx); }
        catch (e) { console.error(`[sda] success cross-app rule "${rule.label || rule.id}" failed`, e); }
      }
    } catch (e) {
      console.error('[sda] runSuccessRules failed', e);
    }
  };

  const CREATOR_CHECK = Object.assign({
    enabled: false,
    buttonLabel: '建立人狀態檢查',
    columns: [],
    allowEdit: true,
    allowDelete: false,
    maxRecords: 500,
    onlyInvalidDefault: false,
    visibility: { mode: 'all', users: [], organizations: [], groups: [] },
  }, CONFIG.creatorCheck || {});
  CREATOR_CHECK.visibility = Object.assign(
    { mode: 'all', users: [], organizations: [], groups: [] },
    CREATOR_CHECK.visibility || {}
  );

  const HAS_ADMIN_API = CONFIG.hasAdminApiToken === true;

  const CC_EDITABLE_TYPES = new Set([
    'SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT', 'NUMBER', 'LINK',
    'DROP_DOWN', 'RADIO_BUTTON', 'CHECK_BOX', 'MULTI_SELECT',
    'DATE', 'TIME', 'DATETIME',
    'USER_SELECT', 'ORGANIZATION_SELECT', 'GROUP_SELECT',
  ]);

  const CC_DIR_KINDS = {
    USER_SELECT:         { path: 'users.json',         key: 'users' },
    ORGANIZATION_SELECT: { path: 'organizations.json', key: 'organizations' },
    GROUP_SELECT:        { path: 'groups.json',        key: 'groups' },
  };

  const CC_LIKE_TYPES = new Set(['', 'SINGLE_LINE_TEXT', 'LINK', 'MULTI_LINE_TEXT', 'RICH_TEXT']);

  const USER_API_BASE = `${location.origin}/v1/`;

  const CC_CREATOR_FALLBACK_CODES = ['建立人', '作成者', 'Created_by'];

  const userApiGet = async (path, params) => {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x));
      else if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const q = qs.toString();
    const url = USER_API_BASE + String(path).replace(/^\//, '') + (q ? `?${q}` : '');
    const [body, status] = await kintone.plugin.app.proxy(PLUGIN_ID, url, 'GET', {}, {});
    if (status < 200 || status >= 300) throw new Error(`User API ${path} ${status}: ${body}`);
    return body ? JSON.parse(body) : {};
  };

  window.NXSdaUserApi = window.NXSdaUserApi || { get: userApiGet };

  const ccQueryCondition = () => {
    try { if (APP_NS && APP_NS.getQueryCondition) return APP_NS.getQueryCondition() || ''; } catch (e) {  }
    try { if (MOBILE_NS && MOBILE_NS.getQueryCondition) return MOBILE_NS.getQueryCondition() || ''; } catch (e) {  }
    return '';
  };

  const ccFetchRecords = async (fields, limit) => {
    const appId = getAppId();
    const cond = ccQueryCondition();
    const out = [];
    let offset = 0;
    while (out.length < limit) {
      const size = Math.min(500, limit - out.length);
      const query = `${cond ? `${cond} ` : ''}limit ${size} offset ${offset}`;
      const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET',
        { app: appId, query, fields });
      const recs = (resp && resp.records) || [];
      out.push(...recs);
      if (recs.length < size) break;
      offset += recs.length;
    }
    return out;
  };

  const chunk = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  const ccEvaluateRights = async (ids) => {
    const map = {};
    const appId = getAppId();
    for (const part of chunk(ids, 100)) {
      try {
        const resp = await kintone.api(kintone.api.url('/k/v1/records/acl/evaluate.json', true), 'GET',
          { app: appId, ids: part });
        (resp.rights || []).forEach((r) => {
          map[String(r.id)] = {
            editable: !!(r.record && r.record.editable),
            deletable: !!(r.record && r.record.deletable),
          };
        });
      } catch (e) {
        console.warn('[sda][creatorCheck] acl/evaluate 失敗，該批視為可編輯可刪除（實際仍由 kintone 擋）', e);
        part.forEach((id) => { map[String(id)] = { editable: true, deletable: true }; });
      }
    }
    return map;
  };

  const ccFetchUsersByCodes = async (codes) => {
    const map = {};
    for (const part of chunk(codes, 100)) {
      const resp = await userApiGet('users.json', { codes: part, size: 100 });
      (resp.users || []).forEach((u) => { map[String(u.code)] = u; });
    }
    return map;
  };

  const ccFetchUsersAll = async () => {
    const map = {};
    for (let page = 0; page < 50; page++) {
      const resp = await userApiGet('users.json', { size: 100, offset: page * 100 });
      const users = resp.users || [];
      users.forEach((u) => { map[String(u.code)] = u; });
      if (users.length < 100) break;
    }
    return map;
  };

  const ccFetchUsers = async (codes) => {
    try { return await ccFetchUsersByCodes(codes); }
    catch (e) {
      console.warn('[sda][creatorCheck] codes 查詢失敗，改以分頁列舉全部使用者', e);
      return ccFetchUsersAll();
    }
  };

  const CC_STATUS_META = {
    ok:      { label: '正常',    cls: 'sda-panel-tag-ok' },
    off:     { label: '已停用',  cls: 'sda-panel-tag-off' },
    gone:    { label: '已刪除',  cls: 'sda-panel-tag-gone' },
    unknown: { label: '查不到',  cls: 'sda-panel-tag-unknown' },
  };

  const ccDisplayValue = (field, cell) => {
    if (!cell) return '';
    const v = cell.value;
    if (v == null || v === '') return '';
    const type = cell.type || (field && field.type);
    switch (type) {
      case 'CREATOR': case 'MODIFIER':
        return v.name || v.code || '';
      case 'USER_SELECT': case 'ORGANIZATION_SELECT': case 'GROUP_SELECT': case 'STATUS_ASSIGNEE':
        return (v || []).map((x) => x.name || x.code).join('、');
      case 'CREATED_TIME': case 'UPDATED_TIME': {
        const d = new Date(v);
        return isNaN(d.getTime()) ? String(v) : `${toISODate(d)} ${toHHmm(d)}`;
      }
      case 'CHECK_BOX': case 'MULTI_SELECT': case 'CATEGORY':
        return (v || []).join('、');
      case 'FILE':
        return (v || []).map((f) => f.name).join('、');
      case 'SUBTABLE':
        return `（子表格 ${(v || []).length} 列）`;
      default:
        return String(v);
    }
  };

  const ccNormValue = (v) => {
    if (Array.isArray(v)) {
      return JSON.stringify(v.map((x) => (x && typeof x === 'object' ? String(x.code) : String(x))).sort());
    }
    return v == null ? '' : String(v);
  };

  const ccFilterOptions = (opts, kw) => {
    const k = String(kw || '').trim().toLowerCase();
    if (!k) return opts;
    return opts.filter((o) => `${o.label} ${o.v} ${o.sub || ''}`.toLowerCase().includes(k));
  };

  const ccDirCache = {};
  const ccDirectory = (type) => {
    if (!ccDirCache[type]) {
      const kind = CC_DIR_KINDS[type];
      ccDirCache[type] = (async () => {
        const out = [];
        for (let page = 0; page < 50; page++) {
          const resp = await userApiGet(kind.path, { size: 100, offset: page * 100 });
          const list = resp[kind.key] || [];
          list.forEach((x) => {
            if (x.valid === false || x.valid === 'false') return;
            out.push({ v: String(x.code), label: x.name || String(x.code), sub: String(x.code) });
          });
          if (list.length < 100) break;
        }
        return out;
      })().catch((e) => { delete ccDirCache[type]; throw e; });
    }
    return ccDirCache[type];
  };

  const ccLookupSearch = (lookup) => {
    const app = lookup.relatedApp && lookup.relatedApp.app;
    const keyField = lookup.relatedKeyField;
    const pickerFields = (lookup.lookupPickerFields || []).filter((f) => f !== keyField).slice(0, 3);
    let keyTypeP = null;
    return async (kw) => {
      if (!keyTypeP) {
        keyTypeP = kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', { app })
          .then((r) => ((r.properties || {})[keyField] || {}).type || '')
          .catch(() => '');
      }
      const keyType = await keyTypeP;
      const conds = [];
      if (lookup.filterCond) conds.push(`(${lookup.filterCond})`);
      const k = String(kw || '').trim();
      if (k) {
        const esc = k.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        if (CC_LIKE_TYPES.has(keyType)) conds.push(`${keyField} like "${esc}"`);
        else if (/^-?\d+(\.\d+)?$/.test(k)) conds.push(`${keyField} = "${esc}"`);
        else return [];
      }
      const query = `${conds.join(' and ')}${lookup.sort ? ` order by ${lookup.sort}` : ''} limit 30`.trim();
      const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET',
        { app, query, fields: [keyField, ...pickerFields] });
      return ((resp && resp.records) || [])
        .map((r) => ({
          v: r[keyField] && r[keyField].value != null ? String(r[keyField].value) : '',
          label: r[keyField] && r[keyField].value != null ? String(r[keyField].value) : '',
          sub: pickerFields.map((f) => ccDisplayValue(null, r[f])).filter(Boolean).join('｜'),
        }))
        .filter((o) => o.v !== '');
    };
  };

  const ccPicker = ({ multi, clearable, initial, search, allowFree, placeholder, emptyHint, onChange }) => {
    let selected = initial.slice();
    let items = [];
    let active = -1;
    let seq = 0;
    let timer = null;

    const box = document.createElement('div');
    box.className = 'sda-pick';
    const chips = document.createElement('span');
    chips.style.display = 'contents';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sda-pick-input';
    box.appendChild(chips);
    box.appendChild(input);

    const menu = document.createElement('div');
    menu.className = 'sda-pick-menu';

    const emit = () => onChange(selected.map((s) => s.v));

    const renderChips = () => {
      chips.textContent = '';
      selected.forEach((s, i) => {
        const chip = document.createElement('span');
        chip.className = 'sda-pick-chip';
        chip.title = s.sub ? `${s.label}（${s.sub}）` : s.label;
        chip.appendChild(document.createTextNode(s.label));
        if (multi || clearable) {
          const x = document.createElement('button');
          x.type = 'button';
          x.className = 'sda-pick-x';
          x.textContent = '×';
          x.addEventListener('click', () => { selected.splice(i, 1); renderChips(); emit(); });
          chip.appendChild(x);
        }
        chips.appendChild(chip);
      });
      input.placeholder = (!multi && selected.length) ? '' : placeholder;
    };

    const onOuterScroll = (e) => { if (e.target !== menu) place(); };
    function closeMenu() {
      seq++;
      if (menu.parentNode) menu.parentNode.removeChild(menu);
      window.removeEventListener('scroll', onOuterScroll, true);
      items = [];
      active = -1;
    }

    function place() {
      const r = input.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - 324))}px`;
      menu.style.top = `${r.bottom + 2}px`;
      menu.style.minWidth = `${Math.max(r.width, 220)}px`;
    }

    const note = (text) => {
      const d = document.createElement('div');
      d.className = 'sda-pick-empty';
      d.textContent = text;
      menu.appendChild(d);
    };

    const renderMenu = () => {
      menu.textContent = '';
      const kw = input.value.trim();
      if (!items.length) {
        if (allowFree && kw) note(`找不到符合項目，按 Enter 直接加入「${kw}」`);
        else note(kw ? '找不到符合項目' : (emptyHint || '輸入關鍵字搜尋'));
        return;
      }
      items.forEach((o, i) => {
        const it = document.createElement('div');
        it.className = `sda-pick-item${i === active ? ' is-active' : ''}`;
        it.appendChild(document.createTextNode(o.label));
        if (o.sub && o.sub !== o.label) {
          const sub = document.createElement('span');
          sub.className = 'sda-pick-sub';
          sub.textContent = o.sub;
          it.appendChild(sub);
        }
        it.addEventListener('mousedown', (e) => { e.preventDefault(); pick(o); });
        menu.appendChild(it);
      });
    };

    const openMenu = async () => {
      const my = ++seq;
      menu.textContent = '';
      note('搜尋中…');
      if (!menu.parentNode) {
        document.body.appendChild(menu);
        window.addEventListener('scroll', onOuterScroll, true);
      }
      place();
      let res;
      try { res = await search(input.value.trim()); }
      catch (e) {
        if (my !== seq) return;
        menu.textContent = '';
        note(`搜尋失敗：${(e && e.message) || String(e)}`);
        return;
      }
      if (my !== seq) return;
      const taken = new Set(selected.map((s) => s.v));
      items = (res || []).filter((o) => !multi || !taken.has(o.v)).slice(0, 50);
      active = items.length ? 0 : -1;
      renderMenu();
    };

    function pick(o) {
      if (multi) { if (!selected.some((s) => s.v === o.v)) selected.push(o); }
      else selected = [o];
      input.value = '';
      renderChips();
      emit();
      if (multi) openMenu();
      else { closeMenu(); input.blur(); }
    }

    box.addEventListener('mousedown', (e) => {
      if (e.target === input || (e.target.closest && e.target.closest('.sda-pick-x'))) return;
      e.preventDefault();
      if (document.activeElement === input) openMenu();
      else input.focus();
    });
    box.style.cursor = 'text';
    input.addEventListener('focus', openMenu);
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(openMenu, 250); });
    input.addEventListener('blur', () => setTimeout(closeMenu, 150));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return;
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        renderMenu();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const kw = input.value.trim();
        if (active >= 0 && items[active]) pick(items[active]);
        else if (allowFree && kw) pick({ v: kw, label: kw });
        return;
      }
      if (e.key === 'Backspace' && !input.value && multi && selected.length) {
        selected.pop();
        renderChips();
        emit();
      }
    });

    renderChips();
    return box;
  };

  const ccToLocalDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${toISODate(d)}T${toHHmm(d)}`;
  };

  const ccMakeEditor = (field, cell, onChange) => {
    const type = field.type;
    const raw = cell ? cell.value : null;
    const cur = raw != null && !Array.isArray(raw) ? String(raw) : '';

    if (field.lookup && field.lookup.relatedApp) {
      return ccPicker({
        multi: false, clearable: true, allowFree: false,
        initial: cur ? [{ v: cur, label: cur }] : [],
        search: ccLookupSearch(field.lookup),
        placeholder: '搜尋關聯 App…',
        emptyHint: '輸入關鍵字搜尋關聯 App 的記錄（留空列出前 30 筆）',
        onChange: (vals) => onChange(vals[0] || ''),
      });
    }

    if (type === 'DROP_DOWN' || type === 'RADIO_BUTTON' || type === 'CHECK_BOX' || type === 'MULTI_SELECT') {
      const opts = Object.values(field.options || {})
        .sort((a, b) => Number(a.index) - Number(b.index))
        .map((o) => ({ v: o.label, label: o.label }));
      const multi = type === 'CHECK_BOX' || type === 'MULTI_SELECT';
      const initVals = multi ? (Array.isArray(raw) ? raw : []) : (cur ? [cur] : []);
      return ccPicker({
        multi, clearable: type !== 'RADIO_BUTTON', allowFree: false,
        initial: initVals.map((v) => ({ v: String(v), label: String(v) })),
        search: async (kw) => ccFilterOptions(opts, kw),
        placeholder: multi ? '搜尋選項加入…' : '搜尋選項…',
        onChange: (vals) => onChange(multi ? vals : (vals[0] || '')),
      });
    }

    if (CC_DIR_KINDS[type]) {
      const noun = { USER_SELECT: '使用者', ORGANIZATION_SELECT: '組織', GROUP_SELECT: '群組' }[type];
      return ccPicker({
        multi: true, clearable: true, allowFree: !HAS_ADMIN_API,
        initial: (Array.isArray(raw) ? raw : []).map((x) => ({ v: String(x.code), label: x.name || String(x.code), sub: String(x.code) })),
        search: async (kw) => (HAS_ADMIN_API ? ccFilterOptions(await ccDirectory(type), kw) : []),
        placeholder: HAS_ADMIN_API ? `搜尋${noun}姓名或代碼…` : `輸入${noun}代碼後按 Enter`,
        emptyHint: HAS_ADMIN_API
          ? `輸入${noun}姓名或代碼搜尋`
          : `未設定共通管理 API 權杖，無法搜尋；請輸入完整${noun}代碼後按 Enter`,
        onChange: (vals) => onChange(vals.map((code) => ({ code }))),
      });
    }

    if (type === 'DATETIME') {
      const inp = document.createElement('input');
      inp.type = 'datetime-local';
      inp.value = ccToLocalDateTime(cur);
      inp.addEventListener('input', () => {
        const d = inp.value ? new Date(inp.value) : null;
        onChange(d && !isNaN(d.getTime()) ? d.toISOString().replace(/\.\d{3}Z$/, 'Z') : '');
      });
      return inp;
    }

    if (type === 'MULTI_LINE_TEXT' || type === 'RICH_TEXT') {
      const ta = document.createElement('textarea');
      ta.rows = 1;
      ta.value = cur;
      ta.addEventListener('input', () => onChange(ta.value));
      return ta;
    }

    const inp = document.createElement('input');
    switch (type) {
      case 'NUMBER': inp.type = 'number'; break;
      case 'DATE':   inp.type = 'date'; break;
      case 'TIME':   inp.type = 'time'; break;
      default:       inp.type = 'text';
    }
    inp.value = cur;
    inp.addEventListener('input', () => onChange(inp.value));
    return inp;
  };

  const openCreatorCheckPanel = async (btn) => {
    const dialog = window.SdaDialog;
    if (!dialog || !dialog.showPanel) {
      alert('提醒視窗元件未載入，請重新整理頁面後再試。');
      return;
    }
    const labelEl = btn._sdaLabelEl;
    const originalLabel = labelEl ? labelEl.textContent : btn.textContent;
    const setLabel = (text) => { if (labelEl) labelEl.textContent = text; else btn.textContent = text; };
    btn.disabled = true;
    setLabel('查詢中…');

    try {
      const appId = getAppId();
      const props = await (async () => {
        const resp = await kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', { app: appId });
        return (resp && resp.properties) || {};
      })();

      const cond = ccQueryCondition();
      const probe = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET',
        { app: appId, query: `${cond ? `${cond} ` : ''}limit 1` });
      const probeRec = ((probe && probe.records) || [])[0];
      if (!probeRec) {
        await dialog.show({
          icon: 'info', title: CREATOR_CHECK.buttonLabel,
          text: '目前的一覽表篩選條件下沒有任何記錄。', confirmLabel: '關閉', style: DIALOG_STYLE,
        });
        return;
      }
      const creatorCode = Object.keys(probeRec).find((c) => probeRec[c].type === 'CREATOR')
        || Object.keys(props).find((c) => props[c].type === 'CREATOR')
        || CC_CREATOR_FALLBACK_CODES.find((c) => probeRec[c] || props[c])
        || CC_CREATOR_FALLBACK_CODES[0];

      const columns = (CREATOR_CHECK.columns || [])
        .filter((col) => col && col.field)
        .map((col) => {

          const field = props[col.field]
            || { type: (probeRec[col.field] && probeRec[col.field].type) || 'SINGLE_LINE_TEXT', label: col.field };
          const editable = CREATOR_CHECK.allowEdit && !!col.editable && CC_EDITABLE_TYPES.has(field.type);
          return { code: col.field, label: field.label || col.field, field, editable };
        });

      const limit = Math.min(Math.max(Number(CREATOR_CHECK.maxRecords) || 500, 1), 5000);
      const fields = [...new Set(['$id', '$revision', creatorCode, ...columns.map((c) => c.code)])];
      const records = await ccFetchRecords(fields, limit);
      if (!records.length) return;

      const ids = records.map((r) => r.$id.value);
      const codes = [...new Set(records.map((r) => (r[creatorCode] && r[creatorCode].value && r[creatorCode].value.code) || '').filter(Boolean))];

      let users = {};
      let userApiError = '';
      if (!HAS_ADMIN_API) {
        userApiError = '尚未在外掛設定填入「共通管理 API 權杖」，無法查詢帳號狀態。';
      } else {
        try { users = await ccFetchUsers(codes); }
        catch (e) { userApiError = `帳號狀態查詢失敗：${(e && e.message) || String(e)}`; }
      }

      const rights = await ccEvaluateRights(ids);

      const rows = records.map((rec) => {
        const cr = (rec[creatorCode] && rec[creatorCode].value) || {};
        const code = cr.code || '';
        const u = users[code];
        let status;
        if (userApiError || !code) status = 'unknown';
        else if (!u) status = 'gone';
        else status = (u.valid === false || u.valid === 'false') ? 'off' : 'ok';
        const right = rights[String(rec.$id.value)] || { editable: true, deletable: true };
        return {
          id: rec.$id.value,
          revision: rec.$revision ? rec.$revision.value : undefined,
          record: rec,
          creatorCode: code,
          creatorName: cr.name || code || '（無）',
          status,
          user: u || null,
          editable: right.editable,
          deletable: right.deletable,
          dirty: {},
          tr: null,
        };
      });

      const badCount = rows.filter((r) => r.status === 'off' || r.status === 'gone').length;
      const canDelete = CREATOR_CHECK.allowDelete && rows.some((r) => r.deletable);
      const canEditAny = columns.some((c) => c.editable);

      const wrap = document.createElement('div');
      wrap.className = 'sda-panel';

      const bar = document.createElement('div');
      bar.className = 'sda-panel-bar';

      const mkBtn = (label, cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `sda-panel-btn${cls ? ` ${cls}` : ''}`;
        b.textContent = label;
        return b;
      };

      let onlyBad = !!CREATOR_CHECK.onlyInvalidDefault && badCount > 0;
      const filterBtn = mkBtn('', '');
      const selInfo = document.createElement('span');
      selInfo.style.fontSize = '12px';
      selInfo.style.color = '#6b7480';
      const saveBtn = mkBtn('儲存變更', 'sda-panel-btn-primary');
      const delBtn = mkBtn('刪除選取', 'sda-panel-btn-danger');
      const msg = document.createElement('span');
      msg.className = 'sda-panel-msg';

      bar.appendChild(filterBtn);
      bar.appendChild(selInfo);
      bar.appendChild(msg);
      const spacer = document.createElement('span');
      spacer.className = 'sda-panel-spacer';
      bar.appendChild(spacer);
      if (canEditAny) bar.appendChild(saveBtn);
      if (canDelete) bar.appendChild(delBtn);
      wrap.appendChild(bar);

      const scroll = document.createElement('div');
      scroll.className = 'sda-panel-scroll';
      const table = document.createElement('table');
      table.className = 'sda-panel-table';

      const thead = document.createElement('thead');
      const htr = document.createElement('tr');
      const thAll = document.createElement('th');
      const allCb = document.createElement('input');
      allCb.type = 'checkbox';
      allCb.title = '全選 / 全不選（只影響目前顯示的列）';
      thAll.appendChild(allCb);
      htr.appendChild(thAll);
      ['記錄編號', '建立人', '帳號狀態', ...columns.map((c) => c.label)].forEach((label) => {
        const th = document.createElement('th');
        th.textContent = label;
        htr.appendChild(th);
      });
      thead.appendChild(htr);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const refreshCounters = () => {
        const sel = rows.filter((r) => r.cb && r.cb.checked).length;
        const dirty = rows.filter((r) => Object.keys(r.dirty).length > 0).length;
        selInfo.textContent = `共 ${rows.length} 筆，異常 ${badCount} 筆｜已選 ${sel} 筆｜待儲存 ${dirty} 筆`;
        saveBtn.disabled = dirty === 0;
        delBtn.disabled = sel === 0;
      };

      rows.forEach((row) => {
        const tr = document.createElement('tr');
        row.tr = tr;
        if (row.status === 'off' || row.status === 'gone') tr.classList.add('sda-panel-bad');

        const tdCb = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.addEventListener('change', refreshCounters);
        row.cb = cb;
        tdCb.appendChild(cb);
        tr.appendChild(tdCb);

        const tdId = document.createElement('td');
        const idLink = document.createElement('a');
        idLink.href = `${location.origin}/k/${appId}/show#record=${row.id}`;
        idLink.target = '_blank';
        idLink.rel = 'noopener';
        idLink.className = 'sda-panel-link';
        idLink.textContent = String(row.id);
        tdId.appendChild(idLink);
        tr.appendChild(tdId);

        const tdCreator = document.createElement('td');
        tdCreator.textContent = row.creatorCode ? `${row.creatorName}（${row.creatorCode}）` : row.creatorName;
        tr.appendChild(tdCreator);

        const tdStatus = document.createElement('td');
        const meta = CC_STATUS_META[row.status];
        const tag = document.createElement('span');
        tag.className = `sda-panel-tag ${meta.cls}`;
        tag.textContent = meta.label;
        tdStatus.appendChild(tag);
        if (!row.editable || (CREATOR_CHECK.allowDelete && !row.deletable)) {
          const lock = document.createElement('span');
          lock.style.marginLeft = '6px';
          lock.style.fontSize = '12px';
          lock.style.color = '#9aa3ad';
          lock.textContent = row.editable ? '🔒不可刪' : '🔒唯讀';
          tdStatus.appendChild(lock);
        }
        tr.appendChild(tdStatus);

        columns.forEach((col) => {
          const td = document.createElement('td');
          const cell = row.record[col.code];
          if (col.editable && row.editable) {
            td.appendChild(ccMakeEditor(col.field, cell, (v) => {
              if (ccNormValue(v) === ccNormValue(cell && cell.value)) delete row.dirty[col.code];
              else row.dirty[col.code] = v;
              tr.classList.toggle('sda-panel-dirty', Object.keys(row.dirty).length > 0);
              refreshCounters();
            }));
          } else {
            td.textContent = ccDisplayValue(col.field, cell);
          }
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      scroll.appendChild(table);
      wrap.appendChild(scroll);

      const note = document.createElement('div');
      note.className = 'sda-panel-note';
      const notes = [
        `掃描範圍：一覽表目前的篩選條件，上限 ${limit} 筆${records.length >= limit ? '（已達上限，可能還有未列出的記錄）' : ''}。`,
        '「已停用」＝共通管理裡帳號 valid=false；「已刪除」＝共通管理已查不到這個帳號。',
      ];
      if (userApiError) notes.push(`⚠ ${userApiError}`);
      if (!canEditAny && CREATOR_CHECK.allowEdit) notes.push('※ 尚未在外掛設定把任何顯示欄位設為「可編輯」，因此本表為唯讀。');
      if (!CREATOR_CHECK.allowEdit && (CREATOR_CHECK.columns || []).some((col) => col && col.editable)) {
        notes.push('※ 外掛設定的「允許就地編輯」總開關未開啟，勾了「可改」的欄位不會生效，因此本表為唯讀。');
      }
      note.textContent = notes.join('\n');
      note.style.whiteSpace = 'pre-line';
      wrap.appendChild(note);

      const confirmBar = document.createElement('div');
      confirmBar.className = 'sda-panel-confirm';
      confirmBar.hidden = true;
      wrap.appendChild(confirmBar);

      const setMsg = (text, kind) => {
        msg.textContent = text || '';
        msg.className = `sda-panel-msg${kind ? ` sda-panel-msg-${kind}` : ''}`;
      };

      const applyFilter = () => {
        rows.forEach((r) => {
          const hide = onlyBad && r.status !== 'off' && r.status !== 'gone';
          r.tr.hidden = hide;
          if (hide && r.cb.checked) { r.cb.checked = false; }
        });
        filterBtn.textContent = onlyBad ? `顯示全部（目前只看異常 ${badCount} 筆）` : `只看異常（${badCount} 筆）`;
        refreshCounters();
      };
      filterBtn.addEventListener('click', () => { onlyBad = !onlyBad; applyFilter(); });

      allCb.addEventListener('change', () => {
        rows.forEach((r) => { if (!r.tr.hidden) r.cb.checked = allCb.checked; });
        refreshCounters();
      });

      let needsReload = false;

      saveBtn.addEventListener('click', async () => {
        const targets = rows.filter((r) => Object.keys(r.dirty).length > 0);
        if (!targets.length) return;
        saveBtn.disabled = true;
        delBtn.disabled = true;
        setMsg(`儲存中…（${targets.length} 筆）`);
        let done = 0;
        const failed = [];
        for (const part of chunk(targets, 100)) {
          const payload = part.map((r) => ({
            id: r.id,
            revision: r.revision,
            record: Object.entries(r.dirty).reduce((m, [code, value]) => {
              m[code] = { value };
              return m;
            }, {}),
          }));
          try {
            const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'PUT',
              { app: appId, records: payload });
            (resp.records || []).forEach((res, i) => {
              const r = part[i];
              if (!r) return;
              r.revision = res.revision;
              Object.entries(r.dirty).forEach(([code, value]) => {
                if (r.record[code]) r.record[code].value = value;
              });
              r.dirty = {};
              r.tr.classList.remove('sda-panel-dirty');
            });
            done += part.length;
          } catch (e) {
            failed.push(`記錄 ${part.map((r) => r.id).join(', ')}：${(e && e.message) || String(e)}`);
          }
        }
        needsReload = needsReload || done > 0;
        refreshCounters();
        if (failed.length) setMsg(`已儲存 ${done} 筆，失敗 ${failed.length} 批：${failed[0]}`, 'err');
        else setMsg(`✓ 已儲存 ${done} 筆。`, 'ok');
      });

      delBtn.addEventListener('click', () => {
        const selected = rows.filter((r) => r.cb.checked);
        if (!selected.length) return;
        const allowed = selected.filter((r) => r.deletable);
        const blocked = selected.filter((r) => !r.deletable);

        confirmBar.hidden = false;
        confirmBar.innerHTML = '';
        const text = document.createElement('span');
        text.textContent = allowed.length
          ? `確定刪除 ${allowed.length} 筆記錄？此動作無法復原。`
          + (blocked.length ? `（其中 ${blocked.length} 筆沒有刪除權限，會跳過）` : '')
          : `選取的 ${selected.length} 筆您都沒有刪除權限，無法刪除。`;
        confirmBar.appendChild(text);

        const cancel = mkBtn('取消', '');
        cancel.addEventListener('click', () => { confirmBar.hidden = true; });
        confirmBar.appendChild(cancel);

        if (!allowed.length) return;
        const yes = mkBtn(`確定刪除 ${allowed.length} 筆`, 'sda-panel-btn-danger');
        yes.addEventListener('click', async () => {
          yes.disabled = true;
          cancel.disabled = true;
          setMsg(`刪除中…（${allowed.length} 筆）`);
          let done = 0;
          const failed = [];
          for (const part of chunk(allowed, 100)) {
            try {
              await kintone.api(kintone.api.url('/k/v1/records.json', true), 'DELETE',
                { app: appId, ids: part.map((r) => r.id) });
              part.forEach((r) => {
                r.tr.parentNode && r.tr.parentNode.removeChild(r.tr);
                r.cb.checked = false;
                r.deleted = true;
              });
              done += part.length;
            } catch (e) {
              failed.push(`記錄 ${part.map((r) => r.id).join(', ')}：${(e && e.message) || String(e)}`);
            }
          }
          needsReload = needsReload || done > 0;
          confirmBar.hidden = true;
          refreshCounters();
          if (failed.length) setMsg(`已刪除 ${done} 筆，失敗 ${failed.length} 批：${failed[0]}`, 'err');
          else setMsg(`✓ 已刪除 ${done} 筆。`, 'ok');
        });
        confirmBar.appendChild(yes);
      });

      applyFilter();

      await dialog.showPanel({
        title: `${CREATOR_CHECK.buttonLabel}（${records.length} 筆）`,
        content: wrap,
        closeLabel: '關閉',
        style: DIALOG_STYLE,
      });

      if (needsReload) location.reload();
    } catch (e) {
      console.error('[sda][creatorCheck]', e);
      await window.SdaDialog.show({
        icon: 'error', title: '建立人狀態檢查失敗',
        text: friendlyError(e, '查詢時發生錯誤'), confirmLabel: '關閉', style: DIALOG_STYLE,
      });
    } finally {
      btn.disabled = false;
      setLabel(originalLabel);
    }
  };

  const ccCheckVisibility = async () => {
    const vis = CREATOR_CHECK.visibility;
    if (!vis || vis.mode !== 'restricted') return true;

    const users = vis.users || [];
    const orgs = vis.organizations || [];
    const groups = vis.groups || [];
    if (!users.length && !orgs.length && !groups.length) return false;

    let loginUser = null;
    try { loginUser = (typeof kintone !== 'undefined' && kintone.getLoginUser) ? kintone.getLoginUser() : null; }
    catch (e) { loginUser = null; }
    if (!loginUser || !loginUser.code) return true;

    if (users.includes(loginUser.code)) return true;
    if (!orgs.length && !groups.length) return false;
    if (!HAS_ADMIN_API) {
      console.warn('[sda][creatorCheck] 已設定部門／群組限制但未設定共通管理 API 權杖，無法驗證，按鈕不顯示');
      return false;
    }

    try {
      if (orgs.length) {
        const resp = await userApiGet('user/organizations.json', { code: loginUser.code });
        const myOrgs = (resp.organizationTitles || [])
          .map((t) => t.organization && t.organization.code)
          .filter(Boolean);
        if (myOrgs.some((c) => orgs.includes(c))) return true;
      }
      if (groups.length) {
        const resp = await userApiGet('user/groups.json', { code: loginUser.code });
        const myGroups = (resp.groups || []).map((g) => g.code).filter(Boolean);
        if (myGroups.some((c) => groups.includes(c))) return true;
      }
    } catch (e) {
      console.warn('[sda][creatorCheck] 可使用對象驗證失敗，按鈕不顯示', e);
      return false;
    }
    return false;
  };

  const CC_BTN_ID = 'sda-creator-check-btn';
  const mountCreatorCheckButton = async () => {
    if (!CREATOR_CHECK.enabled) return;
    if (document.getElementById(CC_BTN_ID)) return;
    let space = null;
    try {
      space = (APP_NS && APP_NS.getHeaderMenuSpaceElement && APP_NS.getHeaderMenuSpaceElement())
        || (MOBILE_NS && MOBILE_NS.getHeaderSpaceElement && MOBILE_NS.getHeaderSpaceElement());
    } catch (e) { space = null; }
    if (!space) return;
    if (!(await ccCheckVisibility())) return;
    if (document.getElementById(CC_BTN_ID)) return;

    const accent = (DIALOG_STYLE && DIALOG_STYLE.buttonColor) || '#7b68ee';
    const btn = document.createElement('button');
    btn.id = CC_BTN_ID;
    btn.type = 'button';
    Object.assign(btn.style, {
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '7px 16px', fontSize: '13px', fontWeight: '600', borderRadius: '6px',
      border: 'none', background: accent, color: '#fff',
      cursor: 'pointer', marginLeft: '8px', boxShadow: '0 1px 3px rgba(0,0,0,.25)',
    });
    const icon = document.createElement('span');
    icon.textContent = '🔍';
    icon.style.fontSize = '13px';
    const label = document.createElement('span');
    label.textContent = CREATOR_CHECK.buttonLabel || '建立人狀態檢查';
    btn.appendChild(icon);
    btn.appendChild(label);
    btn._sdaLabelEl = label;
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '.88'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
    btn.addEventListener('click', () => openCreatorCheckPanel(btn));
    space.appendChild(btn);
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

  kintone.events.on(E(['index.edit.show']),
    safeHandler(async (ev) => applyRules('index.edit.show', ev))
  );

  kintone.events.on(E(['index.edit.submit']),
    safeHandler(async (ev) => applyRules('index.edit.submit', ev))
  );

  kintone.events.on(E(['create.submit']), loggedApply('create.submit'));

  kintone.events.on(E(['edit.submit']), loggedApply('edit.submit'));

  kintone.events.on(E(['detail.process.proceed']), loggedApply('process.proceed'));

  kintone.events.on(E(['create.submit.success']), async (ev) => { await flushSubmitLog(ev); await runSuccessRules('create.submit.success', ev); return ev; });

  kintone.events.on(E(['edit.submit.success']), async (ev) => { await flushSubmitLog(ev); await runSuccessRules('edit.submit.success', ev); return ev; });

  kintone.events.on(E(['detail.show']),
    safeHandler(handleDetailShow)
  );

  kintone.events.on(E(['index.show']),
    safeHandler(async (ev) => { await mountCreatorCheckButton(); return ev; })
  );

})();
