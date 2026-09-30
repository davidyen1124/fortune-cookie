/**
 * Sounds of a fortune cookie, synthesised (no audio files).
 *
 * A snapping fortune cookie is a dry, bright crack: a sharp broadband transient, then a
 * quick scatter of micro-fractures as the crack runs through the brittle shell (tens of
 * milliseconds), with almost no body resonance, the shell is too thin and too damped
 * to ring. Pieces and crumbs landing on the table are light hollow taps and tiny ticks,
 * driven by the contact impulses from the physics engine. The slip gives a papery
 * rustle when it slides out and unfolds.
 */
export class CookieAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.voices = 0;
  }

  prepare() {
    if (this.ctx) return;
    try { this.#build(); } catch { this.ctx = null; }
  }

  async start() {
    if (!this.ctx) this.#build();
    if (this.ctx && this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch { /* ignored */ }
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.03);
  }

  #build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 5; comp.attack.value = 0.001; comp.release.value = 0.08;
    this.master.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain();
    this.wet = ctx.createGain(); this.wet.gain.value = 0.35;
    const verb = ctx.createConvolver();
    verb.buffer = this.#roomIR(0.5);
    this.dry.connect(this.master);
    this.wet.connect(verb).connect(this.master);
    this.noise = this.#noise(1.2);
  }

  #noise(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /** small, bright room (a kitchen table), RT60 ~ 0.35 s */
  #roomIR(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * sec);
    const ir = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const k = 0.1 + 0.5 * Math.min(1, t / 0.35);
        lp += (Math.random() * 2 - 1 - lp) * (1 - k);
        d[i] = lp * Math.exp(-t / 0.055) * (t < 0.004 ? t / 0.004 : 1) * 0.8;
      }
    }
    return ir;
  }

  #burst(t, { f = 4000, q = 0.8, hp = 1200, level = 1, tau = 0.004, pan = 0, dur, attack = 0.0003 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; h.Q.value = 0.5;
    const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q;
    const g = ctx.createGain();
    const len = dur ?? tau * 7;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0003, t + len);
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
    src.connect(h).connect(b).connect(g).connect(p);
    p.connect(this.dry); p.connect(this.wet);
    src.start(t, Math.random() * 0.9, len + 0.02);
    return len;
  }

  #tone(t, f, level, tau, pan = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.93, t + tau * 6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.0006);
    g.gain.exponentialRampToValueAtTime(0.0003, t + tau * 6);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p); p.connect(this.dry); p.connect(this.wet);
    o.start(t); o.stop(t + tau * 6 + 0.02);
  }

  #ok() {
    return this.ctx && this.enabled && this.ctx.state === 'running' && this.voices < 40;
  }

  #voice(sec) {
    this.voices++;
    setTimeout(() => this.voices--, sec * 1000 + 100);
  }

  /** the snap: one hard crack, then the crack running through the shell */
  crack(strength = 1) {
    if (!this.#ok()) return;
    const t = this.ctx.currentTime + 0.005;
    this.#burst(t, { f: 3800, q: 0.6, hp: 900, level: 1.1 * strength, tau: 0.0035 });
    this.#burst(t, { f: 7200, q: 0.9, hp: 3000, level: 0.6 * strength, tau: 0.002 });
    this.#tone(t, 1150 + Math.random() * 300, 0.05 * strength, 0.006);
    const n = 9 + Math.floor(Math.random() * 8);
    let tt = t + 0.004;
    for (let i = 0; i < n; i++) {
      tt += 0.002 + Math.random() * Math.random() * 0.012;
      const lvl = (0.15 + Math.random() * 0.45) * strength * Math.exp(-(tt - t) / 0.04);
      this.#burst(tt, { f: 2500 + Math.random() * 6000, q: 0.7 + Math.random(), hp: 1500, level: lvl, tau: 0.0008 + Math.random() * 0.0015, pan: (Math.random() - 0.5) * 0.4 });
    }
    this.#voice(0.2);
  }

  /** a light shell piece landing / knocking on the table; J = contact impulse (N s) */
  knock(J, pan = 0, kind = 'shell') {
    if (!this.#ok()) return;
    const t = this.ctx.currentTime + 0.003;
    if (kind === 'crumb') {
      const s = Math.min(1, J / 0.0006);
      if (s < 0.05) return;
      this.#burst(t, { f: 5000 + Math.random() * 4000, q: 1.2, hp: 3000, level: 0.12 * s, tau: 0.0007, pan });
      this.#voice(0.02);
      return;
    }
    const s = Math.min(1, Math.pow(J / 0.012, 0.6));
    if (s < 0.04) return;
    // hollow, dry tap: noise click + two quickly damped shell modes
    this.#burst(t, { f: 2600 + Math.random() * 800, q: 1.1, hp: 700, level: 0.55 * s, tau: 0.003 + 0.002 * s, pan });
    this.#tone(t, 900 + Math.random() * 250, 0.06 * s, 0.008, pan);
    this.#tone(t, 2100 + Math.random() * 400, 0.035 * s, 0.005, pan);
    this.#voice(0.08);
  }

  /** the slip sliding out and unfolding: a short papery crinkle */
  rustle(dur = 0.5, level = 1) {
    if (!this.#ok()) return;
    const t0 = this.ctx.currentTime + 0.01;
    const n = Math.floor(dur * 55);
    for (let i = 0; i < n; i++) {
      const t = t0 + (i / n) * dur + Math.random() * 0.01;
      const env = Math.sin(Math.PI * (i / n)) ** 0.7;
      if (Math.random() < 0.35) continue;
      this.#burst(t, { f: 3000 + Math.random() * 5000, q: 0.6 + Math.random() * 0.8, hp: 1800, level: (0.04 + Math.random() * 0.1) * env * level, tau: 0.002 + Math.random() * 0.004, pan: (Math.random() - 0.5) * 0.3 });
    }
    this.#voice(dur + 0.1);
  }

  /** flicking the slip over */
  flick() {
    if (!this.#ok()) return;
    const t = this.ctx.currentTime + 0.005;
    this.#burst(t, { f: 2200, q: 0.5, hp: 600, level: 0.08, tau: 0.03, attack: 0.02, dur: 0.12 });
    this.#burst(t + 0.09, { f: 5200, q: 0.8, hp: 2500, level: 0.1, tau: 0.003 });
    this.#voice(0.2);
  }
}
