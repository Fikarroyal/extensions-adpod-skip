// Dipakai bersama oleh background, content script, popup, options, dan onboarding.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const DEFAULTS = { enabled: true, maxChain: 10, network: true, cosmetic: true, video: true, whitelist: [] };
  const hostMatch = (host, list) => list.some(d => host === d || host.endsWith('.' + d));
  const normHost = v => String(v).trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '');
  const getCfg = async () => ({ ...DEFAULTS, ...((await api.storage.local.get('cfg')).cfg || {}) });
  const setCfg = async patch => { const c = { ...(await getCfg()), ...patch }; await api.storage.local.set({ cfg: c }); return c; };
  globalThis.AdPod = { api, DEFAULTS, hostMatch, normHost, getCfg, setCfg };
})();
