(() => {
  'use strict';

  const DEFAULTS = {
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

  const SWAL_ICONS = {
    warn: 'warning',
    info: 'info',
    success: 'success',
    error: 'error',
    question: 'question',
  };

  const SEMANTIC_ICON_COLORS = { success: '#a5dc86', error: '#f27474' };

  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalize = (s) => {
    const o = Object.assign({}, DEFAULTS, s || {});
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

  const hasSwal = () => !!(window.Swal && typeof window.Swal.fire === 'function');

  const FONT_STACK = '-apple-system,"Segoe UI","Microsoft JhengHei",Arial,sans-serif';

  const effectiveAccent = (style, ruleAccent) => {
    const s = normalize(style);
    return String(ruleAccent || '').trim() || s.accent;
  };

  const iconColorOf = (icon, accent) => SEMANTIC_ICON_COLORS[icon] || accent;

  const PANEL_CSS = [
    `.swal2-popup.sda-swal-panel .swal2-html-container{white-space:normal;text-align:left;overflow:visible;margin:0;}`,
    `.swal2-popup.sda-swal-panel{padding:20px 20px 12px;}`,
    `.sda-pnl-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);display:flex;overflow:auto;padding:16px;box-sizing:border-box;z-index:100000;}`,
    `.sda-pnl{background:#fff;border-radius:12px;margin:auto;box-sizing:border-box;padding:20px;width:min(1180px,96vw);box-shadow:0 12px 44px rgba(0,0,0,.28);font-family:${FONT_STACK};}`,
    `.sda-pnl-title{font-size:18px;font-weight:600;color:#2c2c2a;margin:0 0 12px;}`,
    `.sda-pnl-foot{display:flex;justify-content:flex-end;margin-top:14px;}`,
    `.sda-panel{text-align:left;font-size:13px;color:#3c3c3a;font-family:${FONT_STACK};}`,
    `.sda-panel-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px;}`,
    `.sda-panel-bar .sda-panel-spacer{flex:1;}`,
    `.sda-panel-btn{padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid #c9ced4;background:#fff;color:#444;cursor:pointer;font-family:inherit;}`,
    `.sda-panel-btn:hover:not(:disabled){background:#f4f6f8;}`,
    `.sda-panel-btn:disabled{opacity:.45;cursor:default;}`,
    `.sda-panel-btn-primary{background:#3498db;border-color:#3498db;color:#fff;}`,
    `.sda-panel-btn-primary:hover:not(:disabled){background:#2e89c7;}`,
    `.sda-panel-btn-danger{background:#e74c3c;border-color:#e74c3c;color:#fff;}`,
    `.sda-panel-btn-danger:hover:not(:disabled){background:#d0402f;}`,
    `.sda-panel-scroll{max-height:60vh;overflow:auto;border:1px solid #e3e7ea;border-radius:6px;}`,
    `.sda-panel-table{border-collapse:collapse;width:100%;font-size:13px;}`,
    `.sda-panel-table th,.sda-panel-table td{border-bottom:1px solid #eceff1;padding:6px 8px;text-align:left;vertical-align:middle;white-space:nowrap;}`,
    `.sda-panel-table thead th{position:sticky;top:0;background:#f7f9fa;z-index:1;font-weight:600;color:#5a6470;}`,
    `.sda-panel-table tbody tr:hover{background:#fbfcfd;}`,
    `.sda-panel-table tr.sda-panel-bad{background:#fff6f5;}`,
    `.sda-panel-table tr.sda-panel-bad:hover{background:#ffefed;}`,
    `.sda-panel-table tr.sda-panel-dirty td{background:#fffbe6;}`,
    `.sda-panel-table input[type=text],.sda-panel-table input[type=number],.sda-panel-table input[type=date],.sda-panel-table input[type=time],.sda-panel-table input[type=datetime-local],.sda-panel-table select{width:100%;min-width:90px;box-sizing:border-box;padding:3px 6px;font-size:13px;border:1px solid #cbd2d9;border-radius:4px;font-family:inherit;}`,
    `.sda-panel-table textarea{width:100%;min-width:160px;box-sizing:border-box;padding:3px 6px;font-size:13px;border:1px solid #cbd2d9;border-radius:4px;font-family:inherit;}`,
    `.sda-panel-link{color:#3498db;text-decoration:none;}`,
    `.sda-panel-link:hover{text-decoration:underline;}`,
    `.sda-pick{display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-width:200px;max-width:380px;box-sizing:border-box;padding:2px 4px;border:1px solid #cbd2d9;border-radius:4px;background:#fff;white-space:normal;}`,
    `.sda-pick:focus-within{border-color:#3498db;}`,
    `.sda-panel-table .sda-pick input.sda-pick-input{flex:1;width:auto;min-width:90px;border:none;outline:none;padding:2px;background:transparent;}`,
    `.sda-pick-chip{display:inline-flex;align-items:center;gap:2px;background:#eaf3fb;color:#1f5f8b;border-radius:10px;padding:1px 3px 1px 8px;font-size:12px;white-space:nowrap;}`,
    `.sda-pick-x{border:none;background:none;cursor:pointer;color:#6b7480;padding:0 3px;font-size:13px;line-height:1;}`,
    `.sda-pick-x:hover{color:#c0392b;}`,
    `.sda-pick-menu{position:fixed;z-index:100100;background:#fff;border:1px solid #cbd2d9;border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.15);max-height:260px;overflow:auto;font-size:13px;color:#3c3c3a;text-align:left;font-family:${FONT_STACK};}`,
    `.sda-pick-item{padding:6px 10px;cursor:pointer;white-space:nowrap;}`,
    `.sda-pick-item.is-active,.sda-pick-item:hover{background:#eaf3fb;}`,
    `.sda-pick-sub{color:#8a939c;font-size:11px;margin-left:8px;}`,
    `.sda-pick-empty{padding:8px 10px;color:#8a939c;white-space:normal;max-width:320px;}`,
    `.sda-panel-tag{display:inline-block;padding:1px 7px;border-radius:10px;font-size:12px;white-space:nowrap;}`,
    `.sda-panel-tag-ok{background:#e8f6ee;color:#1e7d4f;}`,
    `.sda-panel-tag-off{background:#fdecea;color:#c0392b;}`,
    `.sda-panel-tag-gone{background:#f3e8fd;color:#7d3c98;}`,
    `.sda-panel-tag-unknown{background:#eef1f3;color:#6b7480;}`,
    `.sda-panel-note{font-size:12px;color:#6b7480;margin:8px 0 0;}`,
    `.sda-panel-msg-ok{color:#1e7d4f;}`,
    `.sda-panel-msg-err{color:#c0392b;}`,
    `.sda-panel-confirm{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#fdecea;border:1px solid #f5b7b1;color:#922b21;padding:8px 10px;border-radius:6px;margin:10px 0 0;font-size:13px;}`,
    `.sda-panel-confirm[hidden]{display:none;}`,
    `@media (max-width:600px){.sda-pnl{padding:14px;}.sda-panel-scroll{max-height:64vh;}}`,
  ];

  const buildCss = (style, ruleAccent, icon) => {
    const s = normalize(style);
    const accent = effectiveAccent(style, ruleAccent);

    const overrideSwalIcon = accent !== DEFAULTS.accent && !SEMANTIC_ICON_COLORS[icon];

    const builtIn = [
      `.sda-dlg-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,${s.overlay});display:flex;overflow:auto;padding:16px;box-sizing:border-box;z-index:100000;}`,
      `.sda-dlg{background:#fff;border-radius:${s.radius}px;width:auto;min-width:280px;margin:auto;box-sizing:border-box;padding:26px 24px 20px;text-align:center;box-shadow:0 12px 44px rgba(0,0,0,.28);font-family:${FONT_STACK};animation:sda-dlg-in .25s ease-out;}`,
      `.sda-dlg-icon{position:relative;width:80px;height:80px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;font-size:42px;line-height:1;}`,
      `.sda-dlg-icon-svg{position:absolute;top:0;left:0;width:100%;height:100%;}`,
      `.sda-dlg-ring{fill:none;stroke:currentColor;stroke-width:4;opacity:${SEMANTIC_ICON_COLORS[icon] ? '.32' : '.78'};stroke-dasharray:233;stroke-dashoffset:233;transform:rotate(-90deg);transform-origin:50% 50%;animation:sda-dlg-ring .55s ease-out forwards;}`,
      `.sda-dlg-mark{fill:none;stroke:currentColor;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;animation:sda-dlg-mark .4s .35s ease-out forwards;}`,
      `.sda-dlg-mark2{animation-delay:.5s;}`,
      `.sda-dlg-glyph{position:relative;animation:sda-dlg-pop .4s .2s both;}`,
      `@keyframes sda-dlg-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}`,
      `@keyframes sda-dlg-ring{to{stroke-dashoffset:0}}`,
      `@keyframes sda-dlg-mark{to{stroke-dashoffset:0}}`,
      `@keyframes sda-dlg-pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}`,
      `@media (prefers-reduced-motion:reduce){.sda-dlg{animation:none}.sda-dlg-ring,.sda-dlg-mark{animation:none;stroke-dashoffset:0}.sda-dlg-glyph{animation:none}}`,
      `.sda-dlg-title{font-size:${s.titleSize}px;font-weight:600;color:#2c2c2a;margin:0 0 14px;}`,
      `.sda-dlg-text{white-space:pre;text-align:${s.align};font-size:${s.fontSize}px;line-height:${s.lineHeight};color:#444441;}`,
      `.sda-dlg-btns{display:flex;gap:10px;justify-content:center;margin-top:22px;}`,
      `.sda-dlg-btn{min-width:96px;padding:9px 22px;font-size:14px;border-radius:6px;cursor:pointer;border:1px solid transparent;font-family:inherit;}`,
      `.sda-dlg-ok{color:#fff;}`,
      `.sda-dlg-cancel{background:#fff;color:#555;border-color:#c9ced4;}`,
      `.sda-dlg-cancel:hover{background:#f4f6f8;}`,
    ];

    const swal = [

      `.swal2-container.sda-swal-container{background:rgba(0,0,0,${s.overlay});z-index:100000;overflow:auto;}`,

      `.swal2-popup.sda-swal{border-radius:${s.radius}px;font-family:${FONT_STACK};min-width:280px;max-width:none;}`,
      `.swal2-popup.sda-swal .swal2-title{font-size:${s.titleSize}px;}`,
      `.swal2-popup.sda-swal .swal2-html-container{white-space:pre;text-align:${s.align};font-size:${s.fontSize}px;line-height:${s.lineHeight};}`,
      `.swal2-popup.sda-swal .swal2-styled.swal2-confirm{background-color:${s.buttonColor};}`,
    ];
    if (overrideSwalIcon) {
      swal.push(`.swal2-popup.sda-swal .swal2-icon{border-color:${accent};color:${accent};}`);
    }

    const narrow = [
      `@media (max-width:600px){.sda-dlg-text,.swal2-popup.sda-swal .swal2-html-container{white-space:pre-wrap;word-break:break-word;}.sda-dlg{max-width:92vw;}.swal2-popup.sda-swal{max-width:92vw;}}`,
    ];

    return builtIn.concat(swal).concat(PANEL_CSS).concat(narrow).concat([s.customCss]).join('\n');
  };

  const ensureStyleEl = (css) => {
    let styleEl = document.getElementById('sda-dlg-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'sda-dlg-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  };

  const showViaSwal = (o, s, icon, hasCancel) => {
    const cfg = {
      text: String(o.text == null ? '' : o.text),
      confirmButtonText: String(o.confirmLabel || 'OK'),
      showCancelButton: hasCancel,
      reverseButtons: true,
      allowOutsideClick: false,

      width: 'auto',
      customClass: { container: 'sda-swal-container', popup: 'sda-swal' },
    };
    const title = String(o.title == null ? '' : o.title);
    if (title) cfg.title = title;
    if (hasCancel) cfg.cancelButtonText = String(o.cancelLabel);
    if (icon !== 'none' && SWAL_ICONS[icon]) cfg.icon = SWAL_ICONS[icon];

    return window.Swal.fire(cfg).then((r) => (hasCancel ? !!(r && r.isConfirmed) : true));
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    return e;
  };

  const buildIcon = (icon, color) => {
    const wrap = document.createElement('div');
    wrap.className = 'sda-dlg-icon';
    wrap.style.color = color;

    const svg = svgEl('svg', { viewBox: '0 0 80 80', class: 'sda-dlg-icon-svg' });
    svg.appendChild(svgEl('circle', { class: 'sda-dlg-ring', cx: '40', cy: '40', r: '37' }));

    switch (icon) {
      case 'success':
        svg.appendChild(svgEl('polyline', { class: 'sda-dlg-mark', points: '24,41 35,52 57,28' }));
        break;
      case 'error':
        svg.appendChild(svgEl('line', { class: 'sda-dlg-mark', x1: '28', y1: '28', x2: '52', y2: '52' }));
        svg.appendChild(svgEl('line', { class: 'sda-dlg-mark sda-dlg-mark2', x1: '52', y1: '28', x2: '28', y2: '52' }));
        break;
      default: {
        const g = document.createElement('span');
        g.className = 'sda-dlg-glyph';
        g.textContent = GLYPHS[icon];
        wrap.appendChild(g);
      }
    }
    wrap.insertBefore(svg, wrap.firstChild);
    return wrap;
  };

  const showBuiltIn = (o, s, icon, hasCancel, accent) => new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sda-dlg-overlay';
    const box = document.createElement('div');
    box.className = 'sda-dlg';
    box.setAttribute('role', 'alertdialog');

    if (icon !== 'none' && GLYPHS[icon]) {
      box.appendChild(buildIcon(icon, iconColorOf(icon, accent)));
    }

    const title = String(o.title == null ? '' : o.title);
    if (title) {
      const t = document.createElement('div');
      t.className = 'sda-dlg-title';
      t.textContent = title;
      box.appendChild(t);
    }

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

  const show = (opts) => {
    const o = opts || {};
    const s = normalize(o.style);
    const icon = o.icon || 'warn';
    const accent = effectiveAccent(o.style, o.accent);
    const hasCancel = !!String(o.cancelLabel || '').trim();

    ensureStyleEl(buildCss(o.style, o.accent, icon));

    if (hasSwal()) {
      try {
        return showViaSwal(o, s, icon, hasCancel);
      } catch (e) {
        console.warn('[sda][dialog] SweetAlert2 呼叫失敗，改用內建元件', e);
      }
    }
    return showBuiltIn(o, s, icon, hasCancel, accent);
  };

  const showPanelBuiltIn = (o, content, closeLabel) => new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sda-pnl-overlay';
    const box = document.createElement('div');
    box.className = 'sda-pnl';
    box.setAttribute('role', 'dialog');

    const title = String(o.title == null ? '' : o.title);
    if (title) {
      const t = document.createElement('div');
      t.className = 'sda-pnl-title';
      t.textContent = title;
      box.appendChild(t);
    }
    if (content) box.appendChild(content);

    const foot = document.createElement('div');
    foot.className = 'sda-pnl-foot';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sda-panel-btn';
    closeBtn.textContent = closeLabel;
    foot.appendChild(closeBtn);
    box.appendChild(foot);
    overlay.appendChild(box);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(true);
    };
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
    }
    closeBtn.addEventListener('click', finish);
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(overlay);
    if (typeof o.onReady === 'function') o.onReady({ close: finish });
  });

  const showPanel = (opts) => {
    const o = opts || {};
    const icon = o.icon || 'none';
    const closeLabel = String(o.closeLabel || '關閉');
    const content = o.content || null;

    ensureStyleEl(buildCss(o.style, o.accent, icon));

    if (hasSwal()) {
      try {
        return window.Swal.fire({
          title: String(o.title == null ? '' : o.title),
          html: content,
          width: o.width || 'min(1180px, 96vw)',
          confirmButtonText: closeLabel,
          allowOutsideClick: false,
          customClass: { container: 'sda-swal-container', popup: 'sda-swal sda-swal-panel' },
          didOpen: () => {
            if (typeof o.onReady === 'function') o.onReady({ close: () => window.Swal.close() });
          },
        }).then(() => true);
      } catch (e) {
        console.warn('[sda][dialog] SweetAlert2 面板呼叫失敗，改用內建元件', e);
      }
    }
    return showPanelBuiltIn(o, content, closeLabel);
  };

  window.SdaDialog = window.SdaDialog || { show, showPanel, buildCss, hasSwal, DEFAULT_STYLE: DEFAULTS };
})();
