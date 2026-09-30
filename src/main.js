import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { createBackdrop, ContactShadows, shadowCatcher, LAYER_CAST } from './stage.js';
import { CookieAudio } from './audio.js';
import { drawFortune, LEARN_CHINESE } from './fortunes.js';
import { SLIP, slipTextures, wrinkled, slipGeometry, inCrease, setFiber, slipShadowTexture } from './paper.js';

const params = new URLSearchParams(location.search);
const ASSET = import.meta.env.BASE_URL + 'assets/';
// backdrop colours: white paper sweep, or a coloured one to make the golden cookie pop
const THEMES = {
  paper: { bg: '#f2efea', shade: 0x3a2a1c, contact: 0x2a1a0c, catcher: 0.3, ui: 'light' },
  red: { bg: '#8c1f1c', shade: 0x220403, contact: 0x160202, catcher: 0.42, ui: 'dark' },
  jade: { bg: '#2f5147', shade: 0x06110d, contact: 0x020806, catcher: 0.42, ui: 'dark' },
  ink: { bg: '#1c1a19', shade: 0x000000, contact: 0x000000, catcher: 0.5, ui: 'dark' },
};
let theme = THEMES[localStorage.getItem('fc-bg')] ? localStorage.getItem('fc-bg') : 'paper';
const BG = THEMES[theme].bg;
let Phys; // physics module, loaded as its own chunk (Rapier WASM is most of the JS)
const audio = new CookieAudio();
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ renderer
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
const mobile = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 2 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.setClearColor(BG, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 0.02, 5);
camera.layers.enable(LAYER_CAST);

// ------------------------------------------------------------------ loading
function progress(f, note) {
  $('bar').style.width = `${Math.round(f * 100)}%`;
  if (note) $('loadNote').textContent = note;
}

async function fetchBuf(url, onp) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !total) { const b = await res.arrayBuffer(); onp(1); return b; }
  const reader = res.body.getReader();
  const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length; onp(Math.min(1, got / total));
  }
  const out = new Uint8Array(got); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out.buffer;
}

function loadImage(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
}

async function loadAll() {
  const done = {};
  const weights = { glb: 0.3, color: 0.25, normal: 0.2, orm: 0.12, hdr: 0.05, rest: 0.08 };
  // the crust atlas at 4k where the screen can show it, 2k on phones
  const res = !mobile && Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1) >= 1800 && !params.has('lowres') ? '4k' : '2k';
  const rep = (k) => (v) => {
    done[k] = v * weights[k];
    const f = Object.values(done).reduce((a, b) => a + b, 0);
    progress(f, f < 0.4 ? 'Baking…' : f < 0.8 ? 'Folding…' : 'Tucking in the fortune…');
  };
  const physReady = import('./physics.js').then(async (m) => { await m.initRapier(); Phys = m; });
  const tex = (name, key, srgb) => fetchBuf(ASSET + name, rep(key)).then(async (buf) => {
    const bmp = await createImageBitmap(new Blob([buf], { type: 'image/webp' }), { imageOrientation: 'flipY' });
    const t = new THREE.Texture(bmp);
    t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.needsUpdate = true;
    return t;
  });
  const fontsReady = Promise.all([
    document.fonts.load('700 40px "Roboto Condensed"'),
    document.fonts.load('400 40px "Roboto Condensed"'),
    loadChineseFont(),
  ]).catch(() => {});
  const [meta, glbBuf, color, normal, orm, hdr, crumbTex, fiber] = await Promise.all([
    fetch(ASSET + 'cookie.json').then((r) => r.json()),
    fetchBuf(ASSET + 'cookie.glb', rep('glb')),
    tex(`crust_color_${res}.webp`, 'color', true),
    tex('crust_normal.webp', 'normal', false),
    tex('crust_orm.webp', 'orm', false),
    fetchBuf(ASSET + 'studio.hdr', rep('hdr')),
    tex('crumb.webp', 'rest', true),
    loadImage(ASSET + 'paper_fiber.webp'),
    physReady,
  ]);
  const studio = await fetch(ASSET + 'studio.json').then((r) => r.json());
  await Promise.race([fontsReady, new Promise((r) => setTimeout(r, 4000))]);
  const gltf = await new Promise((res, rej) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(glbBuf, '', res, rej));
  const hdrUrl = URL.createObjectURL(new Blob([hdr]));
  const env = await new HDRLoader().loadAsync(hdrUrl);
  URL.revokeObjectURL(hdrUrl);
  return { meta, gltf, color, normal, orm, env, crumbTex, fiber, studio };
}

