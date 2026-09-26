// Handler ad pod: menghitung rangkaian iklan video berurutan (default maks 10), lalu berhenti dan reset.
(() => {
  'use strict';
  const { api, getCfg, hostMatch, DEFAULTS } = globalThis.AdPod;
  const Adapters = globalThis.AdPodAdapters;
  const HOST = location.hostname.replace(/^www\./, '');
  const DEBOUNCE = 250, TICK = 100, IDLE_MS = 3000, MAX_CLICKS = 3;

  let cfg = { ...DEFAULTS };
  let timer = 0, url = location.href;
  const clicks = new WeakMap();          // batas klik per elemen (anti false positive)
  const saved = new Map();               // video -> { mute, rate } asli
  const st = { chain: 0, max: false, lastAd: 0, key: '', lastT: 0 };

  const paused = () => !cfg.enabled || hostMatch(HOST, cfg.whitelist);
  const send = kind => {
    try { Promise.resolve(api.runtime.sendMessage({ type: 'adpod:event', kind, chain: st.chain, max: st.max })).catch(() => {}); } catch {}
  };
  const schedule = ms => { if (!timer) timer = setTimeout(step, ms ?? DEBOUNCE); };

  function register() {                  // satu iklan baru masuk ke rangkaian
    st.chain++; st.lastAd = Date.now();
    if (st.chain >= cfg.maxChain) st.max = true;   // iklan ke-N tetap ditangani, sesudahnya berhenti
    send('handled');
  }
  function restore() {
    saved.forEach((s, v) => { try { v.muted = s.mute; v.playbackRate = s.rate; } catch {} });
    saved.clear();
  }
  function reset() {
    restore();
    const had = st.chain || st.max;
    Object.assign(st, { chain: 0, max: false, lastAd: 0, key: '', lastT: 0 });
    if (had) send('idle');
  }

  function act(t) {
    const el = t.el;
    if (t.type === 'video') {
      const d = el.duration;
      if (!isFinite(d) || d <= 0) return;                   // tunggu metadata siap
      const key = `${el.currentSrc || el.src}|${Math.round(d)}`;
      if (key !== st.key || el.currentTime + 0.5 < st.lastT) {
        if (st.max) { restore(); return; }                  // batas tercapai: kembalikan kendali
        st.key = key; register();
      }
      if (!saved.has(el)) saved.set(el, { mute: el.muted, rate: el.playbackRate });
      el.muted = true;
      const end = el.seekable.length ? el.seekable.end(el.seekable.length - 1) : 0;
      try {
        if (end >= d - 0.5) el.currentTime = d;             // loncat ke akhir
        else { el.currentTime = Math.max(el.currentTime, end); el.playbackRate = 16; }   // belum termuat: percepat
      } catch {}
      st.lastT = el.currentTime; st.lastAd = Date.now();
    } else {
      const n = clicks.get(el) || 0;
      if (n >= MAX_CLICKS) return;
      clicks.set(el, n + 1); el.click(); st.lastAd = Date.now();
    }
  }

  function step() {
    timer = 0;
    if (paused()) return;
    if (location.href !== url) { url = location.href; reset(); }       // navigasi baru = pemicu baru
    const tasks = Adapters.collect(document, HOST, cfg);
    if (!tasks.some(t => t.type === 'video')) restore();               // suara kembali begitu iklan selesai
    if (!tasks.length && st.lastAd && Date.now() - st.lastAd > IDLE_MS) reset();
    tasks.forEach(act);
    if (st.lastAd) schedule(st.max ? 500 : TICK);                      // pantau sampai rangkaian selesai
  }

  function start() {
    new MutationObserver(() => schedule()).observe(document.documentElement,
      { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'src'] });
    ['loadedmetadata', 'durationchange', 'emptied', 'play'].forEach(e => document.addEventListener(e, () => schedule(30), true));
    ['popstate', 'hashchange', 'yt-navigate-finish'].forEach(e => addEventListener(e, () => schedule(30)));
    schedule(0);
  }

  api.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !ch.cfg) return;
    cfg = { ...DEFAULTS, ...ch.cfg.newValue };
    if (paused()) reset(); else schedule(0);
  });
  getCfg().then(c => {
    cfg = c;
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  });
})();
