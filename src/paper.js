import * as THREE from 'three';

// A US restaurant fortune slip: 57 x 16 mm, thin white bond, blue ink (Wonton Food style).
// Front: the fortune in a condensed bold sans with the lucky numbers under it.
// Back: the "Learn Chinese" lesson. Each side shows through the other, mirrored.
export const SLIP = { L: 0.057, W: 0.016 };
const INK = '#27479b';
const PAPER = '#f8f7f2';
const PX = 2048, PY = 576; // canvas, 36 px/mm

let fiber = null; // HTMLImageElement of the imagegen paper scan
export function setFiber(img) { fiber = img; }

function paperBase(ctx, rng) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PX, PY);
  if (fiber) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.globalCompositeOperation = 'multiply';
    const s = 1.4, ox = -rng() * 600, oy = -rng() * 600;
    ctx.drawImage(fiber, ox, oy, fiber.width * s, fiber.height * s);
    ctx.drawImage(fiber, ox + fiber.width * s, oy, fiber.width * s, fiber.height * s);
    ctx.restore();
  }
  // faint mottling and a slightly darker, handled edge
  const g = ctx.createLinearGradient(0, 0, 0, PY);
  g.addColorStop(0, 'rgba(120,110,90,0.05)');
  g.addColorStop(0.1, 'rgba(120,110,90,0)');
  g.addColorStop(0.9, 'rgba(120,110,90,0)');
  g.addColorStop(1, 'rgba(120,110,90,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PX, PY);
  // the cut edges catch a hairline of shadow
  ctx.strokeStyle = 'rgba(90,78,64,0.28)';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, PX, PY);
}

/** soft rectangular shadow for the floating slip */
export function slipShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.filter = 'blur(10px)';
  g.fillStyle = '#000';
  g.fillRect(28, 26, 200, 44);
  if (g.filter !== 'blur(10px)') {
    // no canvas filters (older Safari): fake the blur with stacked translucent rects
    g.clearRect(0, 0, 256, 96);
    for (let i = 0; i < 14; i++) { g.globalAlpha = 0.09; g.fillRect(14 + i * 1.5, 12 + i * 1.5, 228 - i * 3, 72 - i * 3); }
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** balance the lines of a wrapped paragraph (shorter first line, like the real slips) */
function balanced(ctx, text, maxW) {
  let lines = wrap(ctx, text, maxW);
  if (lines.length < 2) return lines;
  let lo = maxW * 0.45, hi = maxW;
  for (let i = 0; i < 14; i++) {
    const m = (lo + hi) / 2;
    if (wrap(ctx, text, m).length > lines.length) lo = m; else hi = m;
  }
  return wrap(ctx, text, hi);
}

function inked(ctx, draw) {
  // printed ink: a hair of spread, not quite solid
  ctx.save();
  ctx.fillStyle = INK;
  ctx.filter = 'blur(0.7px)';
  ctx.globalAlpha = 0.93;
  draw();
  ctx.restore();
}

function drawFront(ctx, f, rng) {
  paperBase(ctx, rng);
  // the little blue register tab on the leading edge
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, 0, 150 + rng() * 40, 70 + rng() * 10);
  ctx.globalAlpha = 1;
  let size = 128;
  let lines;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (;;) {
    ctx.font = `700 ${size}px "Roboto Condensed", "Arial Narrow", sans-serif`;
    lines = balanced(ctx, f.text, PX * 0.84);
    if (lines.length <= 2 || size <= 96) break;
    size -= 8;
  }
  const numSize = 74;
  const lh = size * 1.02;
  const block = lines.length * lh + numSize * 1.25;
  let y = (PY - block) / 2 + size * 0.8 + 6;
  const dx = (rng() - 0.5) * 40; // slips are never cut quite centred
  inked(ctx, () => {
    ctx.font = `700 ${size}px "Roboto Condensed", "Arial Narrow", sans-serif`;
    for (const l of lines) { ctx.fillText(l, PX / 2 + dx, y); y += lh; }
    ctx.font = `400 ${numSize}px "Roboto Condensed", "Arial Narrow", sans-serif`;
    ctx.fillText(`Lucky Numbers ${f.numbers.join(', ')}`, PX / 2 + dx, y + numSize * 0.28);
  });
  return lines;
}

