// Lapisan kosmetik: menyembunyikan slot iklan memakai daftar selektor (AdGuard Base + ABPindo).
// Selektor khusus situs dan yang tanpa token dipasang langsung. Selektor umum (~18 ribu) hanya dipasang bila
// class/id-nya benar-benar muncul di halaman, supaya halaman berat tidak melambat.
(() => {
  'use strict';
  const { api } = globalThis.AdPod;
  const HOST = location.hostname.replace(/^www\./, ''), TOP = window === window.top;
  const ATTRS = ['href', 'alt', 'title', 'src'];
  let style = null, sheet = null, retried = false, observer = null;

  const reset = () => { observer?.disconnect(); observer = null; style?.remove(); style = sheet = null; };

  function addRules(sels) {
    if (!sels.length) return;
    if (!style) {
      style = document.createElement('style');
      style.setAttribute('data-adpod', 'css');
      (document.head || document.documentElement).appendChild(style);
      sheet = style.sheet;
    }
    if (!sheet) {   // CSP halaman memblokir <style>: minta background memasang lewat scripting.insertCSS
      try { api.runtime.sendMessage({ type: 'adpod:css', sels }); } catch {}
      return;
    }
    // Satu selektor tidak valid menggugurkan seluruh aturan, jadi kelompok dibelah dua sampai ketemu.
    const add = list => {
      try { sheet.insertRule(list.join(',') + '{display:none!important}', sheet.cssRules.length); }
      catch { if (list.length > 1) { const m = list.length >> 1; add(list.slice(0, m)); add(list.slice(m)); } }
    };
    for (let i = 0; i < sels.length; i += 64) add(sels.slice(i, i + 64));
  }

  function watch(idx, skip) {
    const seen = new Set(), queue = [];
    let timer = 0;
    const token = t => {
      if (seen.has(t)) return; seen.add(t);
      const list = gi[t]; if (list) for (const s of list) push(s);
    };
    const { gi, ap } = idx, added = new Set();
    const push = s => { if (!skip.has(s) && !added.has(s)) { added.add(s); queue.push(s); } };
    const byAttr = (el, a, v) => {
      const pre = ap[a + '^'], suf = ap[a + '$'], eq = ap[a + '='];
      if (eq && eq[v]) for (const [, s] of eq[v]) push(s);
      for (let n = 1; n <= 8 && n <= v.length; n++) {
        if (pre && pre[v.slice(0, n)]) for (const [needle, s] of pre[v.slice(0, n)]) if (v.startsWith(needle)) push(s);
        if (suf && suf[v.slice(-n)]) for (const [needle, s] of suf[v.slice(-n)]) if (v.endsWith(needle)) push(s);
      }
    };
    const check = el => {
      if (el.nodeType !== 1) return;
      if (el.id) token('#' + el.id);
      for (const c of el.classList) token('.' + c);
      for (const a of ATTRS) { const v = el.getAttribute(a); if (v) byAttr(el, a, v.toLowerCase()); }   // indeks memakai huruf kecil
    };
    const scan = root => { check(root); if (root.firstElementChild) root.querySelectorAll('[class],[id],[href],[alt],[title],[src]').forEach(check); };
    const flush = () => { timer = 0; if (queue.length) addRules(queue.splice(0)); };
    const later = () => { if (!timer && queue.length) timer = setTimeout(flush, 40); };
    observer = new MutationObserver(ms => {
      let added = 0;
      for (const m of ms) { if (m.type === 'attributes') check(m.target); else added += m.addedNodes.length; }
      if (added > 100) scan(document.documentElement);          // banyak simpul sekaligus: satu pindaian lebih murah
      else for (const m of ms) if (m.type === 'childList') m.addedNodes.forEach(scan);
      later();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'id', 'href', 'alt', 'title', 'src'] });
    scan(document.documentElement); later();
  }

  function load() {
    Promise.resolve(api.runtime.sendMessage({ type: 'adpod:cosmetic', host: HOST, top: TOP }))
      .then(r => {
        reset();
        if (!r) return;
        addRules(r.sel || []);
        if (r.idx) watch(r.idx, new Set(r.skip || []));
      })
      .catch(() => { if (!retried) { retried = true; setTimeout(load, 300); } });
  }

  api.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.cfg) load(); });
  load();
})();
