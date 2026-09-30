// Real-time (rAF) check with real taps: load, tap the cookie, wait for the fortune, turn it
// over, ask for another; log frame times and any console errors.
// usage: node tests/realtime.mjs [url] [WxHxDPR] [rounds] [chromium|webkit]
import { chromium, webkit } from 'playwright';
const base = process.argv[2] || 'http://127.0.0.1:5288/';
const [W, H, DPR] = (process.argv[3] || '390x844x3').split('x').map(Number);
const rounds = +(process.argv[4] || 3);
const engine = process.argv[5] === 'webkit' ? webkit : chromium;
const mobile = W < 800;
const browser = await engine.launch(engine === chromium ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } : {});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: mobile && engine === chromium, hasTouch: mobile });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
const t0 = Date.now();
await page.goto(base);
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), null, { timeout: 120000 });
console.log(`${engine.name()} ${W}x${H}@${DPR}: ready in ${Date.now() - t0} ms`);
await page.evaluate(() => { window.__ft = []; let l = performance.now(); const f = (t) => { window.__ft.push(t - l); l = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const tap = async (x, y) => (mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
const seen = [];
for (let r = 0; r < rounds; r++) {
  await page.waitForFunction(() => window.__fc.info().mode === 'idle', null, { timeout: 15000 });
  await page.evaluate(() => { window.__ft.length = 0; });
  await tap(W / 2, H * 0.5);
  await page.waitForFunction(() => window.__fc.info().mode === 'reading', null, { timeout: 15000 });
  const text = await page.textContent('#fortuneText');
  seen.push(text.split(' Lucky')[0]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `renders/shots/rt_${engine.name()}_${W}x${H}_${r}.png` });
  await page.click('#btnFlip');
  await page.waitForTimeout(900);
  if (r === 0) await page.screenshot({ path: `renders/shots/rt_${engine.name()}_${W}x${H}_back.png` });
  const ft = await page.evaluate(() => { const a = window.__ft.slice(2).sort((x, y) => x - y); return { n: a.length, med: a[a.length >> 1], p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1] }; });
  console.log(`round ${r}: "${seen[r]}"  frames ${ft.n} median ${ft.med?.toFixed(1)}ms p95 ${ft.p95?.toFixed(1)}ms max ${ft.max?.toFixed(1)}ms`);
  await page.click('#btnAgain');
}
console.log('unique', new Set(seen).size, '/', seen.length);
console.log('errors', errs.slice(0, 10));
await browser.close();
