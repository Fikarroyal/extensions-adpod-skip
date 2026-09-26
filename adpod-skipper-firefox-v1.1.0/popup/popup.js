(() => {
  const { api, getCfg, setCfg, hostMatch } = AdPod;
  const $ = id => document.getElementById(id);
  const nf = new Intl.NumberFormat('id-ID');
  let tab = null, host = '';

  async function render() {
    const cfg = await getCfg();
    const { stats = {} } = await api.storage.local.get('stats');
    const s = (tab && await api.runtime.sendMessage({ type: 'adpod:tab', tabId: tab.id })) || { count: 0, chain: 0, max: false };
    const day = new Date().toISOString().slice(0, 10);
    let blocked = '-';
    try { if (tab) blocked = nf.format((await api.declarativeNetRequest.getMatchedRules({ tabId: tab.id })).rulesMatchedInfo.length); } catch {}
    const isPaused = host && hostMatch(host, cfg.whitelist);

    $('on').checked = cfg.enabled;
    $('pause').checked = !!isPaused; $('pause').disabled = !host;
    $('host').textContent = host || 'Halaman ini tidak didukung';
    $('cap').textContent = cfg.maxChain;
    $('chain').textContent = s.chain;
    $('hero').classList.toggle('max', s.max);
    $('segs').replaceChildren(...Array.from({ length: cfg.maxChain }, (_, i) => {
      const c = document.createElement('i'); if (i < s.chain) c.className = 'on'; return c;
    }));
    $('s-page').textContent = blocked;
    $('s-today').textContent = nf.format(stats.today?.day === day ? stats.today.n : 0);
    $('s-total').textContent = nf.format(stats.total || 0);
    $('sub').textContent = !cfg.enabled ? 'Dinonaktifkan' : isPaused ? 'Dijeda di situs ini' : 'Aktif di tab ini';
    $('state').textContent = !cfg.enabled ? 'Nyalakan kembali untuk menangani iklan.'
      : s.max ? `Batas ${cfg.maxChain} iklan tercapai. Kendali dikembalikan kepadamu.`
      : s.chain ? 'Sedang menangani iklan berurutan.'
      : 'Siaga. Belum ada iklan video berurutan di halaman ini.';
  }

  async function checkPermission() {
    try { $('perm').hidden = await api.permissions.contains({ origins: ['<all_urls>'] }); } catch {}
  }

  $('on').onchange = e => setCfg({ enabled: e.target.checked }).then(render);
  $('pause').onchange = async e => {
    const cfg = await getCfg();
    const list = e.target.checked ? [...new Set([...cfg.whitelist, host])] : cfg.whitelist.filter(d => d !== host);
    await setCfg({ whitelist: list }); render();
  };
  $('grant').onclick = async () => { await api.permissions.request({ origins: ['<all_urls>'] }); checkPermission(); };
  $('opts').onclick = e => { e.preventDefault(); api.runtime.openOptionsPage(); };
  $('guide').onclick = e => { e.preventDefault(); api.tabs.create({ url: api.runtime.getURL('onboarding/onboarding.html') }); };
  $('ver').textContent = 'v' + api.runtime.getManifest().version;

  (async () => {
    [tab] = await api.tabs.query({ active: true, currentWindow: true });
    try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) host = u.hostname.replace(/^www\./, ''); } catch {}
    await checkPermission(); await render();
    setInterval(render, 1000);
  })();
})();
