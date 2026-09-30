// Record the crack frame by frame (manual stepping) into renders/video/<name>.mp4
// usage: node tests/video.mjs [url] [WxHxDPR] [seed] [seconds] [fps]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:5288/';
const [W, H, DPR] = (process.argv[3] || '390x844x2').split('x').map(Number);
const seed = process.argv[4] || '5';
const seconds = +(process.argv[5] || 4);
const fps = +(process.argv[6] || 30);
const dir = `renders/video/f_${W}x${H}_${seed}`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const mobile = W < 800;
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: mobile, hasTouch: mobile });
await page.goto(`${base}?manual&seed=${seed}`);
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), null, { timeout: 90000 });
await page.waitForTimeout(1000);
await page.evaluate(() => window.__fc.advance(0.6));
let k = 0;
const grab = async () => page.screenshot({ path: `${dir}/${String(k++).padStart(4, '0')}.png` });
for (let i = 0; i < fps * 0.5; i++) { await page.evaluate((f) => window.__fc.advance(1 / f, f), fps); await grab(); }
await page.evaluate(() => window.__fc.crack());
for (let i = 0; i < fps * seconds; i++) { await page.evaluate((f) => window.__fc.advance(1 / f, f), fps); await grab(); }
await browser.close();
const out = `renders/video/crack_${W}x${H}_${seed}.mp4`;
execSync(`ffmpeg -loglevel error -y -framerate ${fps} -i ${dir}/%04d.png -c:v libx264 -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" ${out}`);
console.log(out, k, 'frames');
