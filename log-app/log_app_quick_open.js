(() => {
  'use strict';

  const F = {
    app: 'LOG_APP',
    record: 'LOG_RECORD',
    result: 'LOG_RESULT',
  };
  const LOG_FIELD_CODES = ['LOG_EVENT', 'LOG_RESULT', 'LOG_CATEGORY', 'LOG_APP', 'LOG_RECORD', 'LOG_USER', 'LOG_MESSAGE'];
  const RESULT_FAIL = '失敗';
  const FAIL_RESULT_CELL_STYLE = { backgroundColor: '#FF9999', color: '#000000', fontWeight: 'bold' };
  const FAIL_ROW_CELL_STYLE = { backgroundColor: '#FDECEA' };
  const LINK_CELL_CANDIDATES = [F.record, F.app, 'LOG_EVENT', 'LOG_RESULT'];
  const HINT_ID = 'sda-log-hint';
  const DETAIL_ID = 'sda-log-detail';
  const STYLE_ID = 'sda-log-style';

  const ICON_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">'
    + '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
    + 'd="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/></svg>';

  const CSS = `
    .sda-log-hide { display:none !important; }
    .sda-log-num, .sda-log-icon { display:inline-flex; align-items:center; gap:5px; vertical-align:middle;
      padding:2px 10px; border-radius:999px; font-size:13px; font-weight:700; line-height:1.4;
      white-space:nowrap; text-decoration:none !important; cursor:pointer;
      transition:background-color .12s, box-shadow .12s; }
    .sda-log-num { background:#1a5fa0; color:#fff !important; font-variant-numeric:tabular-nums;
      box-shadow:0 1px 2px rgba(26,95,160,.35); }
    .sda-log-num:hover { background:#134a7d; box-shadow:0 2px 6px rgba(26,95,160,.45); }
    .sda-log-num:focus-visible, .sda-log-icon:focus-visible { outline:2px solid #f5a623; outline-offset:2px; }
    .sda-log-num svg, .sda-log-icon svg { flex:none; }
    .sda-log-icon { margin-left:6px; background:#fff; color:#1a5fa0 !important; border:1.5px solid #1a5fa0; padding:1px 9px; }
    .sda-log-icon:hover { background:#e8f1fa; }
    .sda-log-icon.is-app { color:#5f6b78 !important; border-color:#8a96a3; border-style:dashed; }
    .sda-log-icon.is-app:hover { background:#f1f3f5; }
    .sda-log-open { display:inline-flex; align-items:center; gap:6px; padding:7px 16px; border-radius:6px;
      background:#1a5fa0; color:#fff !important; border:1.5px solid #1a5fa0; font-size:14px; font-weight:700;
      text-decoration:none !important; white-space:nowrap; box-shadow:0 1px 3px rgba(26,95,160,.35); }
    .sda-log-open:hover { background:#134a7d; border-color:#134a7d; }
    .sda-log-open.is-app { background:#fff; color:#1a5fa0 !important; box-shadow:none; }
    .sda-log-open.is-app:hover { background:#e8f1fa; }
    .sda-log-field { position:relative; cursor:pointer; background-color:#eaf3fc !important;
      box-shadow:inset 0 0 0 1.5px #1a5fa0; border-radius:4px; transition:background-color .12s; }
    .sda-log-field:hover { background-color:#d3e6f8 !important; }
    .sda-log-field.is-app { background-color:#f4f6f8 !important; box-shadow:inset 0 0 0 1.5px #8a96a3; }
    .sda-log-field.is-app:hover { background-color:#e9edf1 !important; }
    .sda-log-field-link { display:flex; justify-content:flex-end; align-items:center; gap:6px;
      color:#1a5fa0 !important; font-weight:700; text-decoration:underline; text-underline-offset:3px;
      font-variant-numeric:tabular-nums; white-space:nowrap; }
    .sda-log-field-link::after { content:''; position:absolute; inset:0; }
    .sda-log-field-link:focus-visible { outline:none; }
    .sda-log-field:focus-within { box-shadow:inset 0 0 0 2px #f5a623; }
    .sda-log-field.is-app .sda-log-field-link { color:#5f6b78 !important; }
    .sda-log-hint { color:#6b7480; font-size:12px; padding:4px 0; }
    .sda-log-detail { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:6px 0; font-size:13px; }
    .sda-log-warn { color:#b9770e; }
  `;

  const isMobile = () => /\/k\/m\//.test(location.pathname);

  const digits = (v) => {
    const s = String(v == null ? '' : v).trim();
    return /^\d+$/.test(s) ? s : '';
  };

  const valueOf = (rec, code) => (rec && rec[code] ? rec[code].value : '');

  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  };

  const sourceUrl = (appId, recordId) => {
    const a = digits(appId);
    const r = digits(recordId);
    if (!a) return '';
    if (isMobile()) return r ? `/k/m/${a}/show?record=${r}` : `/k/m/${a}/`;
    return r ? `/k/${a}/show#record=${r}` : `/k/${a}/`;
  };

  const openLink = (appId, recordId, label) => {
    const url = sourceUrl(appId, recordId);
    if (!url) return null;
    const hasRecord = !!digits(recordId);
    const a = document.createElement('a');
    a.className = 'sda-log-open' + (hasRecord ? '' : ' is-app');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = hasRecord
      ? `開啟 App ${digits(appId)} 的記錄 #${digits(recordId)}（新分頁）`
      : `此筆 Log 沒有記錄編號（多為「新增」時就中斷，記錄尚未建立），改開啟 App ${digits(appId)} 一覽`;
    a.textContent = label || (hasRecord ? '開啟 ↗' : 'App ↗');
    return a;
  };

  const findLinkCells = () => {
    for (const code of LINK_CELL_CANDIDATES) {
      const cells = kintone.app.getFieldElements(code);
      if (cells && cells.length) return { code, cells };
    }
    return null;
  };

  const rowLink = (appId, recordId, asNumber) => {
    const link = openLink(appId, recordId);
    if (!link) return null;
    link.textContent = '';
    if (asNumber) {
      link.className = 'sda-log-num';
      link.appendChild(document.createTextNode(digits(recordId)));
    } else {
      link.className = 'sda-log-icon' + (digits(recordId) ? '' : ' is-app');
      link.appendChild(document.createTextNode(digits(recordId) ? '開啟' : 'App 一覽'));
    }
    link.insertAdjacentHTML('beforeend', ICON_SVG);
    return link;
  };

  const placeLink = ({ host, link, hide }) => {
    hide.forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE) { n.classList.add('sda-log-hide'); return; }
      if (n.nodeType !== Node.TEXT_NODE || !n.textContent.trim()) return;
      const wrap = document.createElement('span');
      wrap.className = 'sda-log-hide';
      host.insertBefore(wrap, n);
      wrap.appendChild(n);
    });
    host.appendChild(link);
  };

  const linkJob = (host, appId, recId, onRecordField) => {
    if (!host || host.querySelector('.sda-log-num, .sda-log-icon')) return null;
    const asNumber = onRecordField && !!digits(recId);
    const link = rowLink(appId, recId, asNumber);
    if (!link) return null;
    return { host, link, hide: asNumber ? Array.from(host.childNodes) : [] };
  };

  const decorateRows = (records) => {
    const found = findLinkCells();
    if (!found) return false;
    const onRecordCol = found.code === F.record;
    const work = [];
    records.forEach((rec, i) => {
      const cell = found.cells[i];
      if (!cell) return;
      const job = linkJob(cell.firstElementChild || cell, valueOf(rec, F.app), valueOf(rec, F.record), onRecordCol);
      if (job) work.push(job);
    });
    work.forEach(placeLink);
    return true;
  };

  const decorateDetailField = (record) => {
    const fieldEl = isMobile()
      ? kintone.mobile.app.record.getFieldElement(F.record)
      : kintone.app.record.getFieldElement(F.record);
    if (!fieldEl) return false;
    if (fieldEl.querySelector('.sda-log-field-link')) return true;
    const recId = digits(valueOf(record, F.record));
    const link = openLink(valueOf(record, F.app), recId);
    if (!link) return true;
    link.className = 'sda-log-field-link';
    link.textContent = recId ? recId : '來源 App 一覽';
    link.insertAdjacentHTML('beforeend', ICON_SVG);
    fieldEl.classList.add('sda-log-field');
    if (!recId) fieldEl.classList.add('is-app');
    placeLink({ host: fieldEl, link, hide: Array.from(fieldEl.childNodes) });
    return true;
  };

  const highlightFailures = (records) => {
    const failed = records.map((rec) => valueOf(rec, F.result) === RESULT_FAIL);
    if (!failed.some(Boolean)) return;
    LOG_FIELD_CODES.forEach((code) => {
      const elements = kintone.app.getFieldElements(code);
      if (!elements) return;
      const style = code === F.result ? FAIL_RESULT_CELL_STYLE : FAIL_ROW_CELL_STYLE;
      elements.forEach((element, i) => {
        if (!failed[i]) return;
        Object.assign(element.style, style);
      });
    });
  };

  const showHint = (visible) => {
    const old = document.getElementById(HINT_ID);
    if (old) old.remove();
    if (!visible) return;
    const space = kintone.app.getHeaderMenuSpaceElement();
    if (!space) return;
    const hint = document.createElement('div');
    hint.id = HINT_ID;
    hint.className = 'sda-log-hint';
    hint.textContent = '提示：把 LOG_RECORD（或 LOG_APP）加進這個一覽表的顯示欄位，每列就會出現「開啟 ↗」按鈕。';
    space.appendChild(hint);
  };

  const onIndexShow = (event) => {
    if (event.viewType !== 'list') return event;
    injectStyle();
    const records = event.records || [];
    highlightFailures(records);
    showHint(!decorateRows(records));
    return event;
  };

  const onDetailShow = (event) => {
    injectStyle();
    const old = document.getElementById(DETAIL_ID);
    if (old) old.remove();

    const appId = digits(valueOf(event.record, F.app));
    const recId = digits(valueOf(event.record, F.record));
    const fieldLinked = !!appId && decorateDetailField(event.record);
    if (fieldLinked) return event;

    const space = isMobile()
      ? kintone.mobile.app.getHeaderSpaceElement()
      : kintone.app.record.getHeaderMenuSpaceElement();
    if (!space) return event;
    const box = document.createElement('div');
    box.id = DETAIL_ID;
    box.className = 'sda-log-detail';

    if (!appId) {
      const warn = document.createElement('span');
      warn.className = 'sda-log-warn';
      warn.textContent = '⚠ 這筆 Log 沒有來源 App ID（可能是「最小欄位」退化寫入），請看 LOG_MESSAGE 內容判斷來源。';
      box.appendChild(warn);
    } else {
      if (recId) box.appendChild(openLink(appId, recId, `開啟來源記錄（App ${appId} ／ #${recId}）↗`));
      box.appendChild(openLink(appId, '', `來源 App ${appId} 一覽 ↗`));
    }
    space.appendChild(box);
    return event;
  };

  kintone.events.on('app.record.index.show', onIndexShow);
  kintone.events.on(['app.record.detail.show', 'mobile.app.record.detail.show'], onDetailShow);
})();
