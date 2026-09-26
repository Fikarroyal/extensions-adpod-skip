(() => {
  const { api, getCfg, setCfg, normHost } = AdPod;
  const $ = id => document.getElementById(id);
  let cfg, tt;
  const toast = () => { $('toast').classList.add('show'); clearTimeout(tt); tt = setTimeout(() => $('toast').classList.remove('show'), 1200); };
  const save = async p => { cfg = await setCfg(p); toast(); };

  function renderList() {
    $('list').replaceChildren(...(cfg.whitelist.length ? cfg.whitelist.map(d => {
      const c = document.createElement('span'); c.className = 'chip'; c.textContent = d;
      const x = document.createElement('button'); x.textContent = '×'; x.setAttribute('aria-label', `Hapus ${d}`);
      x.onclick = async () => { await save({ whitelist: cfg.whitelist.filter(v => v !== d) }); renderList(); };
      c.append(x); return c;
    }) : [Object.assign(document.createElement('span'), { className: 'muted', textContent: 'Belum ada situs yang dikecualikan.' })]));
  }
  async function renderStats() {
    const { stats = {} } = await api.storage.local.get('stats');
    $('stat').textContent = `${(stats.total || 0).toLocaleString('id-ID')} iklan ditangani sejak dipasang.`;
  }

  (async () => {
    cfg = await getCfg();
    ['enabled', 'network', 'cosmetic', 'video'].forEach(k => { $(k).checked = cfg[k]; $(k).onchange = e => save({ [k]: e.target.checked }); });
    $('max').value = cfg.maxChain; $('maxv').textContent = cfg.maxChain;
    $('max').oninput = e => { $('maxv').textContent = e.target.value; };
    $('max').onchange = e => save({ maxChain: Math.min(10, Math.max(1, +e.target.value)) });
    $('addf').onsubmit = async e => {
      e.preventDefault();
      const d = normHost($('site').value);
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) { $('site').setCustomValidity('Masukkan nama situs yang valid'); $('site').reportValidity(); return; }
      $('site').setCustomValidity(''); $('site').value = '';
      await save({ whitelist: [...new Set([...cfg.whitelist, d])] }); renderList();
    };
    $('reset').onclick = async () => { await api.storage.local.remove('stats'); renderStats(); toast(); };
    renderList(); renderStats();
    try {
      const meta = await (await fetch(api.runtime.getURL('rules/meta.json'))).json();
      const ids = api.runtime.getManifest().declarative_net_request.rule_resources.map(r => r.id);
      const n = meta.network.filter(c => ids.includes(c.id)).reduce((a, c) => a + c.rules, 0);
      $('filters').textContent = `${n.toLocaleString('id-ID')} aturan jaringan (AdGuard Base, EasyList, ABPindo) dan ${meta.cosmetic.generic.toLocaleString('id-ID')} selektor umum ditambah aturan khusus untuk ${meta.cosmetic.domains.toLocaleString('id-ID')} situs. Diperbarui ${meta.updated}.`;
    } catch { $('filters').textContent = 'Informasi daftar filter tidak tersedia.'; }
  })();
})();
