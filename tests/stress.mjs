// Many cracks in a row (manual stepping): every piece and crumb must stay on the table,
// come to rest, and every round must reach the reading state with a fresh fortune.
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://127.0.0.1:5288/';
const rounds = +(process.argv[3] || 20);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
await page.goto(`${base}?manual&seed=${process.argv[4] || 1}`);
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), null, { timeout: 90000 });
const texts = new Set();
let bad = 0;
for (let r = 0; r < rounds; r++) {
  const res = await page.evaluate(() => {
    const F = window.__fc;
    F.advance(1.2);
    const before = F.info();
    const t0 = performance.now();
    F.crack();
    let maxUp = 0, minY = 1, nan = false;
    for (let i = 0; i < 60 * 5; i++) {
      const s = F.advance(1 / 60);
      for (const p of [...s.pieces, ...s.crumbs]) {
        if (!p.every(Number.isFinite)) nan = true;
        minY = Math.min(minY, p[1]); maxUp = Math.max(maxUp, p[1]);
      }
    }
    const ms = performance.now() - t0;
    const after = F.info();
    const far = Math.max(...after.pieces.map((p) => Math.hypot(p[0], p[2])), ...after.crumbs.map((p) => Math.hypot(p[0], p[2])));
    F.another();
    F.advance(1.5);
    return { idleMode: before.mode, whole: before.whole, mode: after.mode, resting: after.resting, minY, maxUp, nan, far, fortune: after.fortune.text, ms: Math.round(ms), pieces: after.pieces, next: F.info().mode };
  });
  texts.add(res.fortune);
  const ok = res.idleMode === 'idle' && res.mode === 'reading' && res.resting && !res.nan && res.minY > -0.002 && res.far < 0.3 && res.next !== 'clearing';
  if (!ok) bad++;
  console.log(`${r} ${ok ? 'ok ' : 'BAD'} idle:${res.idleMode} whole:${JSON.stringify(res.whole)} -> ${res.mode} resting:${res.resting} minY:${res.minY.toFixed(4)} maxY:${res.maxUp.toFixed(3)} far:${res.far.toFixed(3)} sim5s:${res.ms}ms next:${res.next}  "${res.fortune}"`);
}
console.log(`unique fortunes ${texts.size}/${rounds}, bad rounds ${bad}`);
console.log('errors', errs.slice(0, 10));
await browser.close();
