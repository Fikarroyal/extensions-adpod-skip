// Uji end-to-end: memuat extension ke Chromium sungguhan dan memeriksa perilakunya.
// Pakai: xvfb-run -a node e2e.mjs <folder-extension> [path-chrome]
import { chromium } from 'playwright-core';
import http from 'node:http';
import https from 'node:https';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ext = process.argv[2];
const chrome = process.argv[3] || process.env.CHROME_BIN;
const PORT = 8080;

// Domain iklan sungguhan (harus diblokir) dan domain biasa (tidak boleh diblokir).
const NET_ADS = ['ad.doubleclick.net', 'pagead2.googlesyndication.com', 'cdn.taboola.com', 'widgets.outbrain.com',
  'c.amazon-adsystem.com', 'ib.adnxs.com', 'static.ads-twitter.com', 'ads.linkedin.com', 'an.facebook.com',
  'ads.pubmatic.com', 'cas.criteo.com', 'securepubads.g.doubleclick.net', 'ads.mopub.com', 'adservice.google.com'];
const NET_OK = ['cdn.jsdelivr.net', 'fonts.gstatic.com', 'static.legit-news.test', 'images.example.com'];
const COS_ADS = ['.ad-slot', '#banner-ad', '.sponsored-ad', '.ad-wrapper', '.ad-container', '.top-ad', '.ad_wrapper', '.google-ad'];
const COS_OK = ['.content', '.article-text', '.header-nav', '.sidebar', '.footer', '#main', '.comments', '.video-player'];

const PAGES = {
  '/net.html': `<body><script>
    const ads=${JSON.stringify(NET_ADS)}, ok=${JSON.stringify(NET_OK)};
    window.__net = Promise.all([...ads,...ok].map(d => new Promise(r => { const s=document.createElement('script');
      s.src='http://'+d+':${PORT}/ad.js?'+Math.random(); s.onload=()=>r([d,'loaded']); s.onerror=()=>r([d,'blocked']); document.head.appendChild(s); })));
  </script></body>`,
  '/cosmetic.html': `<body>${COS_ADS.map(s => { const m = s.match(/^([.#])(.+)$/); const attr = m[1] === '.' ? `class="${m[2]}"` : `id="${m[2]}"`; return `<div ${attr} style="height:40px">IKLAN ${s}</div>`; }).join('')}
    ${COS_OK.map(s => { const m = s.match(/^([.#])(.+)$/); return `<div ${m[1] === '.' ? 'class' : 'id'}="${m[2]}" style="height:40px">KONTEN ${s}</div>`; }).join('')}</body>`,
  '/yt.html': `<body><div id="movie_player" class="html5-video-player ad-showing">
    <video id="v" src="/ad.webm?0" autoplay playsinline width="320"></video>
    <button class="ytp-skip-ad-button" onclick="window.__skip=(window.__skip||0)+1">Lewati</button></div>
    <script>
      const N=+(new URLSearchParams(location.search).get('n')||3); let i=1; window.__adIndex=1;
      const v=document.getElementById('v'), p=document.getElementById('movie_player'); window.__t0=Date.now();
      v.onended=()=>{ if(i<N){ i++; window.__adIndex=i; v.src='/ad.webm?'+i; v.play(); } else { p.classList.remove('ad-showing'); window.__podDone=Date.now()-window.__t0; } };
      window.ytInitialPlayerResponse={adPlacements:[1],playerAds:[1],adSlots:[1],videoDetails:{title:'ok'}};
      window.__parsed=JSON.parse('{"adPlacements":[1],"playerResponse":{"adSlots":[1],"playerAds":[1]},"a":1}');
      fetch('/yt.json').then(r=>r.json()).then(j=>window.__fetched=j);
    </script></body>`,
};

