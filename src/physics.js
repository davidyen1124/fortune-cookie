import RAPIER from '@dimforge/rapier3d-compat';

export const STEP = 1 / 240;
const G = 9.81;

// Baked batter on a laminated tabletop. A fortune cookie is a hard, brittle, very light
// shell (8 g spread over a 6 cm hollow), so it bounces a little and air drag matters.
export const MAT = {
  friction: 0.55,
  restitution: 0.28,
  floorFriction: 0.6,
  floorRestitution: 0.3,
  linearDamping: 0.12,   // air drag on a light, bulky shell
  angularDamping: 0.35,
  crumbRestitution: 0.35,
};

// collision groups: (membership << 16) | filter
export const GROUP = { FLOOR: 0x1, WHOLE: 0x2, PIECE_A: 0x4, PIECE_B: 0x8, CRUMB: 0x10 };
const groups = (member, filter) => (member << 16) | filter;

/** small deterministic PRNG */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let ready = null;
export function initRapier() {
  if (!ready) ready = RAPIER.init();
  return ready;
}

export class Physics {
  constructor() {
    const world = (this.world = new RAPIER.World({ x: 0, y: -G, z: 0 }));
    world.timestep = STEP;
    world.lengthUnit = 0.05; // things here are centimetres across
    world.numSolverIterations = 8;
    this.events = new RAPIER.EventQueue(true);
    this.owner = new Map(); // collider handle -> body record
    this.hits = []; // contact impulses since the last drain
    const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const floor = RAPIER.ColliderDesc.cuboid(4, 0.5, 4).setTranslation(0, -0.5, 0)
      .setFriction(MAT.floorFriction).setRestitution(MAT.floorRestitution)
      .setCollisionGroups(groups(GROUP.FLOOR, 0xffff));
    world.createCollider(floor, fixed);
  }

  /**
   * A rigid body from convex hulls (points in the body frame, origin = centre of mass).
   * def: { hulls: [[[x,y,z],...],...], mass, principal: [3], frame: [x,y,z,w] }
   */
  add(def, pose, { lin, ang, scale = 1, group = GROUP.WHOLE, filter = 0xffff, restitution = MAT.restitution, ccd = true, kind = 'shell', sound = true } = {}) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pose.p.x, pose.p.y, pose.p.z)
      .setRotation(pose.q)
      .setCcdEnabled(ccd)
      .setLinearDamping(MAT.linearDamping)
      .setAngularDamping(MAT.angularDamping);
    const s3 = scale * scale * scale, s5 = s3 * scale * scale;
    if (def.principal) {
      const [x, y, z, w] = def.frame;
      const p = def.principal;
      desc.setAdditionalMassProperties(def.mass * s3, { x: 0, y: 0, z: 0 }, { x: p[0] * s5, y: p[1] * s5, z: p[2] * s5 }, { x, y, z, w });
    }
    const body = this.world.createRigidBody(desc);
    const rec = { body, kind, colliders: [], mass: def.mass * s3 };
    const hulls = def.hulls || [def.hull];
    for (const h of hulls) {
      const pts = new Float32Array(h.length * 3);
      h.forEach((q, i) => { pts[i * 3] = q[0] * scale; pts[i * 3 + 1] = q[1] * scale; pts[i * 3 + 2] = q[2] * scale; });
      const cd = RAPIER.ColliderDesc.convexHull(pts);
      if (!cd) continue;
      cd.setFriction(MAT.friction).setRestitution(restitution)
        .setCollisionGroups(groups(group, filter));
      if (def.principal) cd.setDensity(0);
      else cd.setMass(def.mass * s3 / hulls.length);
      if (sound) cd.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0);
      const c = this.world.createCollider(cd, body);
      this.owner.set(c.handle, rec);
      rec.colliders.push(c);
    }
    if (lin) body.setLinvel(lin, true);
    if (ang) body.setAngvel(ang, true);
    return rec;
  }

  setFilter(rec, group, filter) {
    for (const c of rec.colliders) c.setCollisionGroups(groups(group, filter));
  }

  remove(rec) {
    for (const c of rec.colliders) this.owner.delete(c.handle);
    this.world.removeRigidBody(rec.body);
  }

  step() {
    this.world.step(this.events);
    this.events.drainContactForceEvents((e) => {
      const a = this.owner.get(e.collider1()), b = this.owner.get(e.collider2());
      const J = e.totalForceMagnitude() * STEP;
      const rec = a || b;
      if (!rec) return;
      const other = a && b ? (a === rec ? b : a) : null;
      this.hits.push({ rec, other, J });
    });
  }

  drainHits() {
    const h = this.hits;
    this.hits = [];
    return h;
  }

  static state(rec) {
    const b = rec.body;
    return { p: b.translation(), q: b.rotation(), v: b.linvel(), w: b.angvel() };
  }

  static resting(rec, lin = 0.01, ang = 0.08) {
    const b = rec.body;
    if (b.isSleeping()) return true;
    const v = b.linvel(), w = b.angvel();
    return Math.hypot(v.x, v.y, v.z) < lin && Math.hypot(w.x, w.y, w.z) < ang;
  }
}
