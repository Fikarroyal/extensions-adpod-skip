#!/usr/bin/env node
// Membangun paket per browser dari satu basis kode: node tools/build.mjs
// (Jalankan `npm run update-filters` lebih dulu bila src/rules belum berisi daftar filter.)
import { cpSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src'), out = join(root, 'dist');
if (!existsSync(join(src, 'rules/base-0.json'))) { console.error('Daftar filter belum ada. Jalankan: npm run update-filters'); process.exit(1); }
const base = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
const scripts = { scripts: ['shared.js', 'background.js'] };
// Ruleset jaringan: base-* lalu extra-*; hanya yang pertama aktif sejak awal (kuota terjamin), sisanya diaktifkan saat runtime.
const files = readdirSync(join(src, 'rules')).filter(f => /^(base|extra)-\d+\.json$/.test(f))
  .sort((a, b) => (a[0] === b[0] ? parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)) : a < b ? -1 : 1));
const resources = files.map((f, i) => ({ id: f.replace('.json', ''), enabled: i === 0, path: `rules/${f}` }));
base.declarative_net_request = { rule_resources: resources };
// Safari membatasi jumlah aturan: hanya ruleset pertama yang totalnya <= 30.000 aturan yang disertakan.
const counts = Object.fromEntries(JSON.parse(readFileSync(join(src, 'rules/meta.json'), 'utf8')).network.map(n => [n.id, n.rules]));
let acc = 0;
const safariIds = resources.filter(r => (acc += counts[r.id]) <= 30000).map(r => r.id);

const targets = {
  chromium: { fn: m => m },   // Chrome dan Edge memakai paket yang sama
  firefox: { fn: m => ({ ...m, background: scripts, browser_specific_settings: {
    gecko: { id: 'adpod-skipper@example.com', strict_min_version: '128.0', data_collection_permissions: { required: ['none'] } },
    gecko_android: { strict_min_version: '128.0' } } }) },
  // Safari membatasi jumlah aturan, jadi hanya bagian pertama (30.000 aturan) yang disertakan.
  safari: { drop: p => /rules[\\/](base|extra)-\d+\.json$/.test(p) && !safariIds.some(id => p.endsWith(id + '.json')), fn: m => ({ ...m, background: { ...scripts, persistent: false },
    declarative_net_request: { rule_resources: m.declarative_net_request.rule_resources.filter(r => safariIds.includes(r.id)) } }) }
};

rmSync(out, { recursive: true, force: true });
for (const [name, t] of Object.entries(targets)) {
  const dir = join(out, name);
  cpSync(src, dir, { recursive: true, filter: p => !/[\\/]manifest\.json$/.test(p) && !(t.drop && t.drop(p)) });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(t.fn(structuredClone(base)), null, 2));
  const zip = `adpod-skipper-${name}-v${base.version}.zip`;
  execSync(`cd "${dir}" && zip -qr "../${zip}" .`);
  console.log(`OK  ${name.padEnd(9)} dist/${zip}`);
}
