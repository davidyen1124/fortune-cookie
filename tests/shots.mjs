// Step the app by hand (?manual) and screenshot each stage of a crack at a few viewports.
// usage: node tests/shots.mjs [url] [WxHxDPR,...] [seed]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://127.0.0.1:5288/';
const sizes = (process.argv[3] || '390x844x3,1440x900x2').split(',').map((s) => s.split('x').map(Number));
const seed = process.argv[4] || '7';
const out = 'renders/shots';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [W, H, DPR] of sizes) {
  const mobile = W < 800;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  const t0 = Date.now();
  await page.goto(`${base}?manual&seed=${seed}`);
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), null, { timeout: 90000 });
  console.log(`${W}x${H}: loaded in ${Date.now() - t0} ms`);
  const shot = async (name) => { await page.screenshot({ path: `${out}/${W}x${H}_${name}.png` }); };
  const step = (s) => page.evaluate((s) => window.__fc.advance(s), s);
  await page.waitForTimeout(1000);
  let info = await step(0.5);
  console.log('idle', JSON.stringify(info.whole), info.mode);
  await shot('0_idle');
  await page.evaluate(() => window.__fc.crack());
  info = await step(1 / 30); await shot('1_snap');
  info = await step(0.12); await shot('2_split');
  info = await step(0.35); await shot('3_paper');
  info = await step(0.6); await shot('4_rise');
  info = await step(2.5); await shot('5_read');
  console.log('read', info.mode, 'pieces', JSON.stringify(info.pieces), 'resting', info.resting, 'fortune', info.fortune?.text);
  await page.evaluate(() => window.__fc.flip());
  info = await step(1.0); await shot('6_back');
  console.log('errors', errs.slice(0, 8));
  await ctx.close();
}
await browser.close();
