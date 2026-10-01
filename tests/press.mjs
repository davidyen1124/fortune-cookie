// Real screenshots of the app for the README, the social preview and the icons.
// usage: node tests/press.mjs [url] [seed]      (start `npx vite --port 5288` first)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:5288/';
const seed = process.argv[3] || '5';
const tmp = 'renders/press';
fs.mkdirSync(tmp, { recursive: true });
fs.mkdirSync('docs', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function open(W, H, DPR, chrome = false) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await page.goto(`${base}?manual&seed=${seed}`);
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  if (!chrome) await page.addStyleTag({ content: '#hint, #actions, #credit, #btnSound { display: none !important; }' });
  await page.evaluate(() => window.__fc.advance(0.4));
  return page;
}
const step = (page, s) => page.evaluate((s) => window.__fc.advance(s), s);
const jpg = (src, dst, vf = 'null', q = 3) => execSync(`ffmpeg -loglevel error -y -i ${src} -vf "${vf}" -q:v ${q} ${dst}`);

// README: the four moments, 3:2
{
  const page = await open(1200, 800, 2);
  await page.screenshot({ path: `${tmp}/idle.png` });
  await page.evaluate(() => window.__fc.crack());
  await step(page, 0.3); await page.screenshot({ path: `${tmp}/crack.png` });
  await step(page, 3.2); await page.screenshot({ path: `${tmp}/fortune.png` });
  await page.evaluate(() => window.__fc.flip());
  await step(page, 1.0); await page.screenshot({ path: `${tmp}/back.png` });
  for (const n of ['idle', 'crack', 'fortune', 'back']) jpg(`${tmp}/${n}.png`, `docs/${n}.jpg`, 'scale=1200:-2');
  console.log('fortune:', (await page.evaluate(() => window.__fc.info().fortune.text)));
  await page.close();
}
// social preview, 1280x640: the fortune over the broken cookie
{
  const page = await open(1280, 640, 2);
  await page.evaluate(() => window.__fc.crack());
  await step(page, 3.6); await page.screenshot({ path: `${tmp}/social.png` });
  jpg(`${tmp}/social.png`, 'public/social-preview.jpg', 'scale=1280:640', 3);
  await page.close();
}
// icons: the whole cookie, square
{
  const page = await open(640, 640, 2);
  await page.screenshot({ path: `${tmp}/icon.png` });
  execSync(`ffmpeg -loglevel error -y -i ${tmp}/icon.png -vf "crop=640:640:230:340,scale=180:180:flags=lanczos" public/apple-touch-icon.png`);
  execSync(`ffmpeg -loglevel error -y -i ${tmp}/icon.png -vf "crop=600:600:250:360,scale=64:64:flags=lanczos" public/favicon.png`);
  await page.close();
}
// README: the crack as a short loop
{
  const page = await open(720, 540, 1);
  const dir = `${tmp}/gif`;
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let k = 0;
  const grab = () => page.screenshot({ path: `${dir}/${String(k++).padStart(4, '0')}.png` });
  for (let i = 0; i < 10; i++) { await step(page, 1 / 20); await grab(); }
  await page.evaluate(() => window.__fc.crack());
  for (let i = 0; i < 20 * 3.4; i++) { await step(page, 1 / 20); await grab(); }
  for (let i = 0; i < 24; i++) await grab();
  execSync(`ffmpeg -loglevel error -y -framerate 20 -i ${dir}/%04d.png -vf "fps=14,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" docs/crack.gif`);
  await page.close();
}
await browser.close();
for (const f of ['docs/idle.jpg', 'docs/crack.jpg', 'docs/fortune.jpg', 'docs/back.jpg', 'docs/crack.gif', 'public/social-preview.jpg', 'public/apple-touch-icon.png', 'public/favicon.png']) console.log(f, (fs.statSync(f).size / 1024).toFixed(0) + ' KB');
