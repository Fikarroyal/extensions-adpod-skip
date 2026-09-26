// Ukur beban: waktu load dan hitung ulang gaya pada halaman berat (10.000 elemen), dengan dan tanpa extension.
import { chromium } from 'playwright-core';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [ext, chrome] = [process.argv[2], process.argv[3]];
const html = `<body><script>const f=document.createDocumentFragment();for(let i=0;i<10000;i++){const d=document.createElement('div');d.className='item c'+(i%50)+' row-'+(i%20);d.id='n'+i;d.textContent='Baris '+i;f.appendChild(d)}document.body.appendChild(f)</script></body>`;
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(html); }).listen(8081);
const run = async withExt => {
  const args = ['--no-sandbox', '--no-first-run', ...(withExt ? [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] : [])];
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'p-')), { executablePath: chrome, headless: false, ignoreDefaultArgs: ['--disable-extensions'], args });
  if (withExt) { if (!ctx.serviceWorkers().length) await ctx.waitForEvent('serviceworker'); await new Promise(r => setTimeout(r, 3000)); }
  const res = [];
  for (let i = 0; i < 5; i++) {
    const p = await ctx.newPage(); const t0 = Date.now();
    await p.goto('http://localhost:8081/?' + i, { waitUntil: 'load' }); const load = Date.now() - t0;
    const recalc = await p.evaluate(() => { const t = performance.now(); for (let k = 0; k < 20; k++) { document.body.classList.toggle('x' + k); document.body.offsetHeight; } return (performance.now() - t) / 20; });
    res.push([load, recalc]); await p.close();
  }
  await ctx.close();
  const med = i => res.map(r => r[i]).sort((a, b) => a - b)[2];
  return { load: med(0), recalc: med(1).toFixed(1) };
};
console.log('tanpa extension :', await run(false));
console.log('dengan extension:', await run(true));
srv.close();
