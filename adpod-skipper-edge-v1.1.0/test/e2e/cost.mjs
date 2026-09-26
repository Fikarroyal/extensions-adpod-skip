import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('../../src/rules/cosmetic.json', 'utf8'));
const ga = c.ga;
const cat = {
  has: s => /:has\(/.test(s),
  attrContains: s => /\[[a-z-]+[*^$~|]=/.test(s) && !/:has\(/.test(s),
  attrOther: s => /\[[^\]]+\]/.test(s) && !/\[[a-z-]+[*^$~|]=/.test(s) && !/:has\(/.test(s),
  plain: s => !/\[|:has\(/.test(s)
};
const groups = Object.fromEntries(Object.entries(cat).map(([k, f]) => [k, ga.filter(f)]));
console.log(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])));
const b = await chromium.launch({ executablePath: process.argv[2], args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setContent(`<body><script>const f=document.createDocumentFragment();for(let i=0;i<10000;i++){const d=document.createElement('div');d.className='item c'+(i%50)+' row-'+(i%20);d.id='n'+i;const a=document.createElement('a');a.href='/x'+i;a.textContent='l';d.appendChild(a);f.appendChild(d)}document.body.appendChild(f)</script></body>`);
const measure = async sels => p.evaluate(sels => {
  const st = document.createElement('style'); document.head.appendChild(st);
  for (let i = 0; i < sels.length; i += 64) { try { st.sheet.insertRule(sels.slice(i, i + 64).join(',') + '{display:none!important}', st.sheet.cssRules.length); } catch { for (const s of sels.slice(i, i + 64)) { try { st.sheet.insertRule(s + '{display:none!important}', st.sheet.cssRules.length); } catch {} } } }
  const t = performance.now(); for (let k = 0; k < 10; k++) { document.body.classList.toggle('x' + k); document.body.offsetHeight; }
  const r = (performance.now() - t) / 10; st.remove(); return r.toFixed(1);
}, sels);
console.log('kosong', await measure([]));
for (const [k, v] of Object.entries(groups)) console.log(k, v.length, 'ms/recalc =', await measure(v));
console.log('contoh attrContains:', groups.attrContains.slice(0, 3), '\ncontoh has:', groups.has.slice(0, 2), '\ncontoh plain:', groups.plain.slice(0, 5));
await b.close();
