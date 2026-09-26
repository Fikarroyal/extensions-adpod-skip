// Berjalan di dunia MAIN (konteks halaman) pada YouTube: membuang data iklan dari respons pemutar
// sebelum pemutar membacanya, sehingga iklan pra-putar tidak pernah dijadwalkan.
(() => {
  'use strict';
  const KEYS = ['adPlacements', 'adSlots', 'playerAds'];
  const strip = o => {
    if (!o || typeof o !== 'object') return o;
    for (const k of KEYS) if (k in o) { try { delete o[k]; } catch { o[k] = undefined; } }
    if (o.playerResponse && typeof o.playerResponse === 'object') strip(o.playerResponse);
    return o;
  };
  const parse = JSON.parse;
  JSON.parse = new Proxy(parse, { apply: (t, self, args) => strip(Reflect.apply(t, self, args)) });
  const json = Response.prototype.json;
  Response.prototype.json = new Proxy(json, { apply: (t, self, args) => Reflect.apply(t, self, args).then(strip) });
  let initial;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', { configurable: true, get: () => initial, set: v => { initial = strip(v); } });
  } catch {}
})();
