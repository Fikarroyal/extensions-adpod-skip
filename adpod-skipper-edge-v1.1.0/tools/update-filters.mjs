#!/usr/bin/env node
// Memperbarui daftar filter: node tools/update-filters.mjs
//  - Jaringan : ruleset DNR siap pakai dari paket npm @adguard/dnr-rulesets (AdGuard Base), dipecah <= 30.000 aturan
//  - Kosmetik : aturan "##selector" dari AdGuard Base dan ABPindo (filter Indonesia) dari GitHub
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src/rules');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (/^(base|extra)-\d+\.json$/.test(f)) rmSync(join(out, f));   // buang sisa versi lama

// ---------- 1. Jaringan (declarativeNetRequest) ----------
const tmp = mkdtempSync(join(tmpdir(), 'dnr-'));
execSync('npm pack @adguard/dnr-rulesets --silent', { cwd: tmp, stdio: 'ignore' });
execSync('tar -xzf adguard-dnr-rulesets-*.tgz package/dist/filters/chromium-mv3/declarative/ruleset_2 package/package.json', { cwd: tmp });
const pkg = JSON.parse(readFileSync(join(tmp, 'package/package.json'), 'utf8'));
const all = JSON.parse(readFileSync(join(tmp, 'package/dist/filters/chromium-mv3/declarative/ruleset_2/ruleset_2.json'), 'utf8'));
// redirect/modifyHeaders butuh sumber daya tambahan, jadi dilewati agar tidak merusak situs.
// Aturan "dummy.rule.adguard.com" hanya penampung metadata internal AdGuard (~10 MB), jadi dibuang.
const keep = all.filter(r => ['block', 'allow', 'allowAllRequests'].includes(r.action.type) && r.condition.urlFilter !== 'dummy.rule.adguard.com');
// Urutan: pengecualian dulu, lalu aturan pola (kebanyakan berdampak luas), lalu domain murni.
const pure = r => /^\|\|[a-z0-9.-]+\^$/.test(r.condition.urlFilter || '');
const rank = r => (r.action.type !== 'block' ? 0 : pure(r) ? 2 : 1);
keep.sort((a, b) => rank(a) - rank(b));
// Pecah jadi berkas kecil (maks 10.000 aturan dan ~3 MB) agar mudah divalidasi store dan bisa diaktifkan bertahap sesuai kuota.
const chunkify = rules => {
  const parts = []; let cur = [], bytes = 0;
  for (const r of rules) {
    const b = JSON.stringify(r).length;
    if (cur.length && (cur.length >= 10000 || bytes + b > 3_000_000)) { parts.push(cur); cur = []; bytes = 0; }
    cur.push(r); bytes += b;
  }
  if (cur.length) parts.push(cur);
  return parts;
};
const chunks = chunkify(keep);
chunks.forEach((c, i) => writeFileSync(join(out, `base-${i}.json`), JSON.stringify(c)));

// ---------- 1b. Aturan tambahan: EasyList (ad server), ABPindo (Indonesia), dan jaringan iklan besar ----------
const TYPES = { script: 'script', image: 'image', stylesheet: 'stylesheet', subdocument: 'sub_frame', xmlhttprequest: 'xmlhttprequest',
  media: 'media', font: 'font', ping: 'ping', object: 'object', other: 'other' };
