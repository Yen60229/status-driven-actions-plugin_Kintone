(() => {
  'use strict';

  // 共用檔：runtime（desktop.js / mobile.js）與設定畫面（config.js）都載入這一支。
  //
  // 兩種渲染器：頁面上有 SweetAlert2（window.Swal）就用它，沒有才用內建的原生元件。
  // 偵測必須在 show() 當下做，不能在載入時做——外掛 JS 可能早於 App 自訂 JS 執行，
  // 載入當下 window.Swal 還不存在，但事件觸發時它已經在了。
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

  // success / error 的圖示由多個子元素組成（勾線、叉線各自有底色），只覆寫 border-color
  // 與 color 會得到半染色的結果。這兩種一律用語意色，accent 不介入，兩種渲染器行為一致。
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

  const buildCss = (style, ruleAccent, icon) => {
    const s = normalize(style);
    const accent = effectiveAccent(style, ruleAccent);
    // accent 停在預設值＝管理者沒表達意見，此時讓 SweetAlert2 沿用它原生的圖示配色
    // （淺橘圈線＋較深的驚嘆號），不要用單一色壓平它。
    const overrideSwalIcon = accent !== DEFAULTS.accent && !SEMANTIC_ICON_COLORS[icon];

    // 寬度完全交給內容：width:auto、不設 max-width，盒子長到最長那一行為止。
    // 遮罩改成可捲動 + 視窗用 margin:auto 置中——flex 的 center 對齊在內容超出容器時
    // 會把起始邊裁掉且捲不到，margin:auto 沒有這個問題。
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

    // 全部以 .sda-swal / .sda-swal-container 收斂，避免動到 App 自己呼叫的 SweetAlert2。
    const swal = [
      // z-index 必須壓過設定畫面自製的 openTextModal 覆蓋層（9999），否則會被蓋住。
      `.swal2-container.sda-swal-container{background:rgba(0,0,0,${s.overlay});z-index:100000;overflow:auto;}`,
      // SweetAlert2 的 .swal2-popup 自帶 max-width:100%，不解掉就長不出容器寬度。
      `.swal2-popup.sda-swal{border-radius:${s.radius}px;font-family:${FONT_STACK};min-width:280px;max-width:none;}`,
      `.swal2-popup.sda-swal .swal2-title{font-size:${s.titleSize}px;}`,
      `.swal2-popup.sda-swal .swal2-html-container{white-space:pre;text-align:${s.align};font-size:${s.fontSize}px;line-height:${s.lineHeight};}`,
      `.swal2-popup.sda-swal .swal2-styled.swal2-confirm{background-color:${s.buttonColor};}`,
    ];
    if (overrideSwalIcon) {
      swal.push(`.swal2-popup.sda-swal .swal2-icon{border-color:${accent};color:${accent};}`);
    }

    // 窄螢幕退路：不換行在手機上會逼使用者左右滑才讀得完提醒，600px 以下恢復自動換行。
    const narrow = [
      `@media (max-width:600px){.sda-dlg-text,.swal2-popup.sda-swal .swal2-html-container{white-space:pre-wrap;word-break:break-word;}.sda-dlg{max-width:92vw;}.swal2-popup.sda-swal{max-width:92vw;}}`,
    ];

    return builtIn.concat(swal).concat(narrow).concat([s.customCss]).join('\n');
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
      // 'auto' 讓 SweetAlert2 也縮到剛好包住內容；上限由 .sda-swal 的 max-width 控制。
      width: 'auto',
      customClass: { container: 'sda-swal-container', popup: 'sda-swal' },
    };
    const title = String(o.title == null ? '' : o.title);
    if (title) cfg.title = title;
    if (hasCancel) cfg.cancelButtonText = String(o.cancelLabel);
    if (icon !== 'none' && SWAL_ICONS[icon]) cfg.icon = SWAL_ICONS[icon];

    // 沒有取消鍵時一律回 true：Esc 關掉純提醒不該被當成中止（與內建渲染器一致）。
    return window.Swal.fire(cfg).then((r) => (hasCancel ? !!(r && r.isConfirmed) : true));
  };

  // 內建元件的圖示改用 SVG：圓環與勾／叉都靠 stroke-dashoffset 畫出來，
  // 才有 SweetAlert2 那種「打勾動畫」。warn / info / question 仍用文字字元，只有圓環會動。
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

  window.SdaDialog = window.SdaDialog || { show, buildCss, hasSwal, DEFAULT_STYLE: DEFAULTS };
})();
