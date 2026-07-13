(() => {
  'use strict';

  const UI_VERSION = '1.9.0';
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
  };

  const triggerListOf = (r) => String(r.trigger || '').split(',').map((s) => s.trim()).filter(Boolean);

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
  ];

  const ACTIONS = [
    { v: 'writeSelf',  l: '寫入本記錄欄位' },
    { v: 'writeOther', l: '寫入其他 App 記錄' },
  ];

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

  const textInput = (value, onChange, placeholder = '') => {
    const i = el('input', { type: 'text', placeholder });
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
      ['流程推進 (process.proceed) 只能單獨勾選；「顯示類」(*.show) 之間可複選；「儲存類」(*.submit) 之間可複選；顯示類與儲存類不能混選。']
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
  const loadFields = () => {
    if (!window.KintoneConfigHelper) return Promise.resolve([]);

    return KintoneConfigHelper.getFields()
      .then((fields) => {
        const opts = [{ v: '', l: '— 請選擇 —' }];
        (fields || []).forEach((f) => opts.push({ v: f.code, l: `${f.label} (${f.code}) [${f.type}]` }));
        FIELD_OPTIONS = opts;
        return opts;
      })
      .catch(() => []);
  };

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
      textInput(state.logToken, (v) => { state.logToken = v.trim(); }, '選填。Log App 的 Token（具「新增記錄」權限）。留空＝用操作者身分寫')));

    return sec;
  };

  const renderTokensSection = () => {
    const sec = el('section', { class: 'sda-section' });
    sec.appendChild(el('h3', { class: 'sda-section-title' }, ['1. API Token 設定']));

    sec.appendChild(el('p', { class: 'sda-section-help' }, [
      '【本 App API Token】流程推進後若使用者在新狀態沒有編輯權限，' +
      '外掛會用此 Token 補償寫入子表履歷。未填時若有欄位權限限制可能導致履歷漏記。'
    ]));
    const selfRow = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' } });
    selfRow.appendChild(el('span', { style: { whiteSpace: 'nowrap', fontSize: '13px' } }, ['本 App Token：']));
    const selfInput = textInput(state.selfAppToken, (v) => { state.selfAppToken = v; }, '本 App 的 API Token（管理員建立，具記錄編輯權限）');
    selfInput.style.flex = '1';
    selfRow.appendChild(selfInput);
    sec.appendChild(selfRow);

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
        el('td', {}, [textInput(t.token, (v) => { state.tokens[i].token = v; }, 'API Token')]),
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
      '「寫入其他 App」只在 submit / process.proceed 時機觸發；*.show 時機只跑「寫入本記錄」/ 唯讀鎖定。'
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
    if (['lookup', 'dateShift', 'subtableLastRow'].includes(vs)) {
      const ph = {
        lookup:         '{ "app":"456","keyField":"客戶代碼","keyExpr":"{客戶代碼}","returnField":"電話","onMiss":"empty" }',
        dateShift:      '{ "base":{"from":"target","field":"申請日期"}, "amount":1, "unit":"years", "output":"date" }',
        subtableLastRow: '{ "table":"明細","field":"金額","row":"last" }',
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
        onConfirm: (text) => {
          let parsed;
          try { parsed = JSON.parse(text); } catch { alert('JSON 格式錯誤'); return false; }
          if (!Array.isArray(parsed)) { alert('必須是陣列 [ ... ]'); return false; }
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

    if (r.action === 'writeSelf') {
      addRow('目標欄位', fieldCombo(FIELD_OPTIONS, r.targetField, (v) => { r.targetField = v; render(); }));
      addRow('值的來源', searchableSelect(VALUE_SOURCES, r.valueSource, (v) => { r.valueSource = v; render(); }));

      const needsParam = ['fixed', 'fieldCopy', 'formula', 'lookup', 'dateShift', 'appendSubtable', 'subtableLastRow'].includes(r.valueSource);
      if (needsParam) {
        const isJson = ['lookup', 'dateShift', 'appendSubtable', 'subtableLastRow'].includes(r.valueSource);
        const jsonPlaceholder = {
          lookup:         '{ "app": "456", "keyField": "客戶代碼", "keyExpr": "{客戶代碼}", "returnField": "聯絡電話", "onMiss": "empty" }',
          dateShift:      '{ "base": { "from": "this", "field": "申請日期" }, "amount": 30, "unit": "days", "output": "date" }\n// base.from: "this"=本記錄, "target"=目標App那筆, "now"/"today"=執行當下\n// amount: 數字(可負); 或 { "from":"this"|"target", "field":"天數欄位" }\n// unit: days|hours|minutes|months|years   output: date|datetime|time',
          appendSubtable: '{ "subRules": [ { "targetField": "履歷_狀態", "valueSource": "nextStatus" }, { "targetField": "履歷_時間", "valueSource": "now" } ] }',
          subtableLastRow: '{ "table": "A", "field": "a1", "row": "all" }\n// row: "all"=掃整欄(多勾), "last"=最後一列, "first"=第一列\n// map: { "來源值": "選項名" }  onMiss: "raw"|"empty"',
        }[r.valueSource] || '';
        addRow('值的參數', isJson
          ? textarea(r.valueParam, (v) => { try { r.valueParam = JSON.parse(v); } catch { r.valueParam = v; } }, jsonPlaceholder)
          : textInput(typeof r.valueParam === 'string' ? r.valueParam : JSON.stringify(r.valueParam || ''), (v) => { r.valueParam = v; })
        );
      }
      addRow('', checkbox(r.skipIfFilled, (v) => { r.skipIfFilled = v; }, '僅在目標欄位空白時才寫入'));
      addRow('', checkbox(r.appendMode, (v) => { r.appendMode = v; }, '追加模式（CHECK_BOX / 多選：保留原有勾選再加上新值）'));
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
        onclick: () => { if (onConfirm(ta.value) !== false) close(); },
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
      onConfirm: (text) => {
        let parsed;
        try { parsed = JSON.parse(text); }
        catch { alert('JSON 格式錯誤，請確認貼上的內容完整。'); return false; }
        const rules = Array.isArray(parsed.rules) ? parsed.rules
          : (Array.isArray(parsed) ? parsed : null);
        if (!rules) { alert('找不到 rules，請確認這是本外掛匯出的設定。'); return false; }
        if (!confirm(`將以匯入的 ${rules.length} 條規則「取代」目前的 ${state.rules.length} 條規則。\n（本 App 的 Token／Log App ID 不會變動）\n確定要套用嗎？`)) return false;
        state.rules = rules;
        render();
        const msg = document.getElementById('sda-msg');
        if (msg) { msg.className = ''; msg.textContent = `已匯入 ${rules.length} 條規則，確認後請按「儲存」。`; }
        alert('規則已匯入。\n\n請務必確認：\n1. 規則用到的欄位代碼在本 App 都存在\n2. Token／目標 App ID 是否需要重新設定\n\n確認無誤後按「儲存」才會生效。');
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
      if (r.action === 'writeOther' && !r.targetApp) errors.push(`${id}: 缺少目標 App ID`);
      if (r.action === 'writeOther' && r.writeMode !== 'create' && (!Array.isArray(r.keyMapping) || !r.keyMapping.length)) {
        errors.push(`${id}: update/upsert 必須提供 Key 對應`);
      }
      if (r.action === 'writeOther' && (!Array.isArray(r.fieldMapping) || !r.fieldMapping.length)) {
        errors.push(`${id}: 缺少欄位對應`);
      }
    });
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
    kintone.plugin.app.setConfig({ data: JSON.stringify(state) }, () => {
      alert('設定已儲存。重新整理 App 後生效。');
      window.location.href = `../../flow?app=${APP_ID}`;
    });
  };

  loadFields().then(render);
})();
