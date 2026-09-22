(() => {
  'use strict';

  const UI_VERSION = '1.17.2';
  const PLUGIN_ID = kintone.$PLUGIN_ID;
  const APP_ID = kintone.app.getId();

  const raw = kintone.plugin.app.getConfig(PLUGIN_ID) || {};
  let state;
  try { state = JSON.parse(raw.data || '{}'); } catch (e) { state = {}; }
  if (!state.version) state.version = '1.0';
  if (!Array.isArray(state.rules)) state.rules = [];
  if (!Array.isArray(state.tokens)) state.tokens = [];
  if (state.selfAppToken === undefined) state.selfAppToken = '';
  if (state.logAppId === undefined) state.logAppId = '';
  if (state.logToken === undefined) state.logToken = '';
  if (state.adminApiToken === undefined) state.adminApiToken = '';

  const DEFAULT_CREATOR_CHECK_VISIBILITY = { mode: 'all', users: [], organizations: [], groups: [] };
  const DEFAULT_CREATOR_CHECK = {
    enabled: false,
    buttonLabel: '建立人狀態檢查',
    columns: [],
    allowEdit: true,
    allowDelete: false,
    maxRecords: 500,
    onlyInvalidDefault: false,
    visibility: DEFAULT_CREATOR_CHECK_VISIBILITY,
  };
  state.creatorCheck = Object.assign({}, DEFAULT_CREATOR_CHECK, state.creatorCheck || {});
  if (!Array.isArray(state.creatorCheck.columns)) state.creatorCheck.columns = [];
  state.creatorCheck.visibility = Object.assign({}, DEFAULT_CREATOR_CHECK_VISIBILITY, state.creatorCheck.visibility || {});
  ['users', 'organizations', 'groups'].forEach((k) => {
    if (!Array.isArray(state.creatorCheck.visibility[k])) state.creatorCheck.visibility[k] = [];
  });

  const DEFAULT_DIALOG_STYLE = (window.SdaDialog && window.SdaDialog.DEFAULT_STYLE) || {
    fontSize: 14, lineHeight: 1.9, titleSize: 20, radius: 12,
    overlay: 0.45, accent: '#f5a623', buttonColor: '#7b68ee', align: 'left', customCss: '',
  };
  state.dialogStyle = Object.assign({}, DEFAULT_DIALOG_STYLE, state.dialogStyle || {});

  const REST_PREFIX = kintone.api.url('/k/v1/record.json', true).replace(/record\.json.*$/, '');

  const TOKEN_MAP_URL = 'https://sda-plugin.invalid/token-map';

  const USER_API_PREFIX = `${location.origin}/v1/`;
  const USER_API_TEST_URL = `${location.origin}/v1/users.json?size=1`;

  const readSecuredTokenMap = () => {
    try {
      const cfg = kintone.plugin.app.getProxyConfig(TOKEN_MAP_URL, 'POST');
      if (cfg && cfg.data && cfg.data.map) return JSON.parse(cfg.data.map);
    } catch (e) {  }
    return null;
  };

  const _securedMap = readSecuredTokenMap();
  if (_securedMap) {
    if (typeof _securedMap.self === 'string') state.selfAppToken = _securedMap.self;
    if (typeof _securedMap.log === 'string') state.logToken = _securedMap.log;
    if (typeof _securedMap.adminApi === 'string') state.adminApiToken = _securedMap.adminApi;
    state.tokens.forEach((t) => {
      const v = _securedMap[String(t.appId)];
      if (typeof v === 'string') t.token = v;
    });
  }

  const chainProxy = (entries, done) => {
    const next = (i) => {
      if (i >= entries.length) return done();
      const [u, m, h, d] = entries[i];
      kintone.plugin.app.setProxyConfig(u, m, h, d, () => next(i + 1));
    };
    next(0);
  };

  const _fmtNow = (() => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  })();

  const TRIGGERS = [
    { v: 'create.show', l: '新增畫面載入時 (create.show)' },
    { v: 'edit.show',   l: '編輯畫面載入時 (edit.show)' },
    { v: 'index.edit.show', l: '一覽表內編輯列載入時 (index.edit.show)' },
    { v: 'create.submit', l: '新增儲存前 (create.submit)' },
    { v: 'edit.submit',   l: '編輯儲存前 (edit.submit)' },
    { v: 'index.edit.submit', l: '一覽表內編輯存檔前 (index.edit.submit)' },
    { v: 'create.submit.success', l: '新增存檔後 (create.submit.success)' },
    { v: 'edit.submit.success',   l: '編輯存檔後 (edit.submit.success)' },
    { v: 'process.proceed', l: '流程推進時 (process.proceed)' },
  ];

  const TRIGGER_GROUPS = {
    'process.proceed':    'proceed',
    'create.show':        'show',
    'edit.show':          'show',
    'index.edit.show':    'show',
    'create.submit':      'submit',
    'edit.submit':        'submit',
    'index.edit.submit':  'submit',
    'create.submit.success': 'submitSuccess',
    'edit.submit.success':   'submitSuccess',
  };

  const triggerListOf = (r) => String(r.trigger || '').split(',').map((s) => s.trim()).filter(Boolean);
  const isSubmitSuccessOnlyTrigger = (r) => {
    const list = triggerListOf(r);
    return list.length > 0 && list.every((v) => TRIGGER_GROUPS[v] === 'submitSuccess');
  };
  const ruleUsesCopyAttachment = (r) => {
    if (r.action === 'writeSelf') return r.valueSource === 'copyAttachment';
    if (r.action === 'writeOther') return (r.fieldMapping || []).some((m) => m && m.valueSource === 'copyAttachment');
    return false;
  };

  const VALUE_SOURCES = [
    { v: 'fixed',          l: '固定值' },
    { v: 'loginUser',      l: '登入者' },
    { v: 'today',   l: `今天日期（例：${_fmtNow.slice(0, 10)}）` },
    { v: 'nowTime', l: `現在時刻（例：${_fmtNow.slice(11, 16)}）` },
    { v: 'now',     l: `現在日期時間（例：${_fmtNow}）` },
    { v: 'recordNumber',   l: '記錄編號' },
    { v: 'recordId',       l: '記錄 $id' },
    { v: 'appId',          l: 'App ID' },
    { v: 'uuid',           l: 'UUID（隨機）' },
    { v: 'timestamp',      l: 'Unix 時間戳' },
    { v: 'fieldCopy',      l: '從本記錄欄位複製 [參數: 來源欄位代碼]' },
    { v: 'subtableLastRow', l: '子表某列欄位值（預設最後一列）[參數: JSON]' },
    { v: 'formula',        l: '簡易計算式 [參數: 例 {qty}*{price}+10]' },
    { v: 'lookup',         l: '跨 App 查詢 [參數: JSON]' },
    { v: 'dateShift',      l: '日期加減期間 [參數: JSON]' },
    { v: 'nextStatus',     l: '下一狀態 (process.proceed)' },
    { v: 'currentStatus',  l: '當前狀態' },
    { v: 'actionName',     l: '流程動作名稱' },
    { v: 'clear',          l: '清空' },
    { v: 'readonly',       l: '唯讀鎖定（限 *.show；index.edit.show 顯示但不可編輯，其餘 *.show 直接隱藏）' },
    { v: 'appendSubtable', l: 'Append 子表一筆 [參數: JSON]' },
    { v: 'appendText',     l: '文字串接追加（去重，可設分隔字元）[參數: JSON]' },
    { v: 'copyAttachment', l: '附件檔案複製（限存檔後 submit.success）[參數: JSON]' },
  ];

  const MAPPING_VALUE_SOURCES = [
    { v: 'fieldCopy',      l: '複製本記錄欄位' },
    { v: 'fixed',          l: '固定值' },
    { v: 'today',          l: '今天日期' },
    { v: 'nowTime',        l: '現在時刻' },
    { v: 'now',            l: '現在日期時間' },
    { v: 'loginUser',      l: '登入者' },
    { v: 'recordNumber',   l: '記錄編號' },
    { v: 'recordId',       l: '記錄 $id' },
    { v: 'nextStatus',     l: '下一狀態' },
    { v: 'currentStatus',  l: '當前狀態' },
    { v: 'actionName',     l: '流程動作名稱' },
    { v: 'formula',        l: '簡易計算式' },
    { v: 'dateShift',      l: '日期加減期間' },
    { v: 'lookup',         l: '跨 App 查詢' },
    { v: 'subtableLastRow', l: '子表某列欄位值' },
    { v: 'uuid',           l: 'UUID（隨機）' },
    { v: 'timestamp',      l: 'Unix 時間戳' },
    { v: 'clear',          l: '清空' },
    { v: 'appendText',     l: '文字串接追加（去重）' },
    { v: 'copyAttachment', l: '附件檔案複製（限存檔後 submit.success）' },
  ];

  const ACTIONS = [
    { v: 'writeSelf',  l: '寫入本記錄欄位' },
    { v: 'writeOther', l: '寫入其他 App 記錄' },
    { v: 'dialog',     l: '跳出提醒視窗（按確定後才繼續）' },
  ];

  const DIALOG_ICONS = [
    { v: 'warn',     l: '!  驚嘆號（提醒 / 警告）' },
    { v: 'info',     l: 'i  資訊' },
    { v: 'success',  l: '✓  完成' },
    { v: 'error',    l: '✕  錯誤 / 禁止' },
    { v: 'question', l: '?  詢問' },
    { v: 'none',     l: '（不顯示圖示）' },
  ];

  const DIALOG_ALIGNS = [
    { v: 'left',   l: '靠左（多行條列建議）' },
    { v: 'center', l: '置中（短句建議）' },
  ];

  const triggerCanBlock = (t) => t === 'process.proceed' || /\.submit$/.test(t);
  const ruleCanBlock = (r) => {
    const list = triggerListOf(r);
    return list.length > 0 && list.every(triggerCanBlock);
  };

  const WRITE_MODES = [
    { v: 'create', l: '新增' },
    { v: 'update', l: '更新（依 key 找）' },
    { v: 'upsert', l: 'Upsert（無則建、有則更新）' },
  ];

  const ON_ERROR = [
    { v: 'block',  l: '擋下提交（顯示錯誤）' },
    { v: 'log',    l: '寫 console，不擋' },
    { v: 'ignore', l: '完全忽略' },
  ];

  const COND_OPS = [
    { v: 'eq',         l: '等於 (=)' },
    { v: 'neq',        l: '不等於 (≠)' },
    { v: 'startsWith', l: '開頭為' },
    { v: 'contains',   l: '包含' },
    { v: 'inList',     l: '屬於清單（任一，逗號分隔）' },
  ];

  const el = (tag, props = {}, children = []) => {
    const e = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'style') Object.assign(e.style, v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    children.forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  };

  const select = (options, value, onChange, attrs = {}) => {
    const s = el('select', attrs);
    options.forEach((o) => {
      const opt = el('option', { value: o.v }, [o.l]);
      if (o.v === value) opt.selected = true;
      s.appendChild(opt);
    });
    s.addEventListener('change', (e) => onChange(e.target.value));
    return s;
  };

  const textInput = (value, onChange, placeholder = '', type = 'text') => {
    const i = el('input', { type, placeholder });
    i.value = value == null ? '' : value;
    i.addEventListener('input', (e) => onChange(e.target.value));
    return i;
  };

  const textarea = (value, onChange, placeholder = '') => {
    const t = el('textarea', { placeholder, rows: '3' });
    t.value = value == null ? '' : (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    t.addEventListener('input', (e) => onChange(e.target.value));
    return t;
  };

  const bigTextarea = (value, onChange, placeholder, rows) => {
    const t = el('textarea', { placeholder, rows: String(rows || 8) });
    t.value = value == null ? '' : String(value);
    t.addEventListener('input', (e) => onChange(e.target.value));
    return t;
  };

  const colorPicker = (current, fallback, onChange) => {
    const c = el('input', { type: 'color' });
    c.style.width = '46px';
    c.style.height = '30px';
    c.style.padding = '0';
    c.style.border = '1px solid #cbd2d9';
    c.style.borderRadius = '5px';
    c.style.cursor = 'pointer';
    c.value = /^#[0-9a-fA-F]{6}$/.test(String(current || '')) ? current : fallback;
    c.addEventListener('input', (e) => onChange(e.target.value));
    return c;
  };

  const checkbox = (value, onChange, label) => {
    const id = `cb-${Math.random().toString(36).slice(2, 8)}`;
    const cb = el('input', { type: 'checkbox', id });
    cb.checked = !!value;
    cb.addEventListener('change', (e) => onChange(e.target.checked));
    const wrap = el('label', { for: id, style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } });
    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(' ' + label));
    return wrap;
  };

  const triggerCheckboxGroup = (value, onChange) => {
    const wrap = el('div', { class: 'sda-trigger-group' });
    const selected = new Set(String(value || '').split(',').map((s) => s.trim()).filter(Boolean));

    TRIGGERS.forEach((t) => {
      const id = `trig-${Math.random().toString(36).slice(2, 8)}`;
      const cb = el('input', { type: 'checkbox', id });
      cb.checked = selected.has(t.v);
      cb.addEventListener('change', (e) => {
        if (e.target.checked) {
          const group = TRIGGER_GROUPS[t.v];
          const otherGroups = new Set([...selected].map((v) => TRIGGER_GROUPS[v]));
          if (otherGroups.size && !otherGroups.has(group)) selected.clear();
          selected.add(t.v);
        } else {
          selected.delete(t.v);
        }
        onChange([...selected].join(','));
      });
      const label = el('label', { for: id, style: { display: 'inline-flex', gap: '4px', alignItems: 'center', marginRight: '14px', fontWeight: 'normal' } });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + t.l));
      wrap.appendChild(label);
    });

    const hint = el('div', { style: { color: '#888', fontSize: '12px', marginTop: '4px' } },
      ['流程推進 (process.proceed) 只能單獨勾選；「顯示類」(*.show)、「儲存前」(*.submit)、「存檔後」(*.submit.success) 三類各自可複選，但不同類之間不能混選。存檔後 (success) 用於需要新記錄 $id 的回寫（例如把本筆單號回寫來源單）。']
    );
    wrap.appendChild(hint);
    return wrap;
  };

  const searchableSelect = (options, currentValue, onChange) => {
    const wrap = el('div', { class: 'sda-ss-wrap' });
    let _val = currentValue;
    let _shown = [];
    let _items = [];
    let _hi = -1;

    const findLabel = (v) => {
      const o = options.find((x) => x.v === v);
      return o ? o.l : (v || '');
    };

    const inp = el('input', { type: 'text', class: 'sda-ss-input', autocomplete: 'off', placeholder: '🔍 打字搜尋欄位（↑↓ 選、Enter 確認）…' });
    inp.value = findLabel(_val);

    const list = el('div', { class: 'sda-ss-list' });

    const commit = (o) => {
      _val = o.v;
      inp.value = o.l;
      list.style.display = 'none';
      onChange(o.v);
    };

    const refreshHi = () => {
      _items.forEach((it, i) => it.classList.toggle('sda-ss-hi', i === _hi));
      if (_items[_hi]) _items[_hi].scrollIntoView({ block: 'nearest' });
    };

    const buildList = (filter) => {
      list.innerHTML = '';
      _items = [];
      const lf = (filter || '').trim().toLowerCase();
      _shown = lf
        ? options.filter((o) => o.l.toLowerCase().includes(lf) || o.v.toLowerCase().includes(lf))
        : options;
      if (!_shown.length) {
        list.appendChild(el('div', { class: 'sda-ss-empty' }, ['無符合選項']));
        _hi = -1;
      } else {
        _shown.forEach((o, i) => {
          const item = el('div', { class: 'sda-ss-item' + (o.v === _val ? ' sda-ss-active' : '') }, [o.l]);
          item.title = o.l;
          item.addEventListener('mousedown', (e) => { e.preventDefault(); commit(o); });
          item.addEventListener('mousemove', () => { if (_hi !== i) { _hi = i; refreshHi(); } });
          list.appendChild(item);
          _items.push(item);
        });
        const activeIdx = _shown.findIndex((o) => o.v === _val);
        _hi = lf ? 0 : (activeIdx >= 0 ? activeIdx : 0);
        refreshHi();
      }
      list.style.display = 'block';
    };

    inp.addEventListener('focus', () => { inp.value = ''; buildList(''); });
    inp.addEventListener('input', (e) => buildList(e.target.value));
    inp.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (list.style.display === 'none' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        buildList('');
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (_shown.length) { _hi = Math.min(_hi + 1, _shown.length - 1); refreshHi(); }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (_shown.length) { _hi = Math.max(_hi - 1, 0); refreshHi(); }
          break;
        case 'Enter':
          if (_shown[_hi]) { e.preventDefault(); commit(_shown[_hi]); inp.blur(); }
          break;
        case 'Escape':
          list.style.display = 'none';
          inp.value = findLabel(_val);
          inp.blur();
          break;
      }
    });
    inp.addEventListener('blur', () => {
      setTimeout(() => {
        list.style.display = 'none';
        inp.value = findLabel(_val);
      }, 200);
    });

    wrap.appendChild(inp);
    wrap.appendChild(list);
    return wrap;
  };

  let _dlSeq = 0;
  const fieldCombo = (options, currentValue, onChange) => {
    const wrap = el('div', { class: 'sda-ss-wrap' });
    const listId = 'sda-dl-' + (++_dlSeq);
    const dl = el('datalist', { id: listId });
    options.forEach((o) => {
      if (!o.v) return;
      dl.appendChild(el('option', { value: o.v }, [o.l]));
    });
    const inp = el('input', {
      type: 'text', class: 'sda-ss-input', list: listId, autocomplete: 'off',
      placeholder: '🔍 打字搜尋欄位名稱／代碼…',
    });
    inp.value = currentValue || '';
    inp.addEventListener('change', () => onChange(inp.value.trim()));
    wrap.appendChild(inp);
    wrap.appendChild(dl);
    return wrap;
  };

  let FIELD_OPTIONS = [{ v: '', l: '— 載入中 —' }];
  const FIELD_TYPES = {};
  const loadFields = () => {
    if (!window.KintoneConfigHelper) return Promise.resolve([]);

    return KintoneConfigHelper.getFields()
      .then((fields) => {
        const opts = [{ v: '', l: '— 請選擇 —' }];
        (fields || []).forEach((f) => {
          opts.push({ v: f.code, l: `${f.label} (${f.code}) [${f.type}]` });
          FIELD_TYPES[f.code] = f.type;
        });
        FIELD_OPTIONS = opts;
        return opts;
      })
      .catch(() => []);
  };

  const CREATOR_CHECK_EDITABLE_TYPES = new Set([
    'SINGLE_LINE_TEXT', 'MULTI_LINE_TEXT', 'RICH_TEXT', 'NUMBER', 'LINK',
    'DROP_DOWN', 'RADIO_BUTTON', 'CHECK_BOX', 'MULTI_SELECT',
    'DATE', 'TIME', 'DATETIME',
    'USER_SELECT', 'ORGANIZATION_SELECT', 'GROUP_SELECT',
  ]);

  const TARGET_FIELDS = {};
  const ensureTargetFields = (appId) => {
    const id = String(appId || '').trim();
    if (!id || TARGET_FIELDS[id]) return;
    TARGET_FIELDS[id] = { status: 'loading', opts: [] };
    kintone.api(kintone.api.url('/k/v1/app/form/fields.json', true), 'GET', { app: id })
      .then((resp) => {
        const opts = [{ v: '', l: '— 請選擇目標欄位 —' }];
        const props = (resp && resp.properties) || {};
        Object.keys(props).forEach((code) => {
          const f = props[code];
          opts.push({ v: code, l: `${f.label} (${code}) [${f.type}]` });
        });
        TARGET_FIELDS[id] = { status: 'done', opts };
        render();
      })
      .catch((e) => {
        TARGET_FIELDS[id] = { status: 'error', opts: [], error: (e && e.message) || String(e) };
        render();
      });
  };
  const targetFieldOptions = (appId) => {
    const id = String(appId || '').trim();
    const tf = TARGET_FIELDS[id];
    if (tf && tf.status === 'done') return tf.opts;
    if (tf && tf.status === 'loading') return [{ v: '', l: '— 載入目標欄位中… —' }];
    return [{ v: '', l: '— 填入目標 App ID 後可選 —' }];
  };

  const root = document.getElementById('ui-section');

  const render = () => {
    root.innerHTML = '';
    root.appendChild(renderToolbar());
    root.appendChild(renderTokensSection());
    root.appendChild(renderRulesSection());
    root.appendChild(renderLogSection());
    root.appendChild(renderDialogStyleSection());
    root.appendChild(renderCreatorCheckSection());
  };

  const notify = (opts) => {
    if (!window.SdaDialog) { alert(opts.text); return Promise.resolve(true); }
    return window.SdaDialog.show(Object.assign(
      { icon: 'info', confirmLabel: '確定', style: state.dialogStyle }, opts));
  };

  const askConfirm = (opts) => {
    if (!window.SdaDialog) return Promise.resolve(confirm(opts.text));
    return window.SdaDialog.show(Object.assign(
      { icon: 'question', confirmLabel: '確定', cancelLabel: '取消', style: state.dialogStyle }, opts));
  };

  const previewDialogRule = (r) => {
    if (!window.SdaDialog) { notify({ icon: 'error', title: '無法預覽', text: '提醒視窗元件未載入，請重新整理設定畫面。' }); return; }
    const d = r.dialog || {};
    const demo = (s) => String(s == null ? '' : s).replace(/\{([^}]+)\}/g, (_, c) => `〔${c.trim()}〕`);
    window.SdaDialog.show({
      icon: d.icon || 'warn',
      title: demo(d.title),
      text: demo(d.text) || '（尚未輸入內文）',
      confirmLabel: d.confirmLabel || 'OK',
      cancelLabel: ruleCanBlock(r) ? (d.cancelLabel || '') : '',
      accent: d.accent,
      style: state.dialogStyle,
    });
  };

  const SAMPLE_DIALOG_TEXT =
    '※　請將同一筆請款單之傳統紙本發票及收據正本\n' +
    '　　① 釘起(或夾成)一份\n' +
    '　　② 首張憑證寫上請款單編號〔請款單編號〕\n' +
    '　　③ 盡速寄交會計課承辦\n\n' +
    '※　有收據及傳統紙本發票的請款單，\n' +
    '　　會計課於收到正本後方能執行請款作業';

  const renderDialogStyleSection = () => {
    const sec = el('section', { class: 'sda-section' });
    sec.appendChild(el('h3', { class: 'sda-section-title' }, ['4. 提醒視窗外觀（全域）']));
    sec.appendChild(el('p', { class: 'sda-section-help' }, [
      '所有「跳出提醒視窗」規則共用這一組外觀；個別規則可另外覆寫圖示與強調色。' +
      '這組設定會隨「匯出／匯入設定」一起帶到其他 App。'
    ]));

    const swalHere = !!(window.SdaDialog && window.SdaDialog.hasSwal && window.SdaDialog.hasSwal());
    sec.appendChild(el('p', {
      class: 'sda-section-help',
      style: { color: swalHere ? '#1e7d4f' : '#b9770e' },
    }, [swalHere
      ? '✓ 本頁偵測到 SweetAlert2，提醒視窗與下方預覽都會用它渲染。'
      : '⚠ 本頁偵測不到 SweetAlert2，預覽會改用外掛內建的視窗元件。若記錄頁本身有載入 SweetAlert2，'
        + '使用者實際看到的會是 SweetAlert2 的樣式，與此處預覽略有出入（尺寸、顏色、對齊等設定兩者皆適用，'
        + '差別主要在圖示畫法與動畫）。'
    ]));

    const grid = el('div', { class: 'sda-rule-grid' });
    const addRow = (label, control) => {
      grid.appendChild(el('div', { class: 'sda-row-label' }, [label]));
      grid.appendChild(control);
    };
    const s = state.dialogStyle;

    const numRow = (label, key, step, hint) => {
      const i = el('input', { type: 'number' });
      if (step) i.setAttribute('step', step);
      i.value = s[key];
      i.addEventListener('input', (e) => { s[key] = e.target.value === '' ? '' : Number(e.target.value); });
      if (!hint) { addRow(label, i); return; }
      const wrap = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } });
      i.style.width = '120px';
      wrap.appendChild(i);
      wrap.appendChild(el('span', { style: { fontSize: '12px', color: '#6b7480' } }, [hint]));
      addRow(label, wrap);
    };

    const colorRow = (label, key, hint) => {
      const wrap = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } });
      const txt = textInput(s[key], (v) => { s[key] = v.trim(); }, '#f5a623');
      txt.style.width = '120px';
      wrap.appendChild(colorPicker(s[key], DEFAULT_DIALOG_STYLE[key], (v) => { s[key] = v; txt.value = v; }));
      wrap.appendChild(txt);
      if (hint) wrap.appendChild(el('span', { style: { fontSize: '12px', color: '#6b7480' } }, [hint]));
      addRow(label, wrap);
    };

    addRow('視窗寬度', el('div', { style: { color: '#6b7480', fontSize: '13px' } }, [
      '自動：內文不會自動換行，只在你打的換行字元處斷行，視窗寬度長到最長那一行為止。'
      + '（螢幕寬度小於 600px 的手機會自動恢復換行，避免要左右滑才讀得完。）'
    ]));
    numRow('內文字級 (px)', 'fontSize', '1');
    numRow('內文行高', 'lineHeight', '0.1', '1.9 ≈ 條列式提醒的舒適行距');
    numRow('標題字級 (px)', 'titleSize', '1');
    numRow('圓角 (px)', 'radius', '1');
    numRow('背景遮罩深淺', 'overlay', '0.05', '0＝完全透明，1＝全黑');
    addRow('內文對齊', select(DIALOG_ALIGNS, s.align, (v) => { s.align = v; }));
    colorRow('預設強調色', 'accent', '圖示的圈線與符號顏色');
    colorRow('確定鍵顏色', 'buttonColor');

    addRow('進階：自訂 CSS', bigTextarea(s.customCss, (v) => { s.customCss = v; },
      '選填。會接在外掛產生的樣式後面，可覆寫任何細節。\n' +
      '選擇器依渲染器而異，建議兩套都寫，沒命中的那套不會有作用：\n\n' +
      '【有 SweetAlert2 時】.swal2-popup.sda-swal（視窗本體）\n' +
      '　.sda-swal .swal2-title／.swal2-html-container／.swal2-icon／.swal2-confirm\n\n' +
      '【內建元件時】.sda-dlg（視窗本體）\n' +
      '　.sda-dlg-overlay／.sda-dlg-icon／.sda-dlg-title／.sda-dlg-text／.sda-dlg-ok／.sda-dlg-cancel\n\n' +
      '例：.sda-swal .swal2-title, .sda-dlg-title { letter-spacing: .1em; }', 9));
    sec.appendChild(grid);

    const btnRow = el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } });
    btnRow.appendChild(el('button', {
      class: 'sda-btn sda-btn-copy',
      onclick: () => {
        if (!window.SdaDialog) { notify({ icon: 'error', title: '無法預覽', text: '提醒視窗元件未載入，請重新整理設定畫面。' }); return; }
        window.SdaDialog.show({
          icon: 'warn', title: '提醒', text: SAMPLE_DIALOG_TEXT,
          confirmLabel: 'OK', cancelLabel: '', style: s,
        });
      },
    }, ['👁 用範例文字預覽']));
    btnRow.appendChild(el('button', {
      class: 'sda-btn',
      onclick: async () => {
        const agreed = await askConfirm({
          icon: 'warn', title: '還原預設外觀',
          text: '寬度、字級、顏色等全部回到預設值，「進階：自訂 CSS」的內容也會被清空。\n確定要還原嗎？',
          confirmLabel: '確定還原', cancelLabel: '取消',
        });
        if (!agreed) return;
        state.dialogStyle = Object.assign({}, DEFAULT_DIALOG_STYLE);
        render();
      },
    }, ['還原預設外觀']));
    sec.appendChild(btnRow);

    return sec;
  };

  const renderLogSection = () => {
    const sec = el('section', { class: 'sda-section' });
    sec.appendChild(el('h3', { class: 'sda-section-title' }, ['3. 執行 Log（選填）']));
    sec.appendChild(el('p', { class: 'sda-section-help' }, [
      '填入「Log App ID」後，每次「儲存 / 流程推進」且命中規則時，' +
      '外掛會往該 App 新增一筆執行記錄（成功或失敗）。留空＝不啟用、零額外負擔。'
    ]));
    sec.appendChild(el('p', { class: 'sda-section-help', style: { color: '#b9770e' } }, [
      '⚠ Log App 需先建立以下「欄位代碼 (Field Code)」：' +
      'LOG_EVENT、LOG_RESULT、LOG_CATEGORY（單行文字）、' +
      'LOG_APP、LOG_RECORD（數值）、' +
      'LOG_USER（使用者選擇 USER_SELECT）、LOG_MESSAGE（多行文字）。'
    ]));

    const mkRow = (label, input) => {
      const row = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' } });
      row.appendChild(el('span', { style: { whiteSpace: 'nowrap', fontSize: '13px', width: '110px' } }, [label]));
      input.style.flex = '1';
      row.appendChild(input);
      return row;
    };

    sec.appendChild(mkRow('Log App ID：',
      textInput(state.logAppId, (v) => { state.logAppId = v.trim(); }, '例：123（留空＝不啟用 Log）')));
    sec.appendChild(mkRow('Log API Token：',
      textInput(state.logToken, (v) => { state.logToken = v.trim(); }, '選填。Log App 的 Token（具「新增記錄」權限）。留空＝用操作者身分寫', 'password')));

    return sec;
  };

  const testAdminApi = async (btn, out) => {
    const token = String(state.adminApiToken || '').trim();
    out.className = '';
    if (!token) {
      out.className = 'sda-error';
      out.textContent = '請先填入共通管理 API 權杖。';
      return;
    }

    btn.disabled = true;
    out.textContent = '測試中…';
    try {
      const resp = await fetch(USER_API_TEST_URL, { headers: { Authorization: `Bearer ${token}` } });
      const body = await resp.text();
      if (resp.status === 200) {
        let count = '?';
        try { count = (JSON.parse(body).users || []).length; } catch (e) {  }
        out.className = 'sda-success';
        out.textContent = `✓ 連線成功（取得 ${count} 筆使用者樣本），權杖可用。`;
      } else if (resp.status === 401 || resp.status === 403) {
        out.className = 'sda-error';
        out.textContent = `✕ ${resp.status}：權杖無效、已失效或 Scope 不足（至少需要 Read）。`;
      } else {
        out.className = 'sda-error';
        out.textContent = `✕ HTTP ${resp.status}：${String(body).slice(0, 160)}`;
      }
    } catch (e) {
      out.className = 'sda-error';
      out.textContent = `✕ 呼叫失敗：${(e && e.message) || String(e)}`;
    } finally {
      btn.disabled = false;
    }
  };

  const CC_DIR_PATH = { users: 'users.json', organizations: 'organizations.json', groups: 'groups.json' };
  const CC_DIR_KEY = { users: 'users', organizations: 'organizations', groups: 'groups' };
  const CC_KIND_LABEL = { users: '使用者', organizations: '部門', groups: '群組' };
  const CC_DIRECTORY = {
    users: { status: 'idle', opts: [], error: '' },
    organizations: { status: 'idle', opts: [], error: '' },
    groups: { status: 'idle', opts: [], error: '' },
  };

  const ccFetchAllPages = async (kind) => {
    const token = String(state.adminApiToken || '').trim();
    const all = [];
    let offset = 0;
    for (let page = 0; page < 50; page++) {
      const qs = new URLSearchParams({ size: '100', offset: String(offset) });
      const resp = await fetch(`${USER_API_PREFIX}${CC_DIR_PATH[kind]}?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const items = data[CC_DIR_KEY[kind]] || [];
      all.push(...items);
      if (items.length < 100) break;
      offset += items.length;
    }
    return all;
  };

  const ensureCcDirectory = (kind) => {
    const entry = CC_DIRECTORY[kind];
    if (entry.status === 'done' || entry.status === 'loading') return;
    if (!String(state.adminApiToken || '').trim()) {
      entry.status = 'error';
      entry.error = '尚未填入共通管理 API 權杖';
      return;
    }
    entry.status = 'loading';
    ccFetchAllPages(kind)
      .then((items) => {
        entry.status = 'done';
        entry.opts = items.map((it) => ({ v: it.code, l: `${it.name || it.code} (${it.code})` }));
        render();
      })
      .catch((e) => {
        entry.status = 'error';
        entry.error = (e && e.message) || String(e);
        render();
      });
  };

  const searchAddInput = (options, onPick, placeholder) => {
    const wrap = el('div', { class: 'sda-ss-wrap' });
    let _shown = [];
    let _items = [];
    let _hi = -1;

    const inp = el('input', { type: 'text', class: 'sda-ss-input', autocomplete: 'off', placeholder: placeholder || '🔍 打字搜尋…' });
    const list = el('div', { class: 'sda-ss-list' });

    const refreshHi = () => {
      _items.forEach((it, i) => it.classList.toggle('sda-ss-hi', i === _hi));
      if (_items[_hi]) _items[_hi].scrollIntoView({ block: 'nearest' });
    };

    const pick = (o) => {
      inp.value = '';
      list.style.display = 'none';
      onPick(o.v);
    };

    const buildList = (filter) => {
      list.innerHTML = '';
      _items = [];
      const lf = (filter || '').trim().toLowerCase();
      _shown = lf
        ? options.filter((o) => o.l.toLowerCase().includes(lf) || o.v.toLowerCase().includes(lf)).slice(0, 50)
        : options.slice(0, 50);
      if (!_shown.length) {
        const empty = lf ? '無符合選項' : (options.length ? `輸入以搜尋（共 ${options.length} 筆）` : '無可選項目');
        list.appendChild(el('div', { class: 'sda-ss-empty' }, [empty]));
        _hi = -1;
      } else {
        _shown.forEach((o, i) => {
          const item = el('div', { class: 'sda-ss-item' }, [o.l]);
          item.title = o.l;
          item.addEventListener('mousedown', (e) => { e.preventDefault(); pick(o); });
          item.addEventListener('mousemove', () => { if (_hi !== i) { _hi = i; refreshHi(); } });
          list.appendChild(item);
          _items.push(item);
        });
        _hi = 0;
        refreshHi();
      }
      list.style.display = 'block';
    };

    inp.addEventListener('focus', () => buildList(inp.value));
    inp.addEventListener('input', (e) => buildList(e.target.value));
    inp.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (_shown.length) { _hi = Math.min(_hi + 1, _shown.length - 1); refreshHi(); }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (_shown.length) { _hi = Math.max(_hi - 1, 0); refreshHi(); }
          break;
        case 'Enter':
          if (_shown[_hi]) { e.preventDefault(); pick(_shown[_hi]); }
          break;
        case 'Escape':
          list.style.display = 'none';
          inp.blur();
          break;
      }
    });
    inp.addEventListener('blur', () => { setTimeout(() => { list.style.display = 'none'; }, 200); });

    wrap.appendChild(inp);
    wrap.appendChild(list);
    return wrap;
  };

  const renderCodePicker = (kind, arr) => {
    const wrap = el('div');
    const dirEntry = CC_DIRECTORY[kind];

    if (arr.length) {
      const chips = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' } });
      arr.forEach((code, i) => {
        const opt = (dirEntry.opts || []).find((o) => o.v === code);
        const chip = el('span', {
          style: {
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: '#eef1f6', border: '1px solid #d4d9e0', borderRadius: '999px',
            padding: '3px 6px 3px 10px', fontSize: '12.5px', color: '#333',
          },
        }, [opt ? opt.l : `${code}（尚未載入名稱）`]);
        const rm = el('button', { class: 'sda-btn-row', style: { borderRadius: '999px' } }, ['✕']);
        rm.addEventListener('click', () => { arr.splice(i, 1); render(); });
        chip.appendChild(rm);
        chips.appendChild(chip);
      });
      wrap.appendChild(chips);
    }

    const token = String(state.adminApiToken || '').trim();
    if (!token) {
      wrap.appendChild(el('div', { style: { fontSize: '12px', color: '#b9770e', marginBottom: '4px' } }, [
        '尚未填入第 1 區的共通管理 API 權杖，無法搜尋名單。可先在下面直接輸入完整代碼新增。'
      ]));
      const manualInp = el('input', { type: 'text', placeholder: `直接輸入完整${CC_KIND_LABEL[kind]}代碼，按 Enter 新增` });
      manualInp.style.width = '100%';
      manualInp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const v = manualInp.value.trim();
        if (v && !arr.includes(v)) { arr.push(v); manualInp.value = ''; render(); }
      });
      wrap.appendChild(manualInp);
      return wrap;
    }

    if (dirEntry.status === 'idle') ensureCcDirectory(kind);
    if (dirEntry.status === 'loading') {
      wrap.appendChild(el('div', { style: { fontSize: '12px', color: '#6b7480' } }, [`${CC_KIND_LABEL[kind]}名單載入中…`]));
      return wrap;
    }
    if (dirEntry.status === 'error') {
      wrap.appendChild(el('div', { class: 'sda-error' }, [`${CC_KIND_LABEL[kind]}名單載入失敗：${dirEntry.error}`]));
      return wrap;
    }

    const available = dirEntry.opts.filter((o) => !arr.includes(o.v));
    wrap.appendChild(searchAddInput(available, (code) => { arr.push(code); render(); },
      `🔍 打一兩個字搜尋${CC_KIND_LABEL[kind]}姓名／代碼…（共 ${dirEntry.opts.length} 筆）`));
    return wrap;
  };

  const renderCreatorCheckSection = () => {
    const c = state.creatorCheck;
    const sec = el('section', { class: 'sda-section' });
    sec.appendChild(el('h3', { class: 'sda-section-title' }, ['5. 建立人狀態檢查（一覽表按鈕）']));
    sec.appendChild(el('p', { class: 'sda-section-help' }, [
      '在本 App 的一覽表加一顆按鈕。按下後會掃描「目前篩選條件下」的記錄，'
      + '用第 1 區的共通管理 API 權杖查每筆記錄「建立人」的帳號狀態，'
      + '把停用（valid=false）／已刪除的帳號標記出來，並可就地修改或刪除這些記錄。'
    ]));
    if (!String(state.adminApiToken || '').trim()) {
      sec.appendChild(el('p', { class: 'sda-error' }, [
        '⚠ 尚未填入第 1 區的「共通管理 API 權杖」，啟用後按鈕會出現但查不到帳號狀態。'
      ]));
    }

    const grid = el('div', { class: 'sda-rule-grid' });
    const addRow = (label, control) => {
      grid.appendChild(el('div', { class: 'sda-row-label' }, [label]));
      grid.appendChild(control);
    };

    addRow('啟用', checkbox(c.enabled, (v) => { c.enabled = v; render(); }, '在一覽表顯示按鈕'));
    addRow('按鈕文字', textInput(c.buttonLabel, (v) => { c.buttonLabel = v; }, '建立人狀態檢查'));

    const maxInput = el('input', { type: 'number', step: '50', min: '1', max: '5000', style: { width: '120px' } });
    maxInput.value = c.maxRecords;
    maxInput.addEventListener('input', (e) => { c.maxRecords = e.target.value === '' ? '' : Number(e.target.value); });
    const maxWrap = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
      maxInput,
      el('span', { style: { fontSize: '12px', color: '#6b7480' } }, ['最多掃描幾筆（超過的不列入，避免一覽表篩選太寬時卡住）']),
    ]);
    addRow('掃描上限', maxWrap);

    addRow('預設檢視', checkbox(c.onlyInvalidDefault, (v) => { c.onlyInvalidDefault = v; },
      '打開時就先只顯示「帳號異常」的記錄（視窗內仍可切換為全部）'));
    addRow('允許就地編輯', checkbox(c.allowEdit, (v) => { c.allowEdit = v; render(); },
      '顯示欄位中勾了「可編輯」的才會變成輸入框'));
    addRow('允許刪除記錄', checkbox(c.allowDelete, (v) => { c.allowDelete = v; render(); },
      '顯示「刪除選取」鍵'));
    if (c.allowDelete) {
      addRow('', el('div', { class: 'sda-error' }, [
        '⚠ 刪除是不可復原的。實際能不能刪仍由 kintone 權限決定：'
        + '外掛會先問 kintone「操作者對這些記錄有沒有刪除權」，沒有權限的列會被跳過並列出來。'
      ]));
    }

    const vis = c.visibility;
    addRow('限制可使用對象', checkbox(vis.mode === 'restricted', (v) => { vis.mode = v ? 'restricted' : 'all'; render(); },
      '只有符合下列名單的人才會看到按鈕（不勾＝所有能看到一覽表的人都能看到按鈕，與現行行為相同）'));

    if (vis.mode === 'restricted') {
      addRow('　使用者', renderCodePicker('users', vis.users));
      addRow('　部門', renderCodePicker('organizations', vis.organizations));
      addRow('　群組', renderCodePicker('groups', vis.groups));
      addRow('', el('div', { style: { fontSize: '12px', color: '#6b7480' } }, [
        '符合使用者／部門／群組任一項就能看到按鈕。三者都留空＝沒有人符合，按鈕不會顯示給任何人。'
      ]));
    }

    sec.appendChild(grid);

    sec.appendChild(el('p', { class: 'sda-section-help', style: { marginTop: '14px' } }, [
      '【顯示欄位】決定視窗表格要顯示哪些欄位（由上而下＝由左而右）。'
      + '「建立人」與「帳號狀態」是固定欄，不需要在這裡加。'
      + `可就地編輯的型別：${[...CREATOR_CHECK_EDITABLE_TYPES].join('、')}（Lookup 欄位會改成搜尋關聯 App 的記錄）；`
      + '系統欄位（記錄編號、建立人、更新時間、狀態…）與計算欄位無法寫入，附件、子表格不支援單列編輯，一律唯讀顯示。'
    ]));

    if (!c.allowEdit && c.columns.some((col) => col.editable)) {
      sec.appendChild(el('p', { class: 'sda-section-help', style: { color: '#c0392b', fontWeight: '600' } }, [
        '⚠ 上方「允許就地編輯」目前關閉，下列勾了「可改」的欄位不會生效，視窗會整張唯讀。要編輯請先打開該開關。'
      ]));
    }

    const table = el('table', { class: 'sda-table' });
    table.appendChild(el('thead', {}, [
      el('tr', {}, [
        el('th', {}, ['欄位']),
        el('th', { style: { width: '110px' } }, ['可編輯']),
        el('th', { style: { width: '110px' } }, ['排序']),
        el('th', { style: { width: '60px' } }, ['']),
      ])
    ]));
    const tbody = el('tbody');
    c.columns.forEach((col, i) => {
      const type = FIELD_TYPES[col.field];
      const canEdit = !type || CREATOR_CHECK_EDITABLE_TYPES.has(type);
      const editCell = canEdit
        ? checkbox(col.editable, (v) => { c.columns[i].editable = v; render(); }, '可改')
        : el('span', { style: { fontSize: '12px', color: '#9aa3ad' } }, [`唯讀（${type}）`]);

      const orderCell = el('div', { style: { display: 'flex', gap: '4px' } }, [
        el('button', {
          class: 'sda-btn-row',
          onclick: () => {
            if (i === 0) return;
            [c.columns[i - 1], c.columns[i]] = [c.columns[i], c.columns[i - 1]];
            render();
          },
        }, ['↑']),
        el('button', {
          class: 'sda-btn-row',
          onclick: () => {
            if (i >= c.columns.length - 1) return;
            [c.columns[i + 1], c.columns[i]] = [c.columns[i], c.columns[i + 1]];
            render();
          },
        }, ['↓']),
      ]);

      tbody.appendChild(el('tr', {}, [
        el('td', {}, [fieldCombo(FIELD_OPTIONS, col.field, (v) => { c.columns[i].field = v; render(); })]),
        el('td', {}, [editCell]),
        el('td', {}, [orderCell]),
        el('td', {}, [el('button', {
          class: 'sda-btn-row',
          onclick: () => { c.columns.splice(i, 1); render(); },
        }, ['✕'])]),
      ]));
    });
    table.appendChild(tbody);
    sec.appendChild(table);
    sec.appendChild(el('button', {
      class: 'sda-btn sda-btn-add',
      onclick: () => { c.columns.push({ field: '', editable: false }); render(); },
    }, ['+ 新增顯示欄位']));

    return sec;
  };

  const renderTokensSection = () => {
    const sec = el('section', { class: 'sda-section' });
    sec.appendChild(el('h3', { class: 'sda-section-title' }, ['1. API Token 設定']));

    sec.appendChild(el('p', { class: 'sda-section-help', style: { color: '#2471a3' } }, [
      '🔒 這裡輸入的 Token 會加密儲存在 kintone 伺服器（外掛代理設定），一般使用者無法讀取；' +
      '執行期由伺服器端注入，不會出現在瀏覽器或網路請求中。' +
      '從舊版更新後，請在此頁按一次「儲存」，即可把既有 Token 搬入加密儲存。'
    ]));

    sec.appendChild(el('p', { class: 'sda-section-help' }, [
      '【本 App API Token】流程推進後若使用者在新狀態沒有編輯權限，' +
      '外掛會用此 Token 補償寫入子表履歷。未填時若有欄位權限限制可能導致履歷漏記。'
    ]));
    const selfRow = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' } });
    selfRow.appendChild(el('span', { style: { whiteSpace: 'nowrap', fontSize: '13px' } }, ['本 App Token：']));
    const selfInput = textInput(state.selfAppToken, (v) => { state.selfAppToken = v; }, '本 App 的 API Token（管理員建立，具記錄編輯權限）', 'password');
    selfInput.style.flex = '1';
    selfRow.appendChild(selfInput);
    sec.appendChild(selfRow);

    sec.appendChild(el('p', { class: 'sda-section-help' }, [
      '【cybozu.com 共通管理 API 權杖】給「建立人狀態檢查」（第 5 區）查帳號是否已停用／已刪除用。'
      + '在 cybozu.com 共通管理 →「外部服務連携」→「API 權杖」發行，字串長得像 cy.s.api1.xxxxx。'
      + '權限（Scope）只需要「Read」；認證方式與 App 的 API Token 不同（走 Authorization: Bearer），'
      + '因此要填在這一欄，不要填到上面或下面的表格。'
    ]));
    const adminRow = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' } });
    adminRow.appendChild(el('span', { style: { whiteSpace: 'nowrap', fontSize: '13px' } }, ['共通管理 API 權杖：']));
    const adminInput = textInput(state.adminApiToken, (v) => { state.adminApiToken = v; }, 'cy.s.api1.…（留空＝不啟用建立人狀態檢查）', 'password');
    adminInput.style.flex = '1';
    adminRow.appendChild(adminInput);
    const testOut = el('span', { style: { fontSize: '12px', whiteSpace: 'nowrap' } });
    const testBtn = el('button', { class: 'sda-btn' }, ['測試連線']);
    testBtn.addEventListener('click', () => testAdminApi(testBtn, testOut));
    adminRow.appendChild(testBtn);
    sec.appendChild(adminRow);
    sec.appendChild(el('p', { class: 'sda-section-help', style: { marginBottom: '16px' } }, [testOut]));

    sec.appendChild(el('p', { class: 'sda-section-help' }, [
      '【跨 App Token 對應表】在「寫入其他 App」時使用。若目標 App 使用者本人有寫入權限可不填。'
    ]));

    const table = el('table', { class: 'sda-table' });
    table.appendChild(el('thead', {}, [
      el('tr', {}, [
        el('th', { style: { width: '120px' } }, ['App ID']),
        el('th', { style: { width: '180px' } }, ['顯示名稱']),
        el('th', {}, ['API Token']),
        el('th', { style: { width: '60px' } }, ['']),
      ])
    ]));
    const tbody = el('tbody');
    state.tokens.forEach((t, i) => {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, [textInput(t.appId, (v) => { state.tokens[i].appId = v; })]),
        el('td', {}, [textInput(t.appLabel, (v) => { state.tokens[i].appLabel = v; }, '客戶主檔')]),
        el('td', {}, [textInput(t.token, (v) => { state.tokens[i].token = v; }, 'API Token', 'password')]),
        el('td', {}, [el('button', {
          class: 'sda-btn-row',
          onclick: () => { state.tokens.splice(i, 1); render(); },
        }, ['✕'])]),
      ]));
    });
    table.appendChild(tbody);
    sec.appendChild(table);
    sec.appendChild(el('button', {
      class: 'sda-btn sda-btn-add',
      onclick: () => { state.tokens.push({ appId: '', appLabel: '', token: '' }); render(); },
    }, ['+ 新增 Token']));
    return sec;
  };

  const renderRulesSection = () => {
    const sec = el('section', { class: 'sda-section' });
    sec.appendChild(el('h3', { class: 'sda-section-title' }, ['2. 規則列表']));
    sec.appendChild(el('p', { class: 'sda-section-help' }, [
      '規則由上而下依序執行；後寫的會覆蓋前寫的。' +
      '「寫入其他 App」只在 submit / process.proceed 時機觸發；*.show 時機只跑「寫入本記錄」/ 唯讀鎖定。' +
      '「跳出提醒視窗」會擋住排在它下面的規則，直到使用者按下確定——所以要被它擋住的規則請排在它後面；' +
      '「寫入其他 App」一律最後執行，因此必定被提醒視窗擋住。'
    ]));

    state.rules.forEach((r, idx) => sec.appendChild(renderRuleCard(r, idx)));
    sec.appendChild(el('button', {
      class: 'sda-btn sda-btn-add',
      onclick: () => {
        state.rules.push({
          id: `r-${Date.now()}`,
          enabled: true,
          label: '',
          trigger: 'process.proceed',
          fromStatus: '*',
          toStatus: '*',
          actionName: '*',
          statusCond: '*',
          conditions: [],
          conditionLogic: 'AND',
          action: 'writeSelf',
          targetField: '',
          valueSource: 'fixed',
          valueParam: '',
          skipIfFilled: false,
          appendMode: false,
          writeMode: 'upsert',
          targetApp: '',
          keyMapping: [],
          fieldMapping: [],
          onError: 'block',
        });
        render();
      },
    }, ['+ 新增規則']));
    return sec;
  };

  const renderConditionsEditor = (r) => {
    if (!Array.isArray(r.conditions)) r.conditions = [];
    if (!r.conditionLogic) r.conditionLogic = 'AND';

    const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });

    const toggleRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } });
    const logicToggle = el('div', { style: {
      display: 'inline-flex', border: '1px solid #d4d7d7', borderRadius: '3px', overflow: 'hidden'
    }});
    const makeLogicBtn = (label, value) => {
      const isActive   = r.conditionLogic === value;
      const activeClr  = value === 'OR' ? '#8e44ad' : '#2471a3';
      const btn = el('button', { style: {
        padding: '3px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
        border: 'none', letterSpacing: '.03em',
        background: isActive ? activeClr : '#fff', color: isActive ? '#fff' : '#888',
      }}, [label]);
      btn.addEventListener('click', () => { r.conditionLogic = value; render(); });
      return btn;
    };
    logicToggle.appendChild(makeLogicBtn('AND', 'AND'));
    logicToggle.appendChild(makeLogicBtn('OR',  'OR'));
    toggleRow.appendChild(logicToggle);
    const hintSpan = el('span', { style: { fontSize: '11px', color: '#aaa' } }, [
      r.conditionLogic === 'OR' ? '任一條件滿足即觸發' : '所有條件都滿足才觸發'
    ]);
    toggleRow.appendChild(hintSpan);
    wrap.appendChild(toggleRow);

    const isOr = r.conditionLogic === 'OR';
    r.conditions.forEach((cond, ci) => {

      if (ci > 0) {
        wrap.appendChild(el('div', { style: {
          textAlign: 'center', fontSize: '11px', fontWeight: '700',
          color: isOr ? '#8e44ad' : '#2471a3', padding: '1px 0'
        }}, [r.conditionLogic]));
      }
      const row = el('div', { style: {
        display: 'grid', gridTemplateColumns: '1fr 120px 1fr auto', gap: '5px', alignItems: 'center'
      }});

      row.appendChild(fieldCombo(FIELD_OPTIONS, cond.field, (v) => { r.conditions[ci].field = v; }));

      row.appendChild(select(COND_OPS, cond.op || 'eq', (v) => { r.conditions[ci].op = v; }));

      const valI = textInput(cond.value, (v) => { r.conditions[ci].value = v; }, '比對值');
      row.appendChild(valI);

      row.appendChild(el('button', {
        class: 'sda-btn-row',
        onclick: () => { r.conditions.splice(ci, 1); render(); },
      }, ['✕']));
      wrap.appendChild(row);
    });

    wrap.appendChild(el('button', {
      class: 'sda-btn sda-btn-add',
      style: { alignSelf: 'flex-start', marginTop: '2px', fontSize: '11px', padding: '3px 9px', color: '#2471a3', borderColor: '#aed6f1' },
      onclick: () => { r.conditions.push({ field: '', op: 'eq', value: '' }); render(); },
    }, ['+ 新增條件']));

    return wrap;
  };

  const mappingParamControl = (m) => {
    const vs = m.valueSource;
    if (vs === 'fieldCopy') {
      return fieldCombo(FIELD_OPTIONS, typeof m.valueParam === 'string' ? m.valueParam : '', (v) => { m.valueParam = v; });
    }
    if (vs === 'fixed') {
      return textInput(typeof m.valueParam === 'string' ? m.valueParam : '', (v) => { m.valueParam = v; }, '固定值');
    }
    if (vs === 'formula') {
      return textInput(typeof m.valueParam === 'string' ? m.valueParam : '', (v) => { m.valueParam = v; }, '例 {数量}*{単価}+10');
    }
    if (['lookup', 'dateShift', 'subtableLastRow', 'appendText', 'copyAttachment'].includes(vs)) {
      const ph = {
        lookup:         '{ "app":"456","keyField":"客戶代碼","keyExpr":"{客戶代碼}","returnField":"電話","onMiss":"empty" }',
        dateShift:      '{ "base":{"from":"target","field":"申請日期"}, "amount":1, "unit":"years", "output":"date" }',
        subtableLastRow: '{ "table":"明細","field":"金額","row":"last" }',
        appendText:     '{ "value":{"valueSource":"recordId"}, "separator":" / ", "dedup":true }',
        copyAttachment: '{ "from":{"app":"135","keyField":"請購單據編號","keyExpr":"{請購單據編號}","attachmentField":"發票附件"}, "mode":"replace", "maxFileSize":10485760, "onError":"log" }',
      }[vs] || '';
      return textarea(m.valueParam, (v) => { try { m.valueParam = JSON.parse(v); } catch { m.valueParam = v; } }, ph);
    }
    return el('span', { class: 'sda-row-label', style: { color: '#aaa', alignSelf: 'center' } }, ['（此來源不需參數）']);
  };

  const renderMappingEditor = (r, kind, targetOpts, addLabel) => {
    if (!Array.isArray(r[kind])) r[kind] = [];
    const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });

    r[kind].forEach((m, mi) => {
      const row = el('div', { class: 'sda-mapping-row' });
      row.appendChild(fieldCombo(targetOpts, m.targetField, (v) => { r[kind][mi].targetField = v; }));
      row.appendChild(el('span', { class: 'sda-arrow' }, ['⇐']));
      const srcWrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '0' } });
      srcWrap.appendChild(select(MAPPING_VALUE_SOURCES, m.valueSource || 'fieldCopy', (v) => { r[kind][mi].valueSource = v; render(); }));
      srcWrap.appendChild(mappingParamControl(m));
      row.appendChild(srcWrap);
      row.appendChild(el('button', { class: 'sda-btn-row', onclick: () => { r[kind].splice(mi, 1); render(); } }, ['✕']));
      wrap.appendChild(row);
    });

    const btnRow = el('div', { style: { display: 'flex', gap: '8px', marginTop: '2px' } });
    btnRow.appendChild(el('button', {
      class: 'sda-btn sda-btn-add', style: { fontSize: '11px', padding: '3px 9px', color: '#2471a3', borderColor: '#aed6f1', marginTop: '0' },
      onclick: () => { r[kind].push({ targetField: '', valueSource: 'fieldCopy', valueParam: '' }); render(); },
    }, [addLabel || '+ 新增對應']));
    btnRow.appendChild(el('button', {
      class: 'sda-btn', style: { fontSize: '11px', padding: '3px 9px' },
      title: '進階：直接以 JSON 編輯此對應（陣列）',
      onclick: () => openTextModal({
        title: '進階：直接編輯此對應的 JSON（陣列）',
        value: JSON.stringify(r[kind] || [], null, 2),
        confirmLabel: '套用',
        onConfirm: async (text) => {
          let parsed;
          try { parsed = JSON.parse(text); }
          catch { await notify({ icon: 'error', title: '格式錯誤', text: 'JSON 格式錯誤，請檢查括號與引號是否成對。' }); return false; }
          if (!Array.isArray(parsed)) {
            await notify({ icon: 'error', title: '格式錯誤', text: '此欄位必須是陣列，請以 [ ... ] 包住。' });
            return false;
          }
          r[kind] = parsed; render();
        },
      }),
    }, ['{ } JSON']));
    wrap.appendChild(btnRow);
    return wrap;
  };

  const renderRuleCard = (r, idx) => {
    const card = el('div', {
      class: 'sda-rule-card' + (r.enabled === false ? ' is-disabled' : '')
    });

    const header = el('div', { class: 'sda-rule-head' });
    header.appendChild(checkbox(r.enabled !== false, (v) => { r.enabled = v; render(); }, '啟用'));
    const labelI = textInput(r.label, (v) => { r.label = v; }, `規則 #${idx + 1} 顯示名稱`);
    labelI.style.flex = '1';
    header.appendChild(labelI);
    header.appendChild(el('button', {
      class: 'sda-btn sda-btn-row', onclick: () => { state.rules.splice(idx, 1); render(); }
    }, ['刪除']));
    header.appendChild(el('button', {
      class: 'sda-btn sda-btn-copy',
      title: '複製此規則，新增在下方',
      onclick: () => {
        const copy = JSON.parse(JSON.stringify(r));
        copy.id = `r-${Date.now()}`;
        copy.label = (r.label || `規則 #${idx + 1}`) + '（複製）';
        state.rules.splice(idx + 1, 0, copy);
        render();
      }
    }, ['複製']));
    header.appendChild(el('button', {
      class: 'sda-btn', onclick: () => {
        if (idx > 0) { [state.rules[idx - 1], state.rules[idx]] = [state.rules[idx], state.rules[idx - 1]]; render(); }
      }
    }, ['↑']));
    header.appendChild(el('button', {
      class: 'sda-btn', onclick: () => {
        if (idx < state.rules.length - 1) { [state.rules[idx + 1], state.rules[idx]] = [state.rules[idx], state.rules[idx + 1]]; render(); }
      }
    }, ['↓']));
    card.appendChild(header);

    const grid = el('div', { class: 'sda-rule-grid' });

    const addRow = (label, control) => {
      grid.appendChild(el('div', { class: 'sda-row-label' }, [label]));
      grid.appendChild(control);
    };

    addRow('觸發時機', triggerCheckboxGroup(r.trigger, (v) => { r.trigger = v; render(); }));

    const trigSet = new Set(triggerListOf(r));
    if (trigSet.has('process.proceed')) {
      addRow('從狀態 (fromStatus)', textInput(r.fromStatus, (v) => { r.fromStatus = v; }, '* 任意；多個用逗號，例 A,B'));
      addRow('到狀態 (toStatus)',   textInput(r.toStatus,   (v) => { r.toStatus = v; }, '* 任意；多個用逗號，例 核准完了,B課核准'));
      addRow('動作名稱 (actionName)', textInput(r.actionName, (v) => { r.actionName = v; }, '* 任意；多個用逗號'));
    } else if (trigSet.size > 0) {
      addRow('當狀態 = ', textInput(r.statusCond, (v) => { r.statusCond = v; }, '* 任意；多個用逗號，例 進行中,審核中（新增類事件無狀態，此條件會被忽略）'));
    } else {
      const note = el('div', { style: { color: '#888', fontSize: '12px' } }, ['（尚未勾選觸發時機）']);
      addRow('狀態條件', note);
    }

    addRow('欄位條件', renderConditionsEditor(r));

    addRow('動作', select(ACTIONS, r.action, (v) => { r.action = v; render(); }));

    if (r.action === 'dialog') {
      if (!r.dialog || typeof r.dialog !== 'object') {
        r.dialog = { icon: 'warn', title: '提醒', text: '', confirmLabel: 'OK', cancelLabel: '', cancelMessage: '', accent: '' };
      }
      const d = r.dialog;
      const canBlock = ruleCanBlock(r);

      addRow('圖示', select(DIALOG_ICONS, d.icon || 'warn', (v) => { d.icon = v; }));
      addRow('標題', textInput(d.title, (v) => { d.title = v; }, '例：提醒（留空＝不顯示標題）'));
      addRow('內文', bigTextarea(d.text, (v) => { d.text = v; },
        '直接打多行文字，換行與縮排會原樣顯示。\n文中的 {欄位代碼} 會代換成該記錄的實際值，例如：\n※　首張憑證寫上請款單編號【{請款單編號}】', 9));
      addRow('', el('div', { style: { color: '#6b7480', fontSize: '12px' } },
        ['內文為純文字，不會解析 HTML；要調字級／顏色／寬度請到下方「4. 提醒視窗外觀」。']));

      addRow('確定鍵文字', textInput(d.confirmLabel, (v) => { d.confirmLabel = v; }, 'OK'));
      addRow('取消鍵文字', textInput(d.cancelLabel, (v) => { d.cancelLabel = v.trim(); render(); },
        '留空＝只有確定鍵（純提醒，按了一定接續）'));

      if (String(d.cancelLabel || '').trim()) {
        addRow('取消時的訊息', textInput(d.cancelMessage, (v) => { d.cancelMessage = v; },
          '已取消操作。（按取消後顯示在 kintone 的錯誤提示列）'));
        if (!canBlock) {
          addRow('', el('div', { class: 'sda-error' },
            ['⚠ 目前勾選的觸發時機攔不住動作（*.show 畫面已載入完、*.submit.success 記錄已存檔），取消鍵會被自動隱藏、只顯示確定鍵。要能中止請改勾「儲存前 (*.submit)」或「流程推進時」。']));
        }
      }

      const accentWrap = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } });
      accentWrap.appendChild(colorPicker(d.accent, state.dialogStyle.accent, (v) => { d.accent = v; render(); }));
      accentWrap.appendChild(el('span', { style: { fontSize: '12px', color: '#6b7480' } },
        [String(d.accent || '').trim() ? `此規則覆寫為 ${d.accent}` : '（未覆寫，使用全域預設強調色）']));
      if (String(d.accent || '').trim()) {
        accentWrap.appendChild(el('button', {
          class: 'sda-btn', style: { fontSize: '11px', padding: '3px 9px' },
          onclick: () => { d.accent = ''; render(); },
        }, ['還原全域']));
      }
      addRow('強調色（圖示）', accentWrap);

      addRow('', el('button', {
        class: 'sda-btn sda-btn-copy', style: { alignSelf: 'flex-start' },
        onclick: () => previewDialogRule(r),
      }, ['👁 預覽此提醒視窗']));

    } else if (r.action === 'writeSelf') {
      addRow('目標欄位', fieldCombo(FIELD_OPTIONS, r.targetField, (v) => { r.targetField = v; render(); }));
      addRow('值的來源', searchableSelect(VALUE_SOURCES, r.valueSource, (v) => { r.valueSource = v; render(); }));

      const needsParam = ['fixed', 'fieldCopy', 'formula', 'lookup', 'dateShift', 'appendSubtable', 'subtableLastRow', 'appendText', 'copyAttachment'].includes(r.valueSource);
      if (needsParam) {
        const isJson = ['lookup', 'dateShift', 'appendSubtable', 'subtableLastRow', 'appendText', 'copyAttachment'].includes(r.valueSource);
        const jsonPlaceholder = {
          lookup:         '{ "app": "456", "keyField": "客戶代碼", "keyExpr": "{客戶代碼}", "returnField": "聯絡電話", "onMiss": "empty" }',
          dateShift:      '{ "base": { "from": "this", "field": "申請日期" }, "amount": 30, "unit": "days", "output": "date" }\n// base.from: "this"=本記錄, "target"=目標App那筆, "now"/"today"=執行當下\n// amount: 數字(可負); 或 { "from":"this"|"target", "field":"天數欄位" }\n// unit: days|hours|minutes|months|years   output: date|datetime|time',
          appendSubtable: '{ "subRules": [ { "targetField": "履歷_狀態", "valueSource": "nextStatus" }, { "targetField": "履歷_時間", "valueSource": "now" } ] }',
          subtableLastRow: '{ "table": "A", "field": "a1", "row": "all" }\n// row: "all"=掃整欄(多勾), "last"=最後一列, "first"=第一列\n// map: { "來源值": "選項名" }  onMiss: "raw"|"empty"',
          appendText:     '{ "value": { "valueSource": "recordNumber" }, "separator": " / ", "dedup": true }\n// value: 巢狀 valueSource，決定要附加的新值（可用 fixed/fieldCopy/recordNumber/recordId/today 等）\n// separator: 分隔字元，預設 " / "\n// dedup: 是否略過已存在的值，預設 true\n// 目標欄位空白時直接寫入新值；欄位為此規則的「目標欄位」本身的現有值',
          copyAttachment: '{ "from": { "app": "135", "keyField": "請購單據編號", "keyExpr": "{請購單據編號}", "attachmentField": "發票附件" }, "mode": "replace", "maxFileSize": 10485760, "onError": "log" }\n// from.app: 來源 App（"this"/省略=本記錄）; keyField/keyExpr: 跨 App 查一筆的鍵; attachmentField: 來源附件欄位代碼\n// 目標欄位=此規則的「目標欄位」(附件欄位); mode: replace(覆蓋)/append(附加,既有檔案會重新上傳保留)\n// 僅在「存檔後 *.submit.success」觸發生效; 需登入者對來源有下載權、對目標有上傳權',
        }[r.valueSource] || '';
        addRow('值的參數', isJson
          ? textarea(r.valueParam, (v) => { try { r.valueParam = JSON.parse(v); } catch { r.valueParam = v; } }, jsonPlaceholder)
          : textInput(typeof r.valueParam === 'string' ? r.valueParam : JSON.stringify(r.valueParam || ''), (v) => { r.valueParam = v; })
        );
      }
      addRow('', checkbox(r.skipIfFilled, (v) => { r.skipIfFilled = v; }, '僅在目標欄位空白時才寫入'));
      addRow('', checkbox(r.appendMode, (v) => { r.appendMode = v; }, '追加模式（CHECK_BOX / 多選：保留原有勾選再加上新值）'));
      if (r.valueSource === 'copyAttachment' && !isSubmitSuccessOnlyTrigger(r)) {
        addRow('', el('div', { class: 'sda-error' },
          ['⚠ 附件檔案複製僅在「存檔後 (*.submit.success)」生效，請把上方「觸發時機」改成「新增存檔後」或「編輯存檔後」，否則儲存時會被擋下。']));
      }
    } else {

      addRow('寫入模式', select(WRITE_MODES, r.writeMode, (v) => { r.writeMode = v; render(); }));

      ensureTargetFields(r.targetApp);
      const appIdInput = el('input', { type: 'text', placeholder: '例：456（輸入後按 Enter 或點別處，載入目標欄位清單）' });
      appIdInput.value = r.targetApp || '';
      appIdInput.addEventListener('input', (e) => { r.targetApp = e.target.value.trim(); });
      appIdInput.addEventListener('change', () => { ensureTargetFields(r.targetApp); render(); });
      addRow('目標 App ID', appIdInput);

      const tf = TARGET_FIELDS[String(r.targetApp || '').trim()];
      if (tf && tf.status === 'error') {
        addRow('', el('div', { class: 'sda-error' }, [`無法讀取目標 App 欄位（${tf.error}）。可直接手動輸入欄位代碼。`]));
      }

      const tOpts = targetFieldOptions(r.targetApp);
      if (r.writeMode !== 'create') {
        addRow('Key 對應', renderMappingEditor(r, 'keyMapping', tOpts, '+ 新增 Key 對應'));
      }
      addRow('欄位對應', renderMappingEditor(r, 'fieldMapping', tOpts, '+ 新增欄位對應'));
      if (ruleUsesCopyAttachment(r) && !isSubmitSuccessOnlyTrigger(r)) {
        addRow('', el('div', { class: 'sda-error' },
          ['⚠ 欄位對應中使用了「附件檔案複製」，僅在「存檔後 (*.submit.success)」生效，請把上方「觸發時機」改成「新增存檔後」或「編輯存檔後」，否則儲存時會被擋下。']));
      }
      addRow('失敗處理', select(ON_ERROR, r.onError, (v) => { r.onError = v; }));
    }

    card.appendChild(grid);
    return card;
  };

  const openTextModal = ({ title, value = '', readonly = false, confirmLabel, onConfirm }) => {
    const overlay = el('div', { style: {
      position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: '9999',
    } });
    const box = el('div', { style: {
      background: '#fff', padding: '16px', borderRadius: '6px',
      width: 'min(680px, 90vw)', boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
    } });
    box.appendChild(el('h3', { style: { margin: '0 0 8px', fontSize: '15px' } }, [title]));
    const ta = el('textarea', { style: {
      width: '100%', height: '320px', fontFamily: 'monospace', fontSize: '12px', boxSizing: 'border-box',
    } });
    ta.value = value;
    if (readonly) ta.readOnly = true;
    box.appendChild(ta);
    const btnRow = el('div', { style: { marginTop: '12px', textAlign: 'right' } });
    const close = () => document.body.removeChild(overlay);
    btnRow.appendChild(el('button', { class: 'sda-btn', style: { marginRight: '8px' }, onclick: close }, ['關閉']));
    if (onConfirm) {

      btnRow.appendChild(el('button', {
        class: 'sda-btn sda-btn-primary',
        onclick: async () => { if ((await onConfirm(ta.value)) !== false) close(); },
      }, [confirmLabel || '確定']));
    }
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    ta.focus();
    if (readonly) ta.select();
  };

  const exportConfig = () => {
    const json = JSON.stringify(state, null, 2);
    const show = (copied) => openTextModal({
      title: copied
        ? '已複製到剪貼簿，可到另一個 App 的外掛設定頁按「匯入設定」貼上'
        : '請手動全選複製以下設定，再到另一個 App 匯入',
      value: json, readonly: true,
    });
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(() => show(true)).catch(() => show(false));
    } else {
      show(false);
    }
  };

  const importConfig = () => {
    openTextModal({
      title: '貼上從其他 App 匯出的設定 JSON（只會套用「規則」，本 App 的 Token／Log 設定保留不變）',
      value: '', confirmLabel: '套用規則',
      onConfirm: async (text) => {
        let parsed;
        try { parsed = JSON.parse(text); }
        catch {
          await notify({ icon: 'error', title: '格式錯誤', text: 'JSON 格式錯誤，請確認貼上的內容完整。' });
          return false;
        }
        const rules = Array.isArray(parsed.rules) ? parsed.rules
          : (Array.isArray(parsed) ? parsed : null);
        if (!rules) {
          await notify({ icon: 'error', title: '找不到規則', text: '這份 JSON 裡沒有 rules，請確認是本外掛匯出的設定。' });
          return false;
        }
        const incomingStyle = (parsed && parsed.dialogStyle && typeof parsed.dialogStyle === 'object') ? parsed.dialogStyle : null;

        const incomingCheck = (parsed && parsed.creatorCheck && typeof parsed.creatorCheck === 'object') ? parsed.creatorCheck : null;
        const styleNote = incomingStyle ? '\n（提醒視窗外觀也會一併套用）' : '';
        const checkNote = incomingCheck ? '\n（建立人狀態檢查的設定也會一併套用；權杖仍需本 App 自己填）' : '';
        const agreed = await askConfirm({
          icon: 'warn', title: '確認匯入',
          text: `將以匯入的 ${rules.length} 條規則「取代」目前的 ${state.rules.length} 條規則。\n（本 App 的 Token／Log App ID 不會變動）${styleNote}${checkNote}`,
          confirmLabel: '確定取代', cancelLabel: '再想想',
        });
        if (!agreed) return false;
        state.rules = rules;
        if (incomingStyle) state.dialogStyle = Object.assign({}, DEFAULT_DIALOG_STYLE, incomingStyle);
        if (incomingCheck) {
          state.creatorCheck = Object.assign({}, DEFAULT_CREATOR_CHECK, incomingCheck);
          if (!Array.isArray(state.creatorCheck.columns)) state.creatorCheck.columns = [];
          state.creatorCheck.visibility = Object.assign({}, DEFAULT_CREATOR_CHECK_VISIBILITY, state.creatorCheck.visibility || {});
          ['users', 'organizations', 'groups'].forEach((k) => {
            if (!Array.isArray(state.creatorCheck.visibility[k])) state.creatorCheck.visibility[k] = [];
          });
        }
        render();
        const msg = document.getElementById('sda-msg');
        if (msg) { msg.className = ''; msg.textContent = `已匯入 ${rules.length} 條規則，確認後請按「儲存」。`; }
        await notify({
          icon: 'success', title: '規則已匯入',
          text: '請務必確認：\n① 規則用到的欄位代碼在本 App 都存在\n② Token／目標 App ID 是否需要重新設定\n\n確認無誤後按「儲存」才會生效。',
        });
      },
    });
  };

  const renderToolbar = () => {
    const bar = el('div', { class: 'sda-toolbar' });
    bar.appendChild(el('span', {
      style: { fontSize: '12px', color: '#9aa3ad' }
    }, [`設定畫面 v${UI_VERSION}`]));
    const msg = el('span', { id: 'sda-msg', style: { fontSize: '13px' } });
    bar.appendChild(msg);
    bar.appendChild(el('span', { class: 'sda-spacer' }));
    bar.appendChild(el('button', {
      class: 'sda-btn', onclick: exportConfig
    }, ['匯出設定']));
    bar.appendChild(el('button', {
      class: 'sda-btn', onclick: importConfig
    }, ['匯入設定']));
    bar.appendChild(el('button', {
      class: 'sda-btn', onclick: () => { history.back(); }
    }, ['取消']));
    bar.appendChild(el('button', {
      class: 'sda-btn sda-btn-primary', onclick: save
    }, ['儲存']));
    return bar;
  };

  const validate = () => {
    const errors = [];
    state.rules.forEach((r, i) => {
      const id = `規則 #${i + 1}` + (r.label ? ` (${r.label})` : '');
      if (r.action === 'writeSelf' && r.valueSource !== 'readonly' && !r.targetField) {
        errors.push(`${id}: 缺少目標欄位`);
      }
      if (r.action === 'dialog' && !String((r.dialog && r.dialog.text) || '').trim()) {
        errors.push(`${id}: 提醒視窗缺少內文`);
      }
      if (r.action === 'writeOther' && !r.targetApp) errors.push(`${id}: 缺少目標 App ID`);
      if (r.action === 'writeOther' && r.writeMode !== 'create' && (!Array.isArray(r.keyMapping) || !r.keyMapping.length)) {
        errors.push(`${id}: update/upsert 必須提供 Key 對應`);
      }
      if (r.action === 'writeOther' && (!Array.isArray(r.fieldMapping) || !r.fieldMapping.length)) {
        errors.push(`${id}: 缺少欄位對應`);
      }
      if (ruleUsesCopyAttachment(r) && !isSubmitSuccessOnlyTrigger(r)) {
        errors.push(`${id}: 附件檔案複製 (copyAttachment) 僅能在「存檔後」觸發時機使用，請只勾選「新增存檔後」或「編輯存檔後」`);
      }
    });

    const c = state.creatorCheck;
    if (c.enabled) {
      if (!String(state.adminApiToken || '').trim()) {
        errors.push('建立人狀態檢查：已啟用但未填「共通管理 API 權杖」（第 1 區），按鈕會查不到帳號狀態');
      }
      const n = Number(c.maxRecords);
      if (!Number.isFinite(n) || n < 1 || n > 5000) {
        errors.push('建立人狀態檢查：掃描上限請填 1 ～ 5000 之間的數字');
      }
      const used = new Set();
      (c.columns || []).forEach((col) => {
        if (!col || !col.field) return;
        if (used.has(col.field)) errors.push(`建立人狀態檢查：顯示欄位「${col.field}」重複`);
        used.add(col.field);
      });
      if (c.visibility && c.visibility.mode === 'restricted') {
        const { users = [], organizations = [], groups = [] } = c.visibility;
        if (!users.length && !organizations.length && !groups.length) {
          errors.push('建立人狀態檢查：已勾選「限制可使用對象」但使用者／部門／群組都留空，按鈕將對所有人都不顯示');
        }
      }
    }
    return errors;
  };

  const save = () => {
    const msg = document.getElementById('sda-msg');
    msg.className = '';
    msg.textContent = '';

    state.rules.forEach((r) => {
      if (Array.isArray(r.conditions)) {
        r.conditions = r.conditions.filter((c) => c && c.field);
      }
    });
    const errors = validate();
    if (errors.length) {
      msg.className = 'sda-error';
      msg.textContent = errors.join(' / ');
      return;
    }

    const selfToken = (state.selfAppToken || '').trim();
    const logToken = (state.logToken || '').trim();
    const tokenMap = {};
    if (selfToken) tokenMap.self = selfToken;
    if (logToken) tokenMap.log = logToken;
    (state.tokens || []).forEach((t) => {
      if (t && t.appId && t.token) tokenMap[String(t.appId)] = String(t.token).trim();
    });

    const combined = [...new Set(Object.values(tokenMap).filter(Boolean))].join(',');

    const adminToken = String(state.adminApiToken || '').trim();
    if (adminToken) tokenMap.adminApi = adminToken;

    const publicState = Object.assign({}, state, {
      selfAppToken: '',
      hasSelfToken: !!selfToken,
      logToken: '',
      hasLogToken: !!logToken,
      adminApiToken: '',
      hasAdminApiToken: !!adminToken,
      creatorCheck: Object.assign({}, state.creatorCheck, {
        columns: (state.creatorCheck.columns || []).filter((col) => col && col.field),
      }),
      tokens: (state.tokens || []).map((t) => {
        const row = { appId: t.appId, appLabel: t.appLabel };
        if (t && t.token) row.secured = true;
        return row;
      }),
    });

    const jsonHeaders = combined
      ? { 'Content-Type': 'application/json', 'X-Cybozu-API-Token': combined }
      : { 'Content-Type': 'application/json' };
    const getHeaders = combined ? { 'X-Cybozu-API-Token': combined } : {};

    chainProxy([
      [REST_PREFIX, 'GET',  getHeaders,  {}],
      [REST_PREFIX, 'POST', jsonHeaders, {}],
      [REST_PREFIX, 'PUT',  jsonHeaders, {}],

      [USER_API_PREFIX, 'GET', adminToken ? { Authorization: `Bearer ${adminToken}` } : {}, {}],
      [TOKEN_MAP_URL, 'POST', {}, { map: JSON.stringify(tokenMap) }],
    ], () => {
      kintone.plugin.app.setConfig({ data: JSON.stringify(publicState) }, () => {

        notify({
          icon: 'success', title: '設定已儲存',
          text: 'API Token 已加密存放於 kintone 伺服器（一般使用者無法讀取）。\n重新整理 App 後生效。',
        }).then(() => { window.location.href = `../../flow?app=${APP_ID}`; });
      });
    });
  };

  loadFields().then(render);
})();