const ALL = Object.values(TYPES);
const CURATED = `||taboola.com^$third-party
||outbrain.com^$third-party
||criteo.com^$third-party
||criteo.net^$third-party
||adservice.google.com^
||adservice.google.co.id^
||an.facebook.com^
||mopub.com^$third-party
||ads.linkedin.com^
||ads.yahoo.com^
||advertising.com^$third-party
||adsrvr.org^$third-party
||amazon-adsystem.com^$third-party
||scorecardresearch.com^$third-party
||zemanta.com^$third-party
||mgid.com^$third-party
||revcontent.com^$third-party
||adroll.com^$third-party
||smaato.net^$third-party
||inmobi.com^$third-party
||unityads.unity3d.com^
||applovin.com^$third-party
||ironsrc.com^$third-party
||vungle.com^$third-party
||adcolony.com^$third-party`;
const toDnr = line => {
  if (!line || /^[!@\[/]/.test(line) || /#[@?$%]?#/.test(line)) return null;
  const i = line.lastIndexOf('$');
  const pat = i > 0 ? line.slice(0, i) : line, opts = i > 0 ? line.slice(i + 1).split(',') : [];
  if (!/^\|\|[a-z0-9._-]+(\^|\/[\w./?=&%~:*-]*\^?)?$/i.test(pat)) return null;
  const cond = { urlFilter: pat }; let types = [];
  for (const o of opts) {
    if (o === 'third-party' || o === '3p') cond.domainType = 'thirdParty';
    else if (TYPES[o]) types.push(TYPES[o]);
    else if (o === 'popup') continue;
    else return null;   // domain=, ~tipe, redirect, csp, dll. tidak dikonversi
  }
  cond.resourceTypes = types.length ? types : ALL;
  return cond;
};
const seen = new Set(keep.map(r => JSON.stringify([r.condition.urlFilter, r.condition.domainType, [...(r.condition.resourceTypes || [])].sort()])));
const EXTRA = { 'EasyList ad servers': 'easylist/easylist_adservers.txt', 'EasyList third-party': 'easylist/easylist_thirdparty.txt' };
const extraRules = []; const extraCounts = {};
const feed = (name, text) => {
  let n = 0;
  for (const raw of text.split('\n')) {
    const c = toDnr(raw.trim());
    if (!c) continue;
    const k = JSON.stringify([c.urlFilter, c.domainType, [...c.resourceTypes].sort()]);
    if (seen.has(k)) continue;
    seen.add(k); n++;
    extraRules.push({ id: 1, priority: 1, action: { type: 'block' }, condition: c });
  }
  extraCounts[name] = n;
};
feed('Jaringan iklan utama', CURATED);
for (const [name, path] of Object.entries(EXTRA)) feed(name, await (await fetch('https://raw.githubusercontent.com/easylist/easylist/master/' + path)).text());
feed('ABPindo (Indonesia)', await (await fetch('https://raw.githubusercontent.com/ABPindo/indonesianadblockrules/master/subscriptions/abpindo.txt')).text());
const extraChunks = chunkify(extraRules).map(c => c.map((r, j) => ({ ...r, id: j + 1 })));
extraChunks.forEach((c, i) => writeFileSync(join(out, `extra-${i}.json`), JSON.stringify(c)));

// ---------- 2. Kosmetik (element hiding) ----------
const LISTS = {
  'AdGuard Base': 'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_2_Base/filter.txt',
  'ABPindo (Indonesia)': 'https://raw.githubusercontent.com/ABPindo/indonesianadblockrules/master/subscriptions/abpindo.txt'
};
const UNSUPPORTED = /:-abp-|:contains\(|:has-text\(|:xpath\(|:matches-|:upward\(|:nth-ancestor\(|:remove\(|:style\(|:if\(|:if-not\(|:others\(|:min-text-length|\[-ext-|[{};]|\+js\(/;
const g = new Set(), gx = new Set(), d = {}, x = {};
const counts = {};
for (const [name, url] of Object.entries(LISTS)) {
  const text = await (await fetch(url)).text();
  let n = 0;
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line || line[0] === '!' || line[0] === '[') continue;
    const isEx = line.includes('#@#'), sep = isEx ? '#@#' : '##';
    const at = line.indexOf(sep);
    if (at < 0 || (!isEx && /#[?$%]/.test(line.slice(at - 0, at + 4)))) continue;
    const doms = line.slice(0, at), sel = line.slice(at + sep.length).trim();
    if (!sel || UNSUPPORTED.test(sel) || sel.startsWith('+')) continue;
    const list = doms ? doms.split(',').map(s => s.trim().toLowerCase()) : [];
    if (list.some(s => !s || s.startsWith('~') || s.includes('*'))) continue;
    if (isEx) { if (!list.length) gx.add(sel); else list.forEach(h => (x[h] ||= []).push(sel)); continue; }
    n++;
    if (!list.length) g.add(sel); else list.forEach(h => (d[h] ||= []).push(sel));
  }
  counts[name] = n;
}
const generic = [...g].filter(s => !gx.has(s)).sort();
for (const k of Object.keys(d)) d[k] = [...new Set(d[k])];
for (const k of Object.keys(x)) x[k] = [...new Set(x[k])];
// Indeks selektor umum menurut token class/id: hanya selektor yang tokennya ada di halaman yang dipasang (seperti uBlock Origin).
const tokenOf = sel => {
  if (sel.includes('\\')) return null;
  const flat = sel.replace(/\[[^\]]*\]/g, '').replace(/\([^()]*\)/g, '').replace(/\([^()]*\)/g, '');
  const m = [...flat.matchAll(/([.#])([A-Za-z_][\w-]*)/g)];
  return m.length ? m[m.length - 1][1] + m[m.length - 1][2] : null;
};
// Selektor atribut href/alt/title/src (~4 ribu) sangat mahal bila dipasang semua, jadi diindeks menurut awalan/akhiran nilainya.
const ATTR = /^[a-z*]*\[(href|alt|title|src)(\^=|\$=|=)"([^"\\]+)"( i)?\]$/i;
const ga = [], gi = {}, ap = {};
for (const s of generic) {
  const t = tokenOf(s), m = t ? null : ATTR.exec(s);
  if (t) (gi[t] ||= []).push(s);
  else if (m) { const n = m[3].toLowerCase(), op = m[2][0], key = op === '^' ? n.slice(0, 8) : op === '$' ? n.slice(-8) : n; (((ap[m[1] + op] ||= {})[key]) ||= []).push([n, s]); }
  // Selektor struktural berbasis [class^=]/[id^=] (target skrip anti-adblock) membuat gaya dihitung ulang berat di halaman besar, dilewati.
  else if (/\[(class|id)[*^$]=/.test(s) && /[>+~]|:not\(/.test(s)) continue;
  else ga.push(s);
}
writeFileSync(join(out, 'cosmetic.json'), JSON.stringify({ ga, gi, ap, d, x }));

const meta = { updated: new Date().toISOString().slice(0, 10), dnrPackage: pkg.version, network: [...chunks.map((c, i) => ({ id: `base-${i}`, rules: c.length })), ...extraChunks.map((c, i) => ({ id: `extra-${i}`, rules: c.length }))], extraSources: extraCounts,
  cosmetic: { generic: generic.length, always: ga.length, domains: Object.keys(d).length, sources: counts } };
writeFileSync(join(out, 'meta.json'), JSON.stringify(meta, null, 1));
console.log('Jaringan:', meta.network.map(c => `${c.id}=${c.rules}`).join(' '), '| dibuang:', all.length - keep.length, '| tambahan:', JSON.stringify(extraCounts));
console.log('Kosmetik: umum', generic.length, '(selalu dipasang:', ga.length + ')', '| domain', Object.keys(d).length, '| sumber', JSON.stringify(counts));