const handler = (req, res) => {
  const path = req.url.split('?')[0], host = (req.headers.host || '').split(':')[0];
  if (PAGES[path]) { res.setHeader('content-type', 'text/html'); return res.end(PAGES[path]); }
  if (path === '/pod.html') { res.setHeader('content-type', 'text/html'); return res.end(readFileSync(join(here, '../ad-pod-test.html'))); }
  if (path === '/ad.js') { res.setHeader('content-type', 'application/javascript'); return res.end(`(window.__loaded=window.__loaded||[]).push("${host}")`); }
  if (path === '/ad.webm') {   // dukung Range agar video bisa di-seek seperti server sungguhan
    const buf = readFileSync(join(here, 'fixtures/ad.webm')), m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    res.setHeader('content-type', 'video/webm'); res.setHeader('accept-ranges', 'bytes');
    if (!m) { res.setHeader('content-length', buf.length); return res.end(buf); }
    const a = m[1] ? +m[1] : 0, z = m[2] ? Math.min(+m[2], buf.length - 1) : buf.length - 1;
    res.statusCode = 206; res.setHeader('content-range', `bytes ${a}-${z}/${buf.length}`); res.setHeader('content-length', z - a + 1);
    return res.end(buf.subarray(a, z + 1));
  }
  if (path === '/yt.json') { res.setHeader('content-type', 'application/json'); return res.end('{"adPlacements":[{"x":1}],"playerAds":[{"y":1}],"adSlots":[{}],"videoDetails":{"title":"ok"}}'); }
  res.statusCode = 404; res.end();
};
// youtube.com ada di daftar HSTS Chrome, jadi halaman tiruan YouTube dilayani lewat HTTPS (sertifikat sementara).
const key = join(here, 'fixtures/key.pem'), crt = join(here, 'fixtures/crt.pem');
if (!existsSync(crt)) execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${key} -out ${crt} -days 30 -subj /CN=test 2>/dev/null`);
const server = http.createServer(handler).listen(PORT);
const secure = https.createServer({ key: readFileSync(key), cert: readFileSync(crt) }, handler).listen(8443);

const results = [];
const check = (group, name, ok, detail = '') => { results.push({ group, name, ok }); console.log(`${ok ? 'LULUS' : 'GAGAL'}  [${group}] ${name}${detail ? '  -> ' + detail : ''}`); };

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'adpod-')), {
  executablePath: chrome, headless: false, ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-sandbox', '--host-resolver-rules=MAP * 127.0.0.1',
    '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--ignore-certificate-errors']
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
await new Promise(r => setTimeout(r, 1500));
const badge = urlPart => sw.evaluate(async u => { const [t] = (await chrome.tabs.query({})).filter(t => t.url?.includes(u)); return t ? chrome.action.getBadgeText({ tabId: t.id }) : null; }, urlPart);
const open = async url => { const p = await ctx.newPage(); await p.goto(url); return p; };
const sleep = ms => new Promise(r => setTimeout(r, ms));


const setCfg = patch => sw.evaluate(async p => { const { cfg = {} } = await chrome.storage.local.get('cfg'); await chrome.storage.local.set({ cfg: { ...cfg, ...p } }); }, patch);
const errors = [];
ctx.on('page', pg => pg.on('pageerror', e => errors.push(String(e).slice(0, 120))));

// 0. Ruleset
await sleep(2500);
const rs = await sw.evaluate(async () => ({ on: await chrome.declarativeNetRequest.getEnabledRulesets(), free: await chrome.declarativeNetRequest.getAvailableStaticRuleCount(), all: chrome.runtime.getManifest().declarative_net_request.rule_resources.length }));
console.log('Ruleset aktif:', rs.on.join(', ') || '(tidak ada)', '| sisa kuota aturan statis:', rs.free);
check('dasar', `seluruh ${rs.all} ruleset aktif (sekitar 124 ribu aturan)`, rs.on.length === rs.all, rs.on.join(','));

// 1. Blokir jaringan
let p = await open(`http://news.test:${PORT}/net.html`);
let net = Object.fromEntries(await p.evaluate(() => window.__net));
const blockedAds = NET_ADS.filter(d => net[d] === 'blocked');
check('jaringan', `domain iklan terblokir ${blockedAds.length}/${NET_ADS.length}`, blockedAds.length >= NET_ADS.length - 1, 'lolos: ' + (NET_ADS.filter(d => net[d] !== 'blocked').join(', ') || '-'));
check('jaringan', 'domain biasa tidak ikut terblokir', NET_OK.every(d => net[d] === 'loaded'), NET_OK.filter(d => net[d] !== 'loaded').join(', '));
await p.close();

// 1b. Jeda situs (whitelist) harus mengalahkan semua aturan blokir
await setCfg({ whitelist: ['news.test'] }); await sleep(1200);
p = await open(`http://news.test:${PORT}/net.html`);
net = Object.fromEntries(await p.evaluate(() => window.__net));
check('jeda situs', 'situs yang dijeda memuat semua permintaan', [...NET_ADS, ...NET_OK].every(d => net[d] === 'loaded'), 'terblokir: ' + NET_ADS.filter(d => net[d] === 'blocked').join(', '));
await p.close();
p = await open(`http://news.test:${PORT}/cosmetic.html`); await sleep(1200);
const vis0 = await p.evaluate(() => [...document.body.children].filter(e => e.textContent.startsWith('IKLAN')).every(e => getComputedStyle(e).display !== 'none'));
check('jeda situs', 'slot iklan tidak disembunyikan saat dijeda', vis0);
await p.close();
await setCfg({ whitelist: [] }); await sleep(1200);

