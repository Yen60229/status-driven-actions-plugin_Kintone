(() => {
  'use strict';

  // 共用檔：runtime（desktop.js / mobile.js）與設定畫面（config.js）都載入這一支，
  // 所以設定畫面的「預覽」呼叫的是正式渲染函式本身，不會有預覽與實際長不一樣的問題。
  const DEFAULTS = {
    width: 420,
    fontSize: 14,
    lineHeight: 1.9,
    titleSize: 20,
    radius: 12,
    overlay: 0.45,
    accent: '#f5a623',
    buttonColor: '#7b68ee',
    align: 'left',
    customCss: '',
  };

  const GLYPHS = {
    warn: '!',
    info: 'i',
    success: '✓',
    error: '✕',
    question: '?',
  };

  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalize = (s) => {
    const o = Object.assign({}, DEFAULTS, s || {});
    o.width = num(o.width, DEFAULTS.width);
    o.fontSize = num(o.fontSize, DEFAULTS.fontSize);
    o.lineHeight = num(o.lineHeight, DEFAULTS.lineHeight);
    o.titleSize = num(o.titleSize, DEFAULTS.titleSize);
    o.radius = num(o.radius, DEFAULTS.radius);
    o.overlay = Math.min(Math.max(num(o.overlay, DEFAULTS.overlay), 0), 1);
    o.align = o.align === 'center' ? 'center' : 'left';
    o.accent = String(o.accent || DEFAULTS.accent);
    o.buttonColor = String(o.buttonColor || DEFAULTS.buttonColor);
    o.customCss = typeof o.customCss === 'string' ? o.customCss : '';
    return o;
  };

  const buildCss = (style) => {
    const s = normalize(style);
    return [
      `.sda-dlg-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,${s.overlay});display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;z-index:100000;}`,
      `.sda-dlg{background:#fff;border-radius:${s.radius}px;width:min(${s.width}px,92vw);max-height:86vh;overflow-y:auto;box-sizing:border-box;padding:26px 24px 20px;text-align:center;box-shadow:0 12px 44px rgba(0,0,0,.28);font-family:-apple-system,"Segoe UI","Microsoft JhengHei",Arial,sans-serif;}`,
      `.sda-dlg-icon{width:64px;height:64px;margin:0 auto 16px;border-radius:50%;border:2px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:34px;line-height:1;}`,
      `.sda-dlg-title{font-size:${s.titleSize}px;font-weight:600;color:#2c2c2a;margin:0 0 14px;}`,
      `.sda-dlg-text{white-space:pre-wrap;word-break:break-word;text-align:${s.align};font-size:${s.fontSize}px;line-height:${s.lineHeight};color:#444441;}`,
      `.sda-dlg-btns{display:flex;gap:10px;justify-content:center;margin-top:22px;}`,
      `.sda-dlg-btn{min-width:96px;padding:9px 22px;font-size:14px;border-radius:6px;cursor:pointer;border:1px solid transparent;font-family:inherit;}`,
      `.sda-dlg-ok{color:#fff;}`,
      `.sda-dlg-cancel{background:#fff;color:#555;border-color:#c9ced4;}`,
      `.sda-dlg-cancel:hover{background:#f4f6f8;}`,
      s.customCss,
    ].join('\n');
  };

  const show = (opts) => new Promise((resolve) => {
    const o = opts || {};
    const s = normalize(o.style);
    const accent = String(o.accent || '').trim() || s.accent;
    const hasCancel = !!String(o.cancelLabel || '').trim();

    let styleEl = document.getElementById('sda-dlg-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'sda-dlg-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = buildCss(o.style);

    const overlay = document.createElement('div');
    overlay.className = 'sda-dlg-overlay';
    const box = document.createElement('div');
    box.className = 'sda-dlg';
    box.setAttribute('role', 'alertdialog');

    const glyph = GLYPHS[o.icon];
    if (o.icon !== 'none' && glyph) {
      const ic = document.createElement('div');
      ic.className = 'sda-dlg-icon';
      ic.style.color = accent;
      ic.textContent = glyph;
      box.appendChild(ic);
    }

    const title = String(o.title == null ? '' : o.title);
    if (title) {
      const t = document.createElement('div');
      t.className = 'sda-dlg-title';
      t.textContent = title;
      box.appendChild(t);
    }

    // textContent + white-space:pre-wrap：換行與縮排原樣保留，且設定內容永遠不會被當成標記解析。
    const body = document.createElement('div');
    body.className = 'sda-dlg-text';
    body.textContent = String(o.text == null ? '' : o.text);
    box.appendChild(body);

    const btns = document.createElement('div');
    btns.className = 'sda-dlg-btns';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'sda-dlg-btn sda-dlg-ok';
    okBtn.style.background = s.buttonColor;
    okBtn.textContent = String(o.confirmLabel || 'OK');

    let cancelBtn = null;
    if (hasCancel) {
      cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'sda-dlg-btn sda-dlg-cancel';
      cancelBtn.textContent = String(o.cancelLabel);
      btns.appendChild(cancelBtn);
    }
    btns.appendChild(okBtn);
    box.appendChild(btns);
    overlay.appendChild(box);

    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(v);
    };

    // 沒有取消鍵時 Esc 等同確定，避免使用者以為關掉視窗就能繞過提醒卻其實中斷了流程。
    function onKey(e) {
      switch (e.key) {
        case 'Enter':  e.preventDefault(); finish(true); break;
        case 'Escape': e.preventDefault(); finish(!hasCancel); break;
      }
    }

    okBtn.addEventListener('click', () => finish(true));
    if (cancelBtn) cancelBtn.addEventListener('click', () => finish(false));
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(overlay);
    setTimeout(() => { try { okBtn.focus(); } catch (e) {  } }, 0);
  });

  window.SdaDialog = window.SdaDialog || { show, buildCss, DEFAULT_STYLE: DEFAULTS };
})();
