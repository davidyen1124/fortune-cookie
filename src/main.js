import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { createBackdrop, ContactShadows, shadowCatcher, FocusBlur, LAYER_CAST } from './stage.js';

const LAYER_SLIP = 2; // drawn after the depth-of-field pass, so it stays sharp
import { CookieAudio } from './audio.js';
import { drawFortune, LEARN_CHINESE } from './fortunes.js';
import { SLIP, slipTextures, wrinkled, slipGeometry, setFiber, slipShadowTexture } from './paper.js';

const params = new URLSearchParams(location.search);
const ASSET = import.meta.env.BASE_URL + 'assets/';
const BG = '#f2efea';
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
renderer.shadowMap.autoUpdate = false; // see render()
renderer.setClearColor(BG, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 0.02, 5);
camera.layers.enable(LAYER_CAST);
camera.layers.enable(LAYER_SLIP);
const focus = { blur: null, amount: 0 };

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
  const weights = { glb: 0.55, color: 0.25, hdr: 0.1, rest: 0.1 };
  const rep = (k) => (v) => {
    done[k] = v * weights[k];
    const f = Object.values(done).reduce((a, b) => a + b, 0);
    progress(f, f < 0.4 ? 'Baking…' : f < 0.8 ? 'Folding…' : 'Tucking in the fortune…');
  };
  const physReady = import('./physics.js').then(async (m) => { await m.initRapier(); Phys = m; });
  const tex = (name, key, srgb, flip = true) => fetchBuf(ASSET + name, rep(key)).then(async (buf) => {
    const bmp = await createImageBitmap(new Blob([buf], { type: 'image/webp' }), flip ? { imageOrientation: 'flipY' } : {});
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
  const [meta, glbBuf, color, hdr, crumbTex, fiber] = await Promise.all([
    fetch(ASSET + 'cookie.json').then((r) => r.json()),
    fetchBuf(ASSET + 'cookie.glb', rep('glb')),
    tex('crust_color.webp', 'color', true, false), // glTF texture coordinates: no flip
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
  return { meta, gltf, color, env, crumbTex, fiber, studio };
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
let meta, physics, backdrop, contact, catcher, paperShadow, keyLight, crustMat, innerMat, crumbMat, FADE, src = {};
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
  sc.radius = 14; sc.blurSamples = 12; sc.bias = -0.0002;
  keyLight.layers.enable(LAYER_SLIP);
  scene.add(keyLight, keyLight.target);
  focus.blur = new FocusBlur(renderer);
  catcher = shadowCatcher(1.2, 0.3, 0x3a2a1c, [0.14, 0.3]);
  scene.add(catcher);
  paperShadow = new THREE.Mesh(new THREE.PlaneGeometry(SLIP.L * 1.12, SLIP.W * 1.5), new THREE.MeshBasicMaterial({ map: slipShadowTexture(), color: 0x2a2018, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  paperShadow.renderOrder = 3;
  scene.add(paperShadow);
  contact = new ContactShadows(renderer, { size: 0.36, res: mobile ? 384 : 512, far: 0.022, blur: 1.1, opacity: 0.85 });
  scene.add(contact.mesh);

  // materials. The crust is the scan's own photo texture (a real cookie, photographed all
  // round); the inside of a broken half is the same batter, paler and more matte.
  crustMat = new THREE.MeshPhysicalMaterial({
    map: parts.color, roughness: 0.62, metalness: 0, side: THREE.DoubleSide,
    clearcoat: 0.08, clearcoatRoughness: 0.45, sheen: 0.2, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffc978'),
  });
  // Baked batter is a little translucent: light scatters through the thin shell and comes
  // out warm, so its shadows never go grey.
  const glow = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        vec3 sss = diffuseColor.rgb * diffuseColor.rgb * vec3(1.0, 0.78, 0.5);
        reflectedLight.indirectDiffuse += sss * 0.1;
      }`);
  };
  crustMat.onBeforeCompile = glow;
  innerMat = new THREE.MeshStandardMaterial({ map: parts.color, color: new THREE.Color(1.18, 1.1, 0.92), roughness: 0.82, metalness: 0 });
  innerMat.onBeforeCompile = glow;
  const ct = parts.crumbTex;
  ct.wrapS = THREE.RepeatWrapping; ct.wrapT = THREE.ClampToEdgeWrapping;
  ct.repeat.set(1, 1);
  crumbMat = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.85, metalness: 0, color: 0xf6e7c8 });
  setFiber(parts.fiber);
  // see-through twins for clearing the table (compiled up front, shared by every fade)
  FADE = new Map([crustMat, innerMat, crumbMat].map((m) => {
    const f = m.clone(); f.transparent = true; f.onBeforeCompile = m.onBeforeCompile;
    return [m, f];
  }));

  // one node per object (a node with two primitives, crust + broken edge, loads as a group).
  // Keep the node itself: meshopt quantisation stores the dequantising scale on it.
  for (const node of parts.gltf.scene.children) src[node.name] = node;

  physics = new Phys.Physics();
  resize();
}

function meshFor(name, opts = {}) {
  const g = new THREE.Group();
  const node = src[name].clone();
  node.traverse((m) => {
    if (!m.isMesh) return;
    const name = m.material?.name || '';
    m.material = /crumb/i.test(name) ? crumbMat : /inner/i.test(name) ? innerMat : crustMat;
    m.userData.solid = m.material;
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
// A fixed three-quarter view, like the reference product shots: looking down at the cookie
// from the front (the tips and the notch face the lens). It only eases back a little when
// the cookie is opened, to make room for the halves and the slip.
const cam = { target: new THREE.Vector3(0, 0.012, 0), az: 0.5, el: 0.66, spread: 0.074, cur: null };
function framing() {
  const a = camera.aspect;
  const vf = THREE.MathUtils.degToRad(camera.fov);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * a);
  const fw = a < 1 ? 0.78 : 0.5, fh = a < 1 ? 0.3 : 0.5;
  const dw = cam.spread / fw / (2 * Math.tan(hf / 2));
  const dh = (cam.spread * 0.7) / fh / (2 * Math.tan(vf / 2));
  return Math.max(dw, dh);
}

function aimCamera(dt) {
  const open = state.mode === 'broken' || state.mode === 'reading';
  cam.spread += ((open ? (camera.aspect < 1 ? 0.124 : 0.112) : 0.074) - cam.spread) * (1 - Math.exp(-dt * 1.6));
  const want = { dist: framing(), lift: open ? (camera.aspect < 1 ? 0.03 : 0.022) : 0 };
  if (!cam.cur) cam.cur = { ...want };
  const k = 1 - Math.exp(-dt * 1.6);
  for (const key of Object.keys(want)) cam.cur[key] += (want[key] - cam.cur[key]) * k;
  const d = cam.cur.dist;
  // once it is open, look a little higher so the slip has room above the halves
  const t = _v.set(cam.target.x, cam.target.y + cam.cur.lift * (d / 0.4), cam.target.z);
  camera.position.set(t.x + d * Math.sin(cam.az) * Math.cos(cam.el), t.y + d * Math.sin(cam.el), t.z + d * Math.cos(cam.az) * Math.cos(cam.el));
  camera.lookAt(t);
}

// ------------------------------------------------------------------ cookie life cycle
function newCookie(drop = 0.006, fadeIn = true) {
  state.count++;
  if (state.seed != null) rng = Phys.mulberry32(state.seed + state.count * 7919);
  // turned so the lens sees its smooth side and the notch; the chipped stretch of rim faces away
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, cam.az - 1.05 + (rng() - 0.5) * 0.3, 0, 'YXZ'));
  let minY = Infinity;
  const v = new THREE.Vector3();
  for (const h of meta.whole.hulls) for (const p of h) { v.set(p[0], p[1], p[2]).applyQuaternion(q); minY = Math.min(minY, v.y); }
  const pos = new THREE.Vector3(0, -minY + drop, 0);
  const rec = physics.add(meta.whole, { p: pos, q }, { group: Phys.GROUP.WHOLE });
  const mesh = meshFor('Cookie');
  round.whole = track(mesh, rec);
  round.pieces = []; round.crumbs = []; round.paper = null;
  round.gen++;
  round.fadeIn = fadeIn ? 0 : 1;
  if (fadeIn) setOpacity(mesh, 0);
  // the fortune is decided now; the slip is already tucked inside
  state.fortune = drawFortune(rng, state.recent);
  round.paper = makePaper(state.fortune);
  state.mode = 'intro';
  state.t = 0;
  ui('intro');
}

function crack() {
  if (state.mode !== 'idle') return;
  if (!round.whole) return;
  audio.start().then(() => audio.crack(1));
  const whole = round.whole;
  const s = Phys.Physics.state(whole.rec);
  const p0 = new THREE.Vector3(s.p.x, s.p.y, s.p.z);
  const q0 = new THREE.Quaternion(s.q.x, s.q.y, s.q.z, s.q.w);
  const V = meta.variants[Math.floor(rng() * meta.variants.length)];
  const wc = new THREE.Vector3(...meta.whole.com);
  // A fortune cookie snaps across the notch: the two arms are levered apart and the crack
  // runs from the apex of the notch to the back rim. So the halves hinge open about the back
  // of the cookie, part by a few centimetres on the table and rock to rest. No leap.
  const hinge = new THREE.Vector3(...meta.hinge.back).applyQuaternion(q0).add(p0);
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(q0); // out of the fold plane
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q0);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q0);
  const up = new THREE.Vector3(0, 1, 0);
  const open = 2.5 + rng() * 1.3; // rad/s
  physics.remove(whole.rec);
  scene.remove(whole.mesh);
  round.whole = null;
  round.pieces = V.pieces.map((P, i) => {
    const sgn = i === 0 ? -1 : 1; // piece 0 is the left arm
    const d = new THREE.Vector3(...P.com).sub(wc).applyQuaternion(q0);
    const pos = p0.clone().add(d);
    const w = normal.clone().multiplyScalar(sgn * open)
      .addScaledVector(fwd, sgn * (0.6 + rng() * 1.2))                 // a little roll outward
      .add(new THREE.Vector3((rng() - 0.5), (rng() - 0.5), (rng() - 0.5)).multiplyScalar(0.8));
    const lin = new THREE.Vector3().crossVectors(w, pos.clone().sub(hinge))
      .addScaledVector(side, sgn * (0.05 + rng() * 0.05))
      .addScaledVector(up, 0.1 + rng() * 0.06);
    const g = i === 0 ? Phys.GROUP.PIECE_A : Phys.GROUP.PIECE_B;
    const rec = physics.add(P, { p: pos, q: q0.clone() }, { lin, ang: w, group: g, filter: Phys.GROUP.FLOOR | Phys.GROUP.CRUMB });
    return track(meshFor(P.name), rec);
  });
  state.unlockAt = 0.1;
  // crumbs spill from the break and drop where it happened
  const n = mobile ? 14 : 20;
  for (let i = 0; i < n; i++) {
    const b = V.brk[Math.floor(rng() * V.brk.length)];
    const c = meta.crumbs[Math.floor(rng() * meta.crumbs.length)];
    const scale = 0.28 + rng() * rng() * 0.75;
    const pos = new THREE.Vector3(...b).applyQuaternion(q0).add(p0).addScaledVector(side, (rng() - 0.5) * 0.004);
    if (pos.y < 0.0015) pos.y = 0.0015;
    const lin = side.clone().multiplyScalar((rng() - 0.5) * 0.22)
      .addScaledVector(fwd, (rng() - 0.5) * 0.16).addScaledVector(up, rng() * 0.22);
    const ang = { x: (rng() - 0.5) * 40, y: (rng() - 0.5) * 40, z: (rng() - 0.5) * 40 };
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 6.28, rng() * 6.28, rng() * 6.28));
    const rec = physics.add({ hull: c.hull, mass: c.mass }, { p: pos, q }, { lin, ang, scale, group: Phys.GROUP.CRUMB, filter: Phys.GROUP.FLOOR | Phys.GROUP.PIECE_A | Phys.GROUP.PIECE_B, restitution: 0.15, kind: 'crumb' });
    const cm = meshFor(c.name, { scale });
    cm.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    round.crumbs.push(track(cm, rec));
  }
  // the slip stays in the arm it was poking out of
  const P = round.paper;
  releasePaper(P, p0, q0, round.pieces[P.side > 0 ? 1 : 0]);
  state.mode = 'broken';
  state.t = 0;
  ui('broken');
}

function another() {
  if (state.mode !== 'reading') return;
  audio.start();
  const items = [...round.pieces, ...round.crumbs];
  fading.push({ items, paper: round.paper, t: 0 });
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
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
function makePaper(f) {
  const tex = slipTextures(f, rng, renderer);
  const geo = slipGeometry();
  const flat = wrinkled(rng);
  // Inside the cookie the slip lies along the fold: a band standing on edge, wrapped round
  // the apex of the notch with an end in each arm's pocket. Nothing of it shows until the
  // cookie is cracked; then it bridges the two halves, the print facing the lens.
  const rho = 0.011;
  const A = meta.hinge.apex;
  const c = new THREE.Vector3(A[0], A[1], A[2] + 0.001 - rho);
  const bentLocal = new Float32Array(flat.length);
  for (let k = 0; k < flat.length; k += 3) {
    // crumpled a little shorter and narrower than it is, so it stays clear of the shell
    const th = (flat[k] * 0.5) / rho;
    bentLocal[k] = rho * Math.sin(th);
    bentLocal[k + 1] = flat[k + 1] * 0.5;
    bentLocal[k + 2] = rho * (1 - Math.cos(th)) + flat[k + 2] * 0.5;
  }
  const fr = { c };
  const R0 = new THREE.Matrix4(); // the slip's axes are the cookie's: across, up, toward the tips
  const side = rng() < 0.5 ? -1 : 1; // the half it stays in when the cookie snaps
  const outDir = -side; // and it is drawn out toward the gap
  // transparent from the start, so fading it out later doesn't recompile its shader
  const frontMat = new THREE.MeshStandardMaterial({ map: tex.front, roughness: 0.88, metalness: 0, side: THREE.FrontSide, transparent: true });
  const backMat = new THREE.MeshStandardMaterial({ map: tex.back, roughness: 0.88, metalness: 0, side: THREE.BackSide, transparent: true });
  const group = new THREE.Group();
  for (const m of [frontMat, backMat]) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.layers.set(LAYER_SLIP);
    group.add(mesh);
  }
  group.visible = false;
  scene.add(group);
  $('fortuneText').textContent = '';
  return {
    group, geo, flat, bentLocal, frame0: { c: fr.c, q: new THREE.Quaternion().setFromRotationMatrix(R0) }, tex, frontMat, backMat,
    side, outDir, shape: -1, flip: 0, flipTo: 0, t: 0, holder: null, rel: null, released: false,
    tilt: (rng() - 0.5) * 0.07, swayPh: rng() * 6.28,
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

/** while the cookie is whole the slip is inside it, out of sight */
function paperInCookie(P) {
  P.group.visible = false;
  setShape(P, 0);
}

function releasePaper(P, p0, q0, holder) {
  // slip frame in the world at the moment of the snap, then relative to the half that holds it
  const pos = P.frame0.c.clone().applyQuaternion(q0).add(p0);
  const q = q0.clone().multiply(P.frame0.q);
  const hqi = holder.cur.q.clone().invert();
  P.rel = { p: pos.clone().sub(holder.cur.p).applyQuaternion(hqi), q: hqi.clone().multiply(q) };
  P.holder = holder;
  P.released = true;
  P.t = 0;
}

function readingPose() {
  // in front of the lens: as wide as the screen allows, a little above centre
  const vf = THREE.MathUtils.degToRad(camera.fov);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const fw = camera.aspect < 1 ? 0.86 : Math.min(0.44, 0.86 / camera.aspect);
  let d = SLIP.L / fw / (2 * Math.tan(hf / 2));
  d = Math.max(d, (SLIP.W / 0.4) / (2 * Math.tan(vf / 2)));
  const yN = camera.aspect < 1 ? 0.3 : 0.36; // NDC height of its centre
  const p = new THREE.Vector3(0, yN * d * Math.tan(vf / 2), -d).applyQuaternion(camera.quaternion).add(camera.position);
  return { p, q: camera.quaternion.clone(), d };
}

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const easeOut = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));

// the slip, after the snap: it sits in its half for a beat, is drawn out of the pocket the
// way it was pointing, and comes up to the reader, straightening as it leaves the cookie
const T_HOLD = 0.35, T_PULL = 0.55, T_UP = 0.85;
function updatePaper(P, dt, time) {
  if (!P) return;
  if (!P.released) {
    paperInCookie(P);
    return;
  }
  P.t += dt;
  const t = P.t;
  const hm = P.holder.mesh;
  const pull = ease((t - T_HOLD) / T_PULL);
  const up = ease((t - T_HOLD - T_PULL * 0.55) / T_UP);
  // in its half, sliding out along its own length and lifting clear of the shell
  const aq = hm.quaternion.clone().multiply(P.rel.q);
  const ap = P.rel.p.clone().applyQuaternion(hm.quaternion).add(hm.position)
    .add(_v.set(P.outDir * 0.034 * pull, 0, 0).applyQuaternion(aq));
  ap.y += 0.012 * pull;
  setShape(P, ease((t - T_HOLD - 0.1) / (T_PULL + 0.25)));
  const rp = readingPose();
  const settled = Math.min(1, Math.max(0, (t - T_HOLD - T_PULL - T_UP) / 1.5));
  const qSway = _q.setFromEuler(new THREE.Euler(
    0.03 * Math.sin(time * 0.8 + P.swayPh) * settled - 0.1,
    0.04 * Math.sin(time * 0.6 + P.swayPh * 1.3) * settled,
    P.tilt));
  // turning it over: about its long vertical axis, like turning a card in the fingers
  P.flip += (P.flipTo - P.flip) * (1 - Math.exp(-dt * 7));
  const qRead = rp.q.clone().multiply(qSway).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), P.flip));
  const pRead = rp.p.clone().add(_v.set(0, 0.001 * Math.sin(time * 0.9 + P.swayPh) * settled, 0).applyQuaternion(camera.quaternion));
  const pos = ap.clone().lerp(pRead, up);
  pos.y += 0.012 * Math.sin(Math.PI * up); // a slight rise on the way
  P.group.position.copy(pos);
  P.group.quaternion.copy(aq).slerp(qRead, ease((t - T_HOLD - T_PULL * 0.4) / (T_UP * 0.9)));
  P.group.visible = true;
  if (!P.rustled && t > T_HOLD) { P.rustled = true; audio.rustle(0.6, 1); }
  // a soft shadow behind the floating slip keeps white paper readable on a white sweep
  const sh = ease((up - 0.6) / 0.4) * (1 - Math.min(1, Math.abs(Math.sin(P.flip)) * 1.6));
  paperShadow.material.opacity = sh * 0.16;
  paperShadow.visible = sh > 0.001;
  const fwd = _v2.set(0, 0, -1).applyQuaternion(camera.quaternion);
  paperShadow.position.copy(P.group.position).addScaledVector(fwd, 0.012)
    .add(_v.set(0.0022, -0.0032, 0).applyQuaternion(camera.quaternion));
  paperShadow.quaternion.copy(camera.quaternion).multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), P.tilt));
  P.up = up;
  if (up >= 1 && state.mode === 'broken') {
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
  if (state.mode === 'clearing' && state.t > 0.34 && !fading.length) newCookie();
  if (round.whole && round.fadeIn < 1) {
    round.fadeIn = Math.min(1, round.fadeIn + dt / 0.28);
    if (round.fadeIn >= 1) restoreOpaque(round.whole.mesh); else setOpacity(round.whole.mesh, round.fadeIn);
  }
  if (state.mode === 'intro' && round.whole && state.t > 0.35 && round.fadeIn >= 1 && Phys.Physics.resting(round.whole.rec, 0.02, 0.2)) {
    state.mode = 'idle';
    ui('idle');
  }
  // keep the halves centred: ease the aim to the middle of the two, and back for a new cookie
  {
    const want = _v2.set(0, 0, 0);
    if (round.pieces.length === 2) want.copy(round.pieces[0].mesh.position).add(round.pieces[1].mesh.position).multiplyScalar(0.5);
    const k = 1 - Math.exp(-dt * 1.8);
    cam.target.x += (want.x - cam.target.x) * k;
    cam.target.z += (want.z - cam.target.z) * k;
  }
  updatePaper(round.paper, dt, state.time);
  // old rounds fade out
  for (let i = fading.length - 1; i >= 0; i--) {
    const f = fading[i];
    f.t += dt;
    const k = Math.min(1, f.t / 0.3);
    if (f.paper) f.paper.frontMat.opacity = f.paper.backMat.opacity = 1 - k;
    for (const it of f.items) setOpacity(it.mesh, 1 - k);
    if (k >= 1) {
      for (const it of f.items) { physics.remove(it.rec); scene.remove(it.mesh); }
      if (f.paper) disposePaper(f.paper);
      fading.splice(i, 1);
    }
  }
  aimCamera(dt);
  // focus pulls to the slip once it is up in front of the lens
  const FP = round.paper;
  const want = FP && FP.released && state.mode !== 'clearing' ? ease(((FP.up || 0) - 0.5) / 0.5) : 0;
  focus.amount += (want - focus.amount) * (1 - Math.exp(-dt * 7));
  backdrop.uniforms.time.value = state.time;
}

function setOpacity(g, o) {
  g.traverse((m) => {
    if (!m.isMesh) return;
    if (!m.userData.fade) { m.material = FADE.get(m.userData.solid); m.userData.fade = true; }
    m.castShadow = false;
  });
  for (const f of FADE.values()) f.opacity = o;
}
function restoreOpaque(g) {
  g.traverse((m) => {
    if (!m.isMesh || !m.userData.fade) return;
    m.material = m.userData.solid;
    m.userData.fade = false;
    m.castShadow = true;
  });
}
function disposePaper(P) {
  scene.remove(P.group);
  P.geo.dispose(); P.tex.front.dispose(); P.tex.back.dispose(); P.frontMat.dispose(); P.backMat.dispose();
}

// Shadows only need redrawing while something near the table moves; once the cookie (or
// the pieces and crumbs) are at rest and the slip is up in the air, keep the last ones.
let shadowsFresh = 0;
function tableMoving() {
  if (state.mode === 'intro' || state.mode === 'clearing' || fading.length) return true;
  const P = round.paper;
  if (P && P.released && P.t < 2.2) return true;
  if (round.whole && round.fadeIn < 1) return true;
  return bodies().some((b) => !Phys.Physics.resting(b.rec, 0.002, 0.02));
}
function render() {
  const moving = !physics || tableMoving();
  if (moving) shadowsFresh = 0;
  if (shadowsFresh < 3) {
    contact.update(scene);
    renderer.shadowMap.needsUpdate = true;
    shadowsFresh++;
  }
  if (focus.amount < 0.01 || params.has('nodof')) {
    renderer.render(scene, camera);
    return;
  }
  const mask = camera.layers.mask;
  camera.layers.disable(LAYER_SLIP);
  renderer.render(scene, camera);
  const dpr = renderer.getPixelRatio();
  focus.blur.apply(Math.min(0.85, focus.amount), 2.8 * dpr);
  // the slip, sharp, over the soft table
  const auto = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  camera.layers.set(LAYER_SLIP);
  renderer.render(scene, camera);
  camera.layers.mask = mask;
  renderer.autoClear = auto;
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
  if (state.mode === 'idle') { crack(); return; }
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
    if (state.mode === 'idle') crack(); else if (state.mode === 'reading') another();
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
    newCookie(0.002, false);
    // let the first cookie settle before anyone sees it
    for (let i = 0; i < 300; i++) advance(1 / 60);
    renderer.compile(scene, camera);
    {
      // compile the fade materials now rather than at the first "another cookie"
      // (and the broken-edge material, first seen at the first crack)
      const box = new THREE.BoxGeometry(0.001, 0.001, 0.001);
      const probes = [...FADE.values(), crumbMat, innerMat].map((m) => { const o = new THREE.Mesh(box, m); o.position.set(0, 0.02, 0); o.castShadow = true; return o; });
      scene.add(...probes);
      renderer.shadowMap.needsUpdate = true;
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
      scene.remove(...probes);
      focus.blur.apply(0); // compile the depth-of-field passes
    }
    render();
    $('loading').classList.add('hidden');
    $('btnSound').classList.remove('hidden');
    $('credit').classList.remove('hidden');
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
  get audio() { return audio; },
};