function drawBack(ctx, f, rng) {
  paperBase(ctx, rng);
  ctx.save();
  // drawn mirrored: the back is seen through the plane from behind
  ctx.translate(PX, 0);
  ctx.scale(-1, 1);
  ctx.textAlign = 'center';
  const dx = (rng() - 0.5) * 40;
  inked(ctx, () => {
    ctx.font = `700 78px "Roboto Condensed", "Arial Narrow", sans-serif`;
    ctx.fillText(`LEARN CHINESE  –  ${f.learn.en}`, PX / 2 + dx, PY * 0.4);
    const zh = [...f.learn.zh], py = f.learn.py.split(' ');
    const parts = zh.map((c, i) => [c, `(${py[i] || ''})`]);
    // measure the mixed run: character, then pinyin in the Latin face
    const cjk = `500 120px "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
    const lat = `400 88px "Roboto Condensed", "Arial Narrow", sans-serif`;
    let w = 0;
    const gap = 26;
    for (const [c, p] of parts) {
      ctx.font = cjk; w += ctx.measureText(c).width + 10;
      ctx.font = lat; w += ctx.measureText(p).width + gap;
    }
    w -= gap;
    let x = PX / 2 + dx - w / 2;
    const y = PY * 0.74;
    ctx.textAlign = 'left';
    for (const [c, p] of parts) {
      ctx.font = cjk; ctx.fillText(c, x, y); x += ctx.measureText(c).width + 10;
      ctx.font = lat; ctx.fillText(p, x, y - 4); x += ctx.measureText(p).width + gap;
    }
  });
  ctx.restore();
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = PX; c.height = PY;
  return c;
}

/** both sides, each with the other printed faintly through it */
export function slipTextures(f, rng, renderer) {
  const front = canvas(), back = canvas();
  const fc = front.getContext('2d'), bc = back.getContext('2d');
  const lines = drawFront(fc, f, rng);
  drawBack(bc, f, rng);
  // show-through (thin paper): the other side's ink, as it sits in the sheet
  const inkOnly = (src, dst) => {
    // ink as dark-on-white: |side - paper| lifts the ink, then invert (no canvas filters,
    // which older Safari ignores)
    const t = canvas(), tc = t.getContext('2d');
    tc.drawImage(src, 0, 0);
    tc.globalCompositeOperation = 'difference';
    tc.fillStyle = PAPER; tc.fillRect(0, 0, PX, PY);
    tc.fillStyle = '#ffffff'; tc.fillRect(0, 0, PX, PY);
    dst.save();
    dst.globalAlpha = 0.14;
    dst.globalCompositeOperation = 'multiply';
    dst.filter = 'blur(2.5px)';
    dst.drawImage(t, 0, 0);
    dst.restore();
  };
  const f2 = canvas(); f2.getContext('2d').drawImage(front, 0, 0);
  inkOnly(back, fc);
  inkOnly(f2, bc);
  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  return { front: tex(front), back: tex(back), lines };
}

// ---------------------------------------------------------------------- geometry
const NX = 96, NY = 28;

/** flat slip with creases from being crammed in the cookie: faceted folds + a curl */
export function wrinkled(rng) {
  const { L, W } = SLIP;
  // folds right across the slip from being crammed into the crease (faceted: two nearly flat
  // panels meeting at a rounded crease), plus short crinkles that die out along their length
  const folds = [];
  const nf = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < nf; i++) {
    const a = Math.PI / 2 + (rng() - 0.5) * 0.9;
    folds.push({ cx: (rng() - 0.5) * L * 0.85, cy: (rng() - 0.5) * W * 0.5, a, k: (rng() < 0.5 ? -1 : 1) * (0.04 + rng() * 0.06), e: 0.0003 + rng() * 0.0004, len: 1 });
  }
  const nc = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < nc; i++) {
    folds.push({ cx: (rng() - 0.5) * L * 0.95, cy: (rng() - 0.5) * W, a: rng() * Math.PI, k: (rng() < 0.5 ? -1 : 1) * (0.03 + rng() * 0.05), e: 0.00015 + rng() * 0.0002, len: 0.003 + rng() * 0.007 });
  }
  for (const f of folds) { f.nx = Math.cos(f.a + Math.PI / 2); f.ny = Math.sin(f.a + Math.PI / 2); f.tx = Math.cos(f.a); f.ty = Math.sin(f.a); }
  const curl = (rng() - 0.3) * 0.0026;
  const cross = (rng() - 0.5) * 0.0012;
  const twist = (rng() - 0.5) * 0.05;
  const waves = [0, 1, 2].map(() => ({ kx: (1 + rng() * 3) * Math.PI / L, ky: (rng() * 2) * Math.PI / W, ph: rng() * 6.28, a: 0.0001 + rng() * 0.0002 }));
  const pos = new Float32Array((NX + 1) * (NY + 1) * 3);
  let k = 0;
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i <= NX; i++) {
      const x = (i / NX - 0.5) * L, y = (0.5 - j / NY) * W; // same vertex order as PlaneGeometry
      let z = curl * (2 * x / L) ** 2 + cross * (2 * y / W) ** 2 + twist * x * y / W;
      for (const f of folds) {
        const dx = x - f.cx, dy = y - f.cy;
        const d = dx * f.nx + dy * f.ny;
        const t = dx * f.tx + dy * f.ty;
        const env = f.len >= 1 ? 1 : Math.exp(-((t / f.len) ** 2));
        z += env * f.k * (Math.sqrt(d * d + f.e * f.e) - f.e);
      }
      for (const w of waves) z += w.a * Math.sin(w.kx * x + w.ky * y + w.ph);
      pos[k++] = x; pos[k++] = y; pos[k++] = z;
    }
  }
  // remove the mean plane so the slip faces the viewer square on
  let sz = 0, sx = 0, sy = 0, xx = 0, yy = 0;
  for (let i = 0; i < pos.length; i += 3) { sz += pos[i + 2]; sx += pos[i] * pos[i + 2]; sy += pos[i + 1] * pos[i + 2]; xx += pos[i] ** 2; yy += pos[i + 1] ** 2; }
  const n = pos.length / 3;
  const mz = sz / n, bx = sx / xx, by = sy / yy;
  for (let i = 0; i < pos.length; i += 3) pos[i + 2] -= mz + bx * pos[i] + by * pos[i + 1];
  return pos;
}

export function slipGeometry() {
  const g = new THREE.PlaneGeometry(SLIP.L, SLIP.W, NX, NY);
  return g;
}

/**
 * The slip as it lies folded in the crease: centred on M, running along the crease and
 * reaching into the pocket, halfway between the two layers of batter.
 * crease: { u, s, pocket[u][s] } from cookie.json (cookie frame). Returns positions in
 * the cookie frame.
 */
export function inCrease(crease, flat, peek = 0) {
  const { u, s, pocket } = crease;
  const { W } = SLIP;
  const out = new Float32Array(flat.length);
  const nu = u.length, ns = s.length;
  const find = (arr, n, x) => {
    let i = 0;
    while (i < n - 2 && arr[i + 1] < x) i++;
    // linear extrapolation past the ends (the slip may poke out of the slit)
    return [i, (x - arr[i]) / (arr[i + 1] - arr[i])];
  };
  for (let v = 0; v < flat.length; v += 3) {
    // along the slip -> along the crease (mirrored so the print reads from the slit);
    // across the slip -> from the fold into the pocket
    const x = -flat[v];
    // near the top of the slit, where the lips gape, the slip edge shows through the gap
    const y = 0.0006 + (flat[v + 1] + W / 2) * 0.96 - peek * Math.exp(-((x / 0.009) ** 2));
    const [i, a] = find(u, nu, x);
    const [j, b] = find(s, ns, y);
    for (let k = 0; k < 3; k++) {
      const p00 = pocket[i][j][k], p10 = pocket[i + 1][j][k], p01 = pocket[i][j + 1][k], p11 = pocket[i + 1][j + 1][k];
      out[v + k] = (p00 * (1 - a) + p10 * a) * (1 - b) + (p01 * (1 - a) + p11 * a) * b;
    }
  }
  return out;
}