/** the few CJK glyphs the Learn Chinese lessons use, as a tiny Google Fonts subset */
async function loadChineseFont() {
  const chars = [...new Set(LEARN_CHINESE.map((e) => e.zh).join(''))].join('');
  const href = `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@500&text=${encodeURIComponent(chars)}&display=swap`;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = href;
  document.head.appendChild(link);
  await new Promise((r) => { link.onload = r; link.onerror = r; });
  await document.fonts.load('500 40px "Noto Sans SC"', chars.slice(0, 4));
}

// ------------------------------------------------------------------ world
let meta, physics, backdrop, contact, catcher, paperShadow, keyLight, crustMat, crumbMat, src = {};
const round = { whole: null, pieces: [], crumbs: [], paper: null, gen: 0 };
const fading = []; // old rounds on their way out
const state = {
  mode: 'loading', // intro | idle | broken | reading | clearing
  time: 0, acc: 0, t: 0,
  seed: params.has('seed') ? +params.get('seed') : null,
  count: 0,
  recent: JSON.parse(localStorage.getItem('fc-recent') || '[]'),
  fortune: null,
  cool: new Map(),
};
let rng = Math.random;

function buildScene(parts) {
  meta = parts.meta;
  backdrop = createBackdrop(BG);
  scene.add(backdrop.mesh);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(parts.env).texture;
  parts.env.dispose(); pmrem.dispose();
  scene.environmentIntensity = 0.026; // the probe is in absolute Cycles units (the lit floor reads ~56)

  const key = new THREE.Vector3(...parts.studio.key).normalize();
  keyLight = new THREE.DirectionalLight(0xfff1e0, 1.25);
  keyLight.position.copy(key).multiplyScalar(0.6);
  keyLight.target.position.set(0, 0, 0);
  keyLight.castShadow = true;
  const sc = keyLight.shadow;
  sc.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sc.camera, { left: -0.16, right: 0.16, top: 0.16, bottom: -0.16, near: 0.2, far: 1.0 });
  sc.radius = 14; sc.blurSamples = 20; sc.bias = -0.0002;
  scene.add(keyLight, keyLight.target);
  catcher = shadowCatcher(1.2, 0.3);
  scene.add(catcher);
  paperShadow = new THREE.Mesh(new THREE.PlaneGeometry(SLIP.L * 1.12, SLIP.W * 1.5), new THREE.MeshBasicMaterial({ map: slipShadowTexture(), color: 0x2a2018, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  paperShadow.renderOrder = 3;
  scene.add(paperShadow);
  contact = new ContactShadows(renderer, { size: 0.36, res: mobile ? 384 : 512, far: 0.022, blur: 1.1, opacity: 0.85 });
  scene.add(contact.mesh);

  // materials: one crust for every piece (all share the flat-disc UV atlas)
  crustMat = new THREE.MeshPhysicalMaterial({
    map: parts.color, normalMap: parts.normal, normalScale: new THREE.Vector2(0.4, 0.4),
    roughnessMap: parts.orm, aoMap: parts.orm, aoMapIntensity: 0.9, roughness: 1, metalness: 0,
    clearcoat: 0.12, clearcoatRoughness: 0.38, sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffc978'),
  });
  // Baked batter is a little translucent: light scatters through the thin shell and comes
  // out warm, so its shadows never go grey. Approximate the subsurface glow with a warm,
  // wrapped diffuse term plus a bit of the albedo's own colour in the shade.
  crustMat.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        vec3 sss = diffuseColor.rgb * diffuseColor.rgb * vec3(1.0, 0.78, 0.5);
        reflectedLight.indirectDiffuse += sss * 0.22 * (1.0 - material.metalness);
      }`);
  };
  const ct = parts.crumbTex;
  ct.wrapS = THREE.RepeatWrapping; ct.wrapT = THREE.ClampToEdgeWrapping;
  ct.repeat.set(1, 1);
  crumbMat = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.85, metalness: 0, color: 0xf6e7c8 });
  setFiber(parts.fiber);

  // one node per object (a node with two primitives, crust + broken edge, loads as a group).
  // Keep the node itself: meshopt quantisation stores the dequantising scale on it.
  for (const node of parts.gltf.scene.children) src[node.name] = node;

  physics = new Phys.Physics();
  applyTheme(theme);
  resize();
}

function meshFor(name, opts = {}) {
  const g = new THREE.Group();
  const node = src[name].clone();
  node.traverse((m) => {
    if (!m.isMesh) return;
    m.material = /crumb/i.test(m.material?.name || '') ? crumbMat : crustMat;
    m.castShadow = true;
    m.receiveShadow = false;
    m.layers.enable(LAYER_CAST);
  });
  g.add(node);
  if (opts.scale) g.scale.setScalar(opts.scale);
  scene.add(g);
  return g;
}

function track(mesh, rec) {
  const s = Phys.Physics.state(rec);
  const o = { mesh, rec, prev: { p: new THREE.Vector3(), q: new THREE.Quaternion() }, cur: { p: new THREE.Vector3(s.p.x, s.p.y, s.p.z), q: new THREE.Quaternion(s.q.x, s.q.y, s.q.z, s.q.w) } };
  o.prev.p.copy(o.cur.p); o.prev.q.copy(o.cur.q);
  mesh.position.copy(o.cur.p); mesh.quaternion.copy(o.cur.q);
  return o;
}

function bodies() {
  const out = [];
  if (round.whole) out.push(round.whole);
  out.push(...round.pieces, ...round.crumbs);
  for (const f of fading) out.push(...f.items);
  return out;
}

// ------------------------------------------------------------------ camera
const cam = { target: new THREE.Vector3(0, 0.016, 0), dist: 0.4, az: 0.26, el: 0.47, cur: null, vel: null, spread: 0.068 };
function framing() {
  const a = camera.aspect;
  const vf = THREE.MathUtils.degToRad(camera.fov);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * a);
  const spread = cam.spread;
  const fw = a < 1 ? 0.72 : 0.5, fh = a < 1 ? 0.3 : 0.56;
  const dw = spread / fw / (2 * Math.tan(hf / 2));
  const dh = (spread * 0.75) / fh / (2 * Math.tan(vf / 2));
  return Math.max(dw, dh);
}

function aimCamera(dt, time) {
  const want = { dist: framing(), tx: cam.target.x, ty: cam.target.y, tz: cam.target.z };
  if (!cam.cur) cam.cur = { ...want };
  const k = 1 - Math.exp(-dt * 2.2);
  for (const key of Object.keys(want)) cam.cur[key] += (want[key] - cam.cur[key]) * k;
  const drift = state.mode === 'idle' ? 1 : 0.4;
  const az = cam.az + drift * 0.035 * Math.sin(time * 0.21);
  const el = cam.el + drift * 0.015 * Math.sin(time * 0.17 + 1.3);
  const d = cam.cur.dist;
  // portrait: look a little lower so the slip has room above the cookie
  const lift = (camera.aspect < 1 ? 0.03 : 0.024) * (d / 0.4);
  const t = new THREE.Vector3(cam.cur.tx, cam.cur.ty + (state.mode === 'reading' || state.mode === 'broken' ? lift : 0), cam.cur.tz);
  camera.position.set(t.x + d * Math.sin(az) * Math.cos(el), t.y + d * Math.sin(el), t.z + d * Math.cos(az) * Math.cos(el));
  camera.lookAt(t);
}

// ------------------------------------------------------------------ cookie life cycle
function restPose() {
  // standing on its rim, slit toward the camera, a little random yaw
  const yaw = cam.az + (rng() - 0.5) * 0.7;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.08, yaw, (rng() - 0.5) * 0.08, 'YXZ'));
  return q;
}

function newCookie(drop = 0.05) {
  state.count++;
  if (state.seed != null) rng = Phys.mulberry32(state.seed + state.count * 7919);
  const q = restPose();
  // lowest point of the cookie in this orientation -> height of the centre of mass
  let minY = Infinity;
  const v = new THREE.Vector3();
  for (const h of meta.whole.hulls) for (const p of h) { v.set(p[0], p[1], p[2]).applyQuaternion(q); minY = Math.min(minY, v.y); }
  const pos = new THREE.Vector3((rng() - 0.5) * 0.006, -minY + drop, (rng() - 0.5) * 0.006);
  const rec = physics.add(meta.whole, { p: pos, q }, { group: Phys.GROUP.WHOLE, ang: { x: 0, y: (rng() - 0.5) * 0.6, z: 0 } });
  const mesh = meshFor('Cookie');
  round.whole = track(mesh, rec);
  round.pieces = []; round.crumbs = []; round.paper = null;
  round.gen++;
  // the next fortune is decided now; the slip is already folded inside
  state.fortune = drawFortune(rng, state.recent);
  round.paper = makePaper(state.fortune);
  state.mode = 'intro';
  state.t = 0;
  cam.target.set(pos.x, 0.016, pos.z);
  ui('intro');
}

function crack() {
  if (state.mode !== 'idle' && state.mode !== 'intro') return;
  if (!round.whole) return;
  audio.start().then(() => audio.crack(1));
  const whole = round.whole;
  const s = Phys.Physics.state(whole.rec);
  const p0 = new THREE.Vector3(s.p.x, s.p.y, s.p.z);
  const q0 = new THREE.Quaternion(s.q.x, s.q.y, s.q.z, s.q.w);
  const v0 = new THREE.Vector3(s.v.x, s.v.y, s.v.z);
  const V = meta.variants[Math.floor(rng() * meta.variants.length)];
  const wc = new THREE.Vector3(...meta.whole.com);
  // the ridge top (M): the snap hinges there
  const mid = meta.crease.p[Math.floor(meta.crease.p.length / 2)];
  const pivot = new THREE.Vector3(...mid).applyQuaternion(q0).add(p0);
  const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(q0); // front-to-back through the ridge
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q0);
  const up = new THREE.Vector3(0, 1, 0);
  const open = 7 + rng() * 6; // rad/s
  const pop = 0.28 + rng() * 0.22; // m/s
  physics.remove(whole.rec);
  scene.remove(whole.mesh);
  round.whole = null;
  round.pieces = V.pieces.map((P, i) => {
    const sgn = i === 0 ? -1 : 1;
    const d = new THREE.Vector3(...P.com).sub(wc).applyQuaternion(q0);
    const pos = p0.clone().add(d);
    const w = axis.clone().multiplyScalar(sgn * open)
      .add(new THREE.Vector3((rng() - 0.5) * 6, (rng() - 0.5) * 4, (rng() - 0.5) * 6));
    const lin = new THREE.Vector3().crossVectors(w, pos.clone().sub(pivot))
      .addScaledVector(up, pop).addScaledVector(side, sgn * (0.05 + rng() * 0.08)).add(v0)
      .add(new THREE.Vector3((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06));
    const g = i === 0 ? Phys.GROUP.PIECE_A : Phys.GROUP.PIECE_B;
    const rec = physics.add(P, { p: pos, q: q0.clone() }, { lin, ang: w, group: g, filter: Phys.GROUP.FLOOR | Phys.GROUP.CRUMB });
    rec.kind = 'shell';
    return track(meshFor(P.name), rec);
  });
  state.unlockAt = 0.12;
  // crumbs from along the break
  const n = mobile ? 12 : 18;
  for (let i = 0; i < n; i++) {
    const b = V.brk[Math.floor(rng() * V.brk.length)];
    const c = meta.crumbs[Math.floor(rng() * meta.crumbs.length)];
    const scale = 0.55 + rng() * 0.8;
    const pos = new THREE.Vector3(...b).applyQuaternion(q0).add(p0).addScaledVector(side, (rng() - 0.5) * 0.003);
    const lin = side.clone().multiplyScalar((rng() < 0.5 ? -1 : 1) * (0.1 + rng() * 0.35))
      .addScaledVector(up, 0.15 + rng() * 0.6).add(new THREE.Vector3((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3));
    const ang = { x: (rng() - 0.5) * 80, y: (rng() - 0.5) * 80, z: (rng() - 0.5) * 80 };
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 6.28, rng() * 6.28, rng() * 6.28));
    const rec = physics.add({ hull: c.hull, mass: c.mass }, { p: pos, q }, { lin, ang, scale, group: Phys.GROUP.CRUMB, filter: Phys.GROUP.FLOOR | Phys.GROUP.PIECE_A | Phys.GROUP.PIECE_B, restitution: 0.35, kind: 'crumb' });
    rec.kind = 'crumb';
    round.crumbs.push(track(meshFor(c.name, { scale }), rec));
  }
  // the slip rides out with one half
  const holder = round.pieces[rng() < 0.5 ? 0 : 1];
  releasePaper(round.paper, p0, q0, holder);
  state.mode = 'broken';
  state.t = 0;
  ui('broken');
}

function another() {
  if (state.mode !== 'reading' && state.mode !== 'broken') return;
  audio.start();
  const items = [...round.pieces, ...round.crumbs];
  const paper = round.paper;
  fading.push({ items, paper, t: 0 });
  paperShadow.visible = false;
  round.pieces = []; round.crumbs = []; round.paper = null;
  // this fortune has been read
  state.recent.push(state.fortune.text);
  state.recent = state.recent.slice(-60);
  try { localStorage.setItem('fc-recent', JSON.stringify(state.recent)); } catch { /* private mode */ }
  state.mode = 'clearing';
  state.t = 0;
  ui('clearing');
}

// ------------------------------------------------------------------ the slip
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

function makePaper(f) {
  const tex = slipTextures(f, rng, renderer);
  const geo = slipGeometry();
  const flat = wrinkled(rng);
  // folded along the crease inside the cookie (cookie frame, relative to its centre of mass)
  const bent = inCrease(meta.crease, flat, 0.0025 + rng() * 0.002);
  // local frame of the folded slip: centre, along its length, across it
  const N = bent.length / 3, nx = 97, ny = 29;
  const at = (i, j) => new THREE.Vector3(bent[(j * nx + i) * 3], bent[(j * nx + i) * 3 + 1], bent[(j * nx + i) * 3 + 2]);
  const c = at(48, 14);
  const X = at(52, 14).sub(at(44, 14)).normalize();
  const Y = at(48, 20).sub(at(48, 8));
  Y.addScaledVector(X, -Y.dot(X)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  const R0 = new THREE.Matrix4().makeBasis(X, Y, Z);
  const R0i = R0.clone().invert();
  const bentLocal = new Float32Array(bent.length);
  for (let k = 0; k < N; k++) {
    _v.set(bent[k * 3], bent[k * 3 + 1], bent[k * 3 + 2]).sub(c).applyMatrix4(R0i);
    bentLocal[k * 3] = _v.x; bentLocal[k * 3 + 1] = _v.y; bentLocal[k * 3 + 2] = _v.z;
  }
  const frontMat = new THREE.MeshStandardMaterial({ map: tex.front, roughness: 0.88, metalness: 0, side: THREE.FrontSide });
  const backMat = new THREE.MeshStandardMaterial({ map: tex.back, roughness: 0.88, metalness: 0, side: THREE.BackSide });
  const group = new THREE.Group();
  for (const m of [frontMat, backMat]) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    mesh.layers.enable(LAYER_CAST);
    group.add(mesh);
  }
  group.visible = false;
  scene.add(group);
  $('fortuneText').textContent = '';
  return {
    group, geo, flat, bentLocal, frame0: { c, q: new THREE.Quaternion().setFromRotationMatrix(R0) }, tex, frontMat, backMat,
    shape: -1, flip: 0, flipTo: 0, t: 0, holder: null, rel: null, released: false,
    tilt: (rng() - 0.5) * 0.12, swayPh: rng() * 6.28,
  };
}

function setShape(P, e) {
  if (Math.abs(e - P.shape) < 1e-4) return;
  P.shape = e;
  const pos = P.geo.attributes.position.array;
  const a = P.bentLocal, b = P.flat;
  for (let i = 0; i < pos.length; i++) pos[i] = a[i] + (b[i] - a[i]) * e;
  P.geo.attributes.position.needsUpdate = true;
  P.geo.computeVertexNormals();
  P.geo.computeBoundingSphere();
}

/** the slip's pose while it is still inside the whole cookie (follows the cookie) */
function paperInCookie(P, whole) {
  const g = P.group;
  g.visible = true;
  const s = whole.mesh;
  g.position.copy(P.frame0.c).applyQuaternion(s.quaternion).add(s.position);
  g.quaternion.copy(s.quaternion).multiply(P.frame0.q);
  setShape(P, 0);
}

function releasePaper(P, p0, q0, holder) {
  // slip frame in the world at the moment of the snap, then relative to the holding half
  const pos = P.frame0.c.clone().applyQuaternion(q0).add(p0);
  const q = q0.clone().multiply(P.frame0.q);
  const hp = holder.cur.p, hq = holder.cur.q;
  const hqi = hq.clone().invert();
  P.rel = { p: pos.clone().sub(hp).applyQuaternion(hqi), q: hqi.clone().multiply(q) };
  P.holder = holder;
  P.released = true;
  P.t = 0;
  P.fromP = null;
}

function readingPose() {
  // in front of the camera: as wide as the screen allows, a little above centre
  const vf = THREE.MathUtils.degToRad(camera.fov);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const fw = camera.aspect < 1 ? 0.92 : Math.min(0.46, 0.9 / camera.aspect);
  let d = SLIP.L / fw / (2 * Math.tan(hf / 2));
  d = Math.max(d, (SLIP.W / 0.4) / (2 * Math.tan(vf / 2)));
  const yN = camera.aspect < 1 ? 0.3 : 0.34; // NDC height of its centre
  const p = new THREE.Vector3(0, yN * d * Math.tan(vf / 2), -d).applyQuaternion(camera.quaternion).add(camera.position);
  return { p, q: camera.quaternion.clone(), d };
}

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const easeOut = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));

function updatePaper(P, dt, time) {
  if (!P) return;
  if (!P.released) {
    if (round.whole && round.paper === P) paperInCookie(P, round.whole);
    return;
  }
  P.t += dt;
  const t = P.t;
  const hm = P.holder.mesh;
  const att = { p: P.rel.p.clone().applyQuaternion(hm.quaternion).add(hm.position), q: hm.quaternion.clone().multiply(P.rel.q) };
  const T0 = 0.22, T1 = 1.45;
  const e = ease((t - T0) / (T1 - T0));
  setShape(P, easeOut((t - T0 - 0.05) / 0.9));
  const rp = readingPose();
  // gentle float once it is up
  const sway = Math.min(1, Math.max(0, (t - T1) / 1.2));
  const qSway = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    0.05 * Math.sin(time * 0.9 + P.swayPh) * sway - 0.12,
    0.07 * Math.sin(time * 0.7 + P.swayPh * 1.3) * sway,
    P.tilt + 0.02 * Math.sin(time * 0.8) * sway));
  // flip (turn over about the vertical axis)
  P.flip += (P.flipTo - P.flip) * (1 - Math.exp(-dt * 7));
  const qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), P.flip);
  const qRead = rp.q.clone().multiply(qSway).multiply(qFlip);
  const pRead = rp.p.clone().add(new THREE.Vector3(0, 0.0015 * Math.sin(time * 1.1 + P.swayPh) * sway, 0).applyQuaternion(camera.quaternion));
  // arc: rise above the pieces first, then come forward to the reader
  const ctrl = att.p.clone().lerp(pRead, 0.35);
  ctrl.y = Math.max(att.p.y, pRead.y) + 0.05;
  const u = e;
  const pos = new THREE.Vector3()
    .addScaledVector(att.p, (1 - u) * (1 - u))
    .addScaledVector(ctrl, 2 * u * (1 - u))
    .addScaledVector(pRead, u * u);
  P.group.position.copy(pos);
  P.group.quaternion.copy(att.q).slerp(qRead, ease((t - T0) / ((T1 - T0) * 0.62)));
  // a soft shadow behind the floating slip keeps white paper readable on a white sweep
  const sh = ease((t - T1 + 0.5) / 0.8) * (1 - Math.min(1, Math.abs(Math.sin(P.flip)) * 1.6));
  paperShadow.material.opacity = sh * (THEMES[theme].ui === 'dark' ? 0.34 : 0.16);
  paperShadow.visible = sh > 0.001;
  const fwd = _v2.set(0, 0, -1).applyQuaternion(camera.quaternion);
  paperShadow.position.copy(P.group.position).addScaledVector(fwd, 0.012)
    .add(new THREE.Vector3(0.0022, -0.0032, 0).applyQuaternion(camera.quaternion));
  paperShadow.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), P.tilt));
  P.group.visible = true;
  if (!P.rustled && t > T0) { P.rustled = true; audio.rustle(0.7, 1); }
  if (t > T1 && state.mode === 'broken') {
    state.mode = 'reading';
    ui('reading');
  }
}

// ------------------------------------------------------------------ simulation
const STEP_MAX = 24;
function stepSim(dt) {
  state.acc += dt;
  let n = 0;
  const all = bodies();
  while (state.acc >= Phys.STEP && n < STEP_MAX) {
    for (const b of all) { b.prev.p.copy(b.cur.p); b.prev.q.copy(b.cur.q); }
    physics.step();
    for (const b of all) {
      const s = b.rec.body;
      const p = s.translation(), q = s.rotation();
      b.cur.p.set(p.x, p.y, p.z); b.cur.q.set(q.x, q.y, q.z, q.w);
    }
    state.acc -= Phys.STEP;
    n++;
  }
  if (n === STEP_MAX) state.acc = 0;
  const alpha = state.acc / Phys.STEP;
  for (const b of all) {
    b.mesh.position.lerpVectors(b.prev.p, b.cur.p, alpha);
    b.mesh.quaternion.slerpQuaternions(b.prev.q, b.cur.q, alpha);
  }
  sounds(dt);
}

function sounds(dt) {
  const hits = physics.drainHits();
  if (!hits.length) return;
  const agg = new Map();
  for (const h of hits) agg.set(h.rec, (agg.get(h.rec) || 0) + h.J);
  for (const [rec, J] of agg) {
    const c = state.cool.get(rec) || 0;
    const m = rec.mass;
    const dv = J / m; // velocity change from the contact impulse
    const support = 9.81 * dt * 1.2;
    if (dv < support + (rec.kind === 'crumb' ? 0.15 : 0.08)) continue;
    if (c > state.time) continue;
    state.cool.set(rec, state.time + (rec.kind === 'crumb' ? 0.06 : 0.035));
    const p = rec.body.translation();
    const pan = THREE.MathUtils.clamp(_v.set(p.x, p.y, p.z).project(camera).x, -1, 1) * 0.6;
    audio.knock(J, pan, rec.kind);
  }
}

function advance(dt) {
  state.time += dt;
  state.t += dt;
  if (Phys && physics) stepSim(dt);
  if (state.mode === 'broken' && state.unlockAt != null && state.t > state.unlockAt) {
    state.unlockAt = null;
    const [a, b] = round.pieces;
    if (a && b) {
      physics.setFilter(a.rec, Phys.GROUP.PIECE_A, Phys.GROUP.FLOOR | Phys.GROUP.CRUMB | Phys.GROUP.PIECE_B);
      physics.setFilter(b.rec, Phys.GROUP.PIECE_B, Phys.GROUP.FLOOR | Phys.GROUP.CRUMB | Phys.GROUP.PIECE_A);
    }
  }
  if (state.mode === 'clearing' && state.t > 0.38) newCookie(0.06);
  if (state.mode === 'intro' && round.whole && state.t > 0.5 && Phys.Physics.resting(round.whole.rec, 0.02, 0.2)) {
    state.mode = 'idle';
    ui('idle');
  }
  // keep both halves in frame: centre on them across the view and size the shot to their spread
  if (round.pieces.length) {
    const right = _v.set(Math.cos(cam.az), 0, -Math.sin(cam.az));
    let lo = Infinity, hi = -Infinity;
    const c = new THREE.Vector3();
    for (const p of round.pieces) {
      const x = p.mesh.position.dot(right);
      lo = Math.min(lo, x); hi = Math.max(hi, x);
      c.add(p.mesh.position);
    }
    c.multiplyScalar(1 / round.pieces.length);
    const mid = (lo + hi) / 2;
    c.addScaledVector(right, mid - c.dot(right));
    const k = Math.min(1, dt * 2.5);
    cam.target.x += (c.x - cam.target.x) * k;
    cam.target.z += (c.z - cam.target.z) * k;
    cam.spread += (Math.max(0.11, hi - lo + 0.075) - cam.spread) * k;
  } else if (state.mode === 'idle' || state.mode === 'intro') {
    cam.spread += (0.068 - cam.spread) * Math.min(1, dt * 2);
  }
  updatePaper(round.paper, dt, state.time);
  // old rounds fade out
  for (let i = fading.length - 1; i >= 0; i--) {
    const f = fading[i];
    f.t += dt;
    const k = Math.min(1, f.t / 0.35);
    if (f.paper) {
      const P = f.paper;
      P.group.position.addScaledVector(_v2.set(0, 1, 0), dt * (0.1 + f.t * 0.6));
      P.group.rotateZ(dt * 1.5);
      P.frontMat.transparent = P.backMat.transparent = true;
      P.frontMat.opacity = P.backMat.opacity = 1 - k;
    }
    for (const it of f.items) setOpacity(it.mesh, 1 - k);
    if (k >= 1) {
      for (const it of f.items) { physics.remove(it.rec); scene.remove(it.mesh); disposeFade(it.mesh); }
      if (f.paper) disposePaper(f.paper);
      fading.splice(i, 1);
    }
  }
  aimCamera(dt, state.time);
  catcher.userData.center.set(cam.target.x, cam.target.z);
  backdrop.uniforms.time.value = state.time;
}

function setOpacity(g, o) {
  g.traverse((m) => {
    if (!m.isMesh) return;
    if (!m.userData.fade) { m.material = m.material.clone(); m.material.transparent = true; m.userData.fade = true; }
    m.material.opacity = o;
    m.castShadow = o > 0.5;
  });
}
function disposeFade(g) { g.traverse((m) => { if (m.isMesh && m.userData.fade) m.material.dispose(); }); }
function disposePaper(P) {
  scene.remove(P.group);
  P.geo.dispose(); P.tex.front.dispose(); P.tex.back.dispose(); P.frontMat.dispose(); P.backMat.dispose();
}

function render() {
  contact.update(scene);
  renderer.render(scene, camera);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
  if (window.__fc?.manual) return;
  try { advance(dt); render(); } catch (err) { console.error(err); }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 1 ? 30 : 24;
  camera.updateProjectionMatrix();
  if (backdrop) backdrop.uniforms.aspect.value = w / h;
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ backdrop colour
function applyTheme(name) {
  theme = name;
  const T = THEMES[name];
  backdrop.uniforms.color.value.set(T.bg);
  contact.material.uniforms.color.value.setHex(T.contact);
  catcher.material.color.setHex(T.shade);
  catcher.material.opacity = T.catcher;
  paperShadow.material.color.setHex(T.ui === 'dark' ? 0x000000 : 0x2a2018);
  renderer.setClearColor(T.bg, 1);
  document.documentElement.style.setProperty('--bg', T.bg);
  document.documentElement.dataset.ui = T.ui;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', T.bg);
  for (const b of document.querySelectorAll('#swatches button')) b.setAttribute('aria-pressed', String(b.dataset.bg === name));
  try { localStorage.setItem('fc-bg', name); } catch { /* private mode */ }
}
for (const b of document.querySelectorAll('#swatches button')) b.addEventListener('click', () => applyTheme(b.dataset.bg));

// ------------------------------------------------------------------ ui
function ui(mode) {
  const hint = $('hint'), actions = $('actions');
  if (mode === 'idle' || mode === 'intro') {
    hint.textContent = 'Tap the cookie to crack it';
    hint.classList.toggle('hidden', mode !== 'idle');
    actions.classList.add('hidden');
  } else if (mode === 'broken' || mode === 'clearing') {
    hint.classList.add('hidden');
    actions.classList.add('hidden');
  } else if (mode === 'reading') {
    hint.classList.add('hidden');
    actions.classList.remove('hidden');
    const f = state.fortune;
    $('fortuneText').textContent = `${f.text} Lucky numbers: ${f.numbers.join(', ')}. Learn Chinese: ${f.learn.en}, ${f.learn.zh} (${f.learn.py}).`;
  }
}

function flip() {
  const P = round.paper;
  if (!P || state.mode !== 'reading') return;
  P.flipTo = P.flipTo ? 0 : Math.PI;
  audio.start().then(() => audio.flick());
  $('btnFlip').textContent = P.flipTo ? 'Turn back' : 'Turn over';
}

const ray = new THREE.Raycaster();
function onTap(e) {
  if (e.target.closest && e.target.closest('button')) return;
  if (state.mode === 'idle' || state.mode === 'intro') { crack(); return; }
  if (state.mode === 'reading') {
    // tapping the slip turns it over; tapping elsewhere does nothing (use the buttons)
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
    if (round.paper && ray.intersectObject(round.paper.group, true).length) flip();
  }
}
canvas.addEventListener('pointerup', onTap);
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    if (document.activeElement?.tagName === 'BUTTON') return;
    e.preventDefault();
    if (state.mode === 'idle' || state.mode === 'intro') crack(); else if (state.mode === 'reading') another();
  } else if ((e.key === 'f' || e.key === 'F') && state.mode === 'reading') flip();
});
$('btnAgain').addEventListener('click', another);
$('btnFlip').addEventListener('click', flip);
$('btnSound').addEventListener('click', () => {
  const on = !audio.enabled;
  audio.setEnabled(on);
  audio.start();
  $('btnSound').setAttribute('aria-pressed', String(on));
  $('btnSound').setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
  $('icoSound').setAttribute('d', on
    ? 'M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z'
    : 'M4 9v6h4l5 4V5L8 9H4zm12.6 3 2.4-2.4-1.1-1.1-2.4 2.4-2.4-2.4-1.1 1.1 2.4 2.4-2.4 2.4 1.1 1.1 2.4-2.4 2.4 2.4 1.1-1.1z');
});

// ------------------------------------------------------------------ boot
(async () => {
  try {
    const parts = await loadAll();
    buildScene(parts);
    audio.prepare();
    newCookie(0.0);
    // settle the first cookie before anyone sees it
    for (let i = 0; i < 240; i++) advance(1 / 60);
    renderer.compile(scene, camera);
    render();
    $('loading').classList.add('hidden');
    $('brand').classList.remove('hidden');
    $('btnSound').classList.remove('hidden');
    $('swatches').classList.remove('hidden');
    requestAnimationFrame((t) => { last = t; frame(t); });
  } catch (err) {
    console.error(err);
    $('loadNote').textContent = 'Something went wrong. Please reload the page.';
  }
})();

// ------------------------------------------------------------------ test hooks
window.__fc = {
  manual: params.has('manual'),
  advance(seconds, fps = 60) {
    const n = Math.round(seconds * fps);
    for (let i = 0; i < n; i++) advance(1 / fps);
    render();
    return this.info();
  },
  crack() { crack(); return this.info(); },
  another() { another(); return this.info(); },
  flip() { flip(); },
  info() {
    const pose = (b) => { const p = b.rec.body.translation(); return [p.x, p.y, p.z].map((v) => +v.toFixed(4)); };
    return {
      mode: state.mode,
      count: state.count,
      fortune: state.fortune,
      whole: round.whole ? pose(round.whole) : null,
      pieces: round.pieces.map(pose),
      crumbs: round.crumbs.map(pose),
      resting: round.pieces.length ? round.pieces.every((p) => Phys.Physics.resting(p.rec)) : round.whole ? Phys.Physics.resting(round.whole.rec) : null,
      paper: round.paper ? { t: +round.paper.t.toFixed(2), shape: +round.paper.shape.toFixed(2), visible: round.paper.group.visible } : null,
    };
  },
  get scene() { return scene; },
  get camera() { return camera; },
  get renderer() { return renderer; },
};
