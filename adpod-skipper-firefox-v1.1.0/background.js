// Service worker (Chrome/Edge) atau event page (Firefox/Safari).
if (typeof importScripts === 'function') importScripts('shared.js');
const { api, getCfg, hostMatch, DEFAULTS } = AdPod;
const sess = api.storage.session ?? api.storage.local;
const key = id => `tab:${id}`;
const quiet = p => { try { Promise.resolve(p).catch(() => {}); } catch {} };
const RULESETS = api.runtime.getManifest().declarative_net_request.rule_resources.map(r => r.id);
const TOP_PRIORITY = 2000000000;   // pengecualian situs harus mengalahkan semua aturan blokir

// ---------- Lapisan 1: aturan jaringan ----------
async function syncRules() {
  const cfg = await getCfg();
  const dnr = api.declarativeNetRequest;
  try {
    if (!(cfg.enabled && cfg.network)) {
      await dnr.updateEnabledRulesets({ disableRulesetIds: RULESETS });
    } else {
      const on = new Set(await dnr.getEnabledRulesets());
      // Bagian pertama dijamin oleh kuota 30.000 aturan. Sisanya dicoba satu per satu sesuai kuota global yang tersedia.
      const todo = RULESETS.filter(id => !on.has(id));
      try { await dnr.updateEnabledRulesets({ enableRulesetIds: todo }); }
      catch { for (const id of todo) { try { await dnr.updateEnabledRulesets({ enableRulesetIds: [id] }); } catch {} } }
    }
    const old = await dnr.getDynamicRules();
    const addRules = cfg.whitelist.map((d, i) => ({
      id: i + 1, priority: TOP_PRIORITY, action: { type: 'allowAllRequests' },
      condition: { requestDomains: [d], resourceTypes: ['main_frame'] }
    }));
    await dnr.updateDynamicRules({ removeRuleIds: old.map(r => r.id), addRules });
  } catch (e) { console.warn('[AdPod] gagal sinkron aturan', e); }
}

// ---------- Lapisan 2: kosmetik ----------
const BUILTIN_G = ['ins.adsbygoogle', '[id^="google_ads_iframe"]', '[id^="div-gpt-ad"]', 'iframe[id^="aswift_"]'];
const BUILTIN_D = { 'youtube.com': ['ytd-ad-slot-renderer', '#masthead-ad', 'ytd-banner-promo-renderer', 'ytd-display-ad-renderer',
  'ytd-in-feed-ad-layout-renderer', '#player-ads', '.ytp-ad-overlay-container', 'ytd-companion-slot-renderer', 'ytd-statement-banner-renderer'] };
let cosmeticP = null;
const loadCosmetic = () => cosmeticP ||= fetch(api.runtime.getURL('rules/cosmetic.json')).then(r => r.json()).catch(() => { cosmeticP = null; return { ga: [], gi: {}, ap: {}, d: {}, x: {} }; });

async function cosmeticFor(host, top) {
  const cfg = await getCfg();
  if (!cfg.enabled || !cfg.cosmetic || hostMatch(host, cfg.whitelist)) return { sel: [] };
  const c = await loadCosmetic();
  const parts = host.split('.'), sel = [], skip = new Set();
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join('.');
    (c.x[d] || []).forEach(s => skip.add(s));
    sel.push(...(c.d[d] || []), ...(BUILTIN_D[d] || []));
  }
  if (top) sel.push(...BUILTIN_G, ...c.ga);
  return { sel: sel.filter(s => !skip.has(s)), idx: top ? { gi: c.gi, ap: c.ap } : null, skip: [...skip] };
}

// ---------- Statistik dan lencana ----------
let queue = Promise.resolve();
const bump = () => { queue = queue.then(async () => {
  const { stats = {} } = await api.storage.local.get('stats');
  const day = new Date().toISOString().slice(0, 10);
  const today = stats.today?.day === day ? stats.today : { day, n: 0 };
  today.n++;
  await api.storage.local.set({ stats: { total: (stats.total || 0) + 1, today } });
}).catch(() => {}); };

const getTab = async id => (await sess.get(key(id)))[key(id)] || { count: 0, chain: 0, max: false };

function paintBadge(id, s) {
  const text = s.max ? 'MAX' : s.chain ? String(s.chain) : '';
  quiet(api.action.setBadgeText({ tabId: id, text }));
  quiet(api.action.setBadgeBackgroundColor({ tabId: id, color: s.max ? '#c47f00' : '#2b4bff' }));
}

async function onEvent(m, tabId) {
  const s = await getTab(tabId);
  if (m.kind === 'handled') { s.count++; bump(); }
  s.chain = m.kind === 'idle' ? 0 : m.chain;
  s.max = m.kind === 'idle' ? false : !!m.max;
  await sess.set({ [key(tabId)]: s });
  paintBadge(tabId, s);
}

api.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg?.type === 'adpod:event' && sender.tab) { onEvent(msg, sender.tab.id).then(() => respond({ ok: true })); return true; }
  if (msg?.type === 'adpod:tab') { getTab(msg.tabId).then(respond); return true; }
  if (msg?.type === 'adpod:cosmetic') { cosmeticFor(String(msg.host || ''), !!msg.top).then(respond); return true; }
  if (msg?.type === 'adpod:css' && sender.tab && api.scripting) {   // cadangan bila <style> diblokir CSP
    const css = []; for (let i = 0; i < msg.sels.length; i += 8) css.push(msg.sels.slice(i, i + 8).join(',') + '{display:none!important}');
    quiet(api.scripting.insertCSS({ target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] }, css: css.join('\n'), origin: 'USER' }));
  }
});

api.tabs.onUpdated.addListener((id, info) => {
  if (info.status === 'loading') { quiet(sess.remove(key(id))); quiet(api.action.setBadgeText({ tabId: id, text: '' })); }
});
api.tabs.onRemoved.addListener(id => quiet(sess.remove(key(id))));
api.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.cfg) syncRules(); });
api.runtime.onStartup.addListener(syncRules);
api.runtime.onInstalled.addListener(async ({ reason }) => {
  const { cfg } = await api.storage.local.get('cfg');
  if (!cfg) await api.storage.local.set({ cfg: DEFAULTS });
  await syncRules();
  if (reason === 'install') api.tabs.create({ url: api.runtime.getURL('onboarding/onboarding.html') });
});
syncRules();