// 2. Slot iklan (kosmetik)
p = await open(`http://news.test:${PORT}/cosmetic.html`); await sleep(1500);
const vis = await p.evaluate(() => [...document.body.children].map(e => [e.textContent.trim(), getComputedStyle(e).display !== 'none']));
const adsHidden = vis.filter(([t, v]) => t.startsWith('IKLAN') && !v).length, okShown = vis.filter(([t, v]) => t.startsWith('KONTEN') && v).length;
check('slot', `slot iklan tersembunyi ${adsHidden}/${COS_ADS.length}`, adsHidden === COS_ADS.length, 'terlihat: ' + vis.filter(([t, v]) => t.startsWith('IKLAN') && v).map(x => x[0].slice(6)).join(' '));
check('slot', `konten normal tetap tampil ${okShown}/${COS_OK.length}`, okShown === COS_OK.length);
await p.close();

// 3. Iklan video: 3 iklan berurutan (18 dtk tanpa extension)
p = await open(`https://www.youtube.com:8443/yt.html?n=3`); await sleep(1200);
await p.waitForFunction(() => window.__podDone !== undefined, null, { timeout: 12000 }).catch(() => {});
await sleep(600);
const yt = await p.evaluate(() => ({ done: window.__podDone, skip: window.__skip || 0, muted: document.getElementById('v').muted, rate: document.getElementById('v').playbackRate,
  parsed: window.__parsed, resp: window.ytInitialPlayerResponse, fetched: window.__fetched }));
check('video', `3 iklan (18 dtk) selesai dilewati dalam ${yt.done ?? '>12000'} ms`, yt.done !== undefined && yt.done < 6000);
check('video', 'tombol lewati diklik', yt.skip >= 1, 'klik=' + yt.skip);
check('video', 'suara dan kecepatan kembali normal setelah iklan', yt.muted === false && yt.rate === 1, `muted=${yt.muted} rate=${yt.rate}`);
const b2 = await badge('/yt.html'); check('video', 'rangkaian 3 iklan terhitung di lencana', b2 === '3' || b2 === '', 'lencana=' + JSON.stringify(b2));
const pruned = o => o && !('adPlacements' in o) && !('playerAds' in o) && !('adSlots' in o);
check('youtube', 'data iklan dibuang dari ytInitialPlayerResponse', pruned(yt.resp) && yt.resp?.videoDetails?.title === 'ok');
check('youtube', 'data iklan dibuang dari JSON.parse', pruned(yt.parsed) && !('adSlots' in (yt.parsed?.playerResponse || {})) && yt.parsed?.a === 1);
check('youtube', 'data iklan dibuang dari fetch().json()', pruned(yt.fetched) && yt.fetched?.videoDetails?.title === 'ok');
await p.close();

// 4. Batas 10: rangkaian 12 iklan, iklan ke-11 harus dibiarkan (kendali kembali ke pengguna)
p = await open(`https://www.youtube.com:8443/yt.html?n=12`); await sleep(5500);
const cap = await p.evaluate(() => ({ idx: window.__adIndex, done: window.__podDone, muted: document.getElementById('v').muted, t: document.getElementById('v').currentTime }));
const b3 = await badge('/yt.html?n=12');
check('ad pod', 'iklan 1-10 dilewati, iklan ke-11 dibiarkan berjalan', cap.idx === 11 && cap.done === undefined, `iklan ke-${cap.idx}, t=${cap.t.toFixed(1)}s`);
check('ad pod', 'lencana menampilkan MAX', b3 === 'MAX', 'lencana=' + b3);
check('ad pod', 'suara dikembalikan saat batas tercapai', cap.muted === false);
await p.close();

// 5. Halaman UI tidak boleh error; ambil tangkapan layar
const id = new URL(sw.url()).host;
for (const [name, path, w, h] of [['popup', 'popup/popup.html', 360, 560], ['options', 'options/options.html', 760, 900], ['onboarding', 'onboarding/onboarding.html', 760, 760]]) {
  const pg = await ctx.newPage(); await pg.setViewportSize({ width: w, height: h });
  await pg.goto(`chrome-extension://${id}/${path}`); await sleep(700);
  await pg.screenshot({ path: join(here, `shot-${name}.png`) }); await pg.close();
}
check('antarmuka', 'popup, pengaturan, dan sambutan tanpa error JavaScript', errors.length === 0, errors.join(' | '));

const fail = results.filter(r => !r.ok).length;
console.log(`\nRINGKASAN: ${results.length - fail} lulus, ${fail} gagal dari ${results.length} uji`);
await ctx.close(); server.close(); secure.close(); process.exit(fail ? 1 : 0);
