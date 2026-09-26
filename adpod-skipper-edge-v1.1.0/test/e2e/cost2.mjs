import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('../../src/rules/cosmetic.json', 'utf8'));
const b = await chromium.launch({ executablePath: process.argv[2], args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setContent(`<body><script>const f=document.createDocumentFragment();for(let i=0;i<10000;i++){const d=document.createElement('div');d.className='item c'+(i%50)+' row-'+(i%20);d.id='n'+i;const a=document.createElement('a');a.href='/x'+i;a.textContent='l';d.appendChild(a);f.appendChild(d)}document.body.appendChild(f)</script></body>`);
const res = await p.evaluate(sels => {
  const out = [];
  for (const s of sels) {
    const st = document.createElement('style'); document.head.appendChild(st);
    try { st.sheet.insertRule(s + '{display:none!important}', 0); } catch { st.remove(); continue; }
    const t = performance.now(); for (let k = 0; k < 4; k++) { document.body.classList.toggle('x' + k); document.body.offsetHeight; }
    out.push([(performance.now() - t) / 4, s]); st.remove();
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, 8).map(([t, s]) => t.toFixed(1) + 'ms  ' + s.slice(0, 90));
}, c.ga);
console.log(res.join('\n'));
await b.close();
