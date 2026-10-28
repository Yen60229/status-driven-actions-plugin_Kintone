(function (root) {
  'use strict';

  const CASE_TYPES = [
    { v: 'empty', l: '空值' },
    { v: 'option', l: '等於某欄位的下拉選項之一' },
    { v: 'equals', l: '等於' },
    { v: 'contains', l: '包含' },
    { v: 'regex', l: '符合正規式' },
    { v: 'else', l: '其他（以上皆不符）' },
  ];

  const toHalfWidth = (s) => s
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');

  const rawToString = (raw) => {
    if (raw == null) return '';
    if (Array.isArray(raw)) return raw.map((x) => (x && typeof x === 'object' ? (x.name || x.code || '') : String(x))).join(',');
    if (typeof raw === 'object') return String(raw.name || raw.code || '');
    return String(raw);
  };

  const normalize = (raw, opts) => {
    const o = opts || {};
    let s = rawToString(raw);
    if (o.fullwidth) s = toHalfWidth(s);
    if (o.trim !== false) s = s.trim();
    if (o.removeSpaces) s = s.replace(/\s+/g, '');
    (Array.isArray(o.replaces) ? o.replaces : []).forEach((r) => {
      if (!r || !r.pattern) return;
      s = s.replace(new RegExp(r.pattern, 'g'), r.replace == null ? '' : String(r.replace));
    });
    return s;
  };

  const expand = (tpl, ctx) => String(tpl == null ? '' : tpl)
    .replace(/\{value\}/g, ctx.value)
    .replace(/\{raw\}/g, ctx.raw)
    .replace(/\$([1-9])/g, (_, n) => (ctx.groups[Number(n)] == null ? '' : ctx.groups[Number(n)]));

  const caseMatches = (c, value, optionsOf) => {
    switch (c.type) {
      case 'empty': return value === '' ? [] : null;
      case 'option': {
        if (value === '') return null;
        const opts = optionsOf(c.field) || [];
        return opts.includes(value) ? [] : null;
      }
      case 'equals': return value !== '' && value === String(c.text == null ? '' : c.text) ? [] : null;
      case 'contains': return c.text && value.indexOf(String(c.text)) !== -1 ? [] : null;
      case 'regex': {
        if (!c.pattern) return null;
        const m = value.match(new RegExp(c.pattern));
        return m ? m : null;
      }
      case 'else': return [];
      default: return null;
    }
  };

  const evaluate = (transform, raw, optionsOf) => {
    const t = transform || {};
    const lookup = typeof optionsOf === 'function' ? optionsOf : () => null;
    const rawStr = rawToString(raw);
    const value = normalize(raw, t.normalize);
    const cases = Array.isArray(t.cases) ? t.cases : [];
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i] || {};
      const groups = caseMatches(c, value, lookup);
      if (!groups) continue;
      const ctx = { value, raw: rawStr, groups };
      const set = (Array.isArray(c.sets) ? c.sets : [])
        .filter((x) => x && x.field)
        .map((x) => ({ field: x.field, value: expand(x.value, ctx) }));
      const invalid = set.find((x) => {
        const opts = lookup(x.field);
        return Array.isArray(opts) && x.value !== '' && !opts.includes(x.value);
      });
      if (invalid) continue;
      return {
        matched: true, caseIndex: i, raw: rawStr, value, set,
        warn: c.warn ? expand(c.warn, ctx) : '',
      };
    }
    return { matched: false, caseIndex: -1, raw: rawStr, value, set: [], warn: '' };
  };

  const validateTransform = (t) => {
    const errs = [];
    if (!t || !t.source) errs.push('未選擇來源欄位');
    const cases = (t && Array.isArray(t.cases)) ? t.cases : [];
    if (!cases.length) errs.push('至少要一個條件');
    (t && t.normalize && Array.isArray(t.normalize.replaces) ? t.normalize.replaces : []).forEach((r, i) => {
      if (!r || !r.pattern) return;
      try { new RegExp(r.pattern); } catch (e) { errs.push(`前處理取代第 ${i + 1} 列正規式錯誤：${e.message}`); }
    });
    cases.forEach((c, i) => {
      const n = `條件 ${i + 1}`;
      if (!c || !CASE_TYPES.some((x) => x.v === c.type)) { errs.push(`${n}：條件類型不正確`); return; }
      if (c.type === 'option' && !c.field) errs.push(`${n}：未選擇下拉欄位`);
      if ((c.type === 'equals' || c.type === 'contains') && !String(c.text || '')) errs.push(`${n}：未填比對文字`);
      if (c.type === 'regex') {
        if (!c.pattern) errs.push(`${n}：未填正規式`);
        else { try { new RegExp(c.pattern); } catch (e) { errs.push(`${n}：正規式錯誤：${e.message}`); } }
      }
      const sets = Array.isArray(c.sets) ? c.sets.filter((x) => x && x.field) : [];
      if (!sets.length) errs.push(`${n}：至少要寫入一個欄位`);
    });
    return errs;
  };

  const targetsOf = (transforms) => {
    const out = new Set();
    (transforms || []).forEach((t) => {
      if (!t || t.enabled === false) return;
      (t.cases || []).forEach((c) => (c && Array.isArray(c.sets) ? c.sets : []).forEach((x) => { if (x && x.field) out.add(x.field); }));
    });
    return [...out];
  };

  root.SdaDbMap = Object.freeze({ CASE_TYPES, normalize, evaluate, validateTransform, targetsOf });
})(typeof window !== 'undefined' ? window : globalThis);
