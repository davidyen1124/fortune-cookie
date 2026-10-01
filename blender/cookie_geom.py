"""Parametric fortune cookie, built the way a real one is folded.

A flat disc of batter (radius R) is folded in half over the fortune slip into a
half-moon pocket. Then the middle of the straight folded edge is pushed in over a cup
rim while the two corners are pulled round: the fold becomes a V-shaped notch, the
half-moon becomes a horseshoe, and the two layers puff apart, the top one doming up
and the bottom one down. Each arm of the horseshoe is a fat pocket that tapers to a
flat pointed tip; the fold runs along the inside of the notch and the open rim runs
round the outside, gaping a little at the back.

Disc coordinates (u, v), metres, u^2 + v^2 <= R^2:
  v = 0   the fold (where the slip lies); u runs along it, u < 0 left arm, u > 0 right
  v > 0   top layer, |v| = distance from the fold along the batter
  v < 0   bottom layer

World frame (Blender, z up): x right, +y toward the back rim, the tips point to -y
(toward the viewer); the fold line lies in the plane z = 0.
Side A of the disc (+normal of the parametrisation) is the outside of both shells.
"""
import math
import numpy as np

P = dict(
    R=0.040,           # disc radius (80 mm disc)
    T=0.0013,          # shell thickness in the middle
    T_rim=0.0008,      # shell thickness at the rim (batter spreads thinner, bakes crisper)
    rf=0.0009,         # fold radius of the mid-surface (the layers touch just behind the fold)
    # the fold line in plan: a V with a rounded apex (the notch)
    beta=math.radians(48),    # apex angle of the V
    r_apex=0.004,            # radius of the rounded apex
    fold_len=0.72,            # the pinched fold is a little shorter than the flat one
    arm_bow=math.radians(13), # the arms curl in toward each other: a horseshoe, not a straight V
    droop=0.0035,             # the tips sit a little lower than the apex
    # cross-section of each shell: a short neck where the layers stay together, then a dome
    neck=0.0034,
    psi0=math.radians(100),    # how steeply the top shell climbs out of the notch
    turn=math.radians(216),   # how far it turns on its way over the dome and down to the rim
    psi0_b=math.radians(96),  # bottom shell: a little flatter, so its rim sticks out past the top one
    turn_b=math.radians(213),
    taper_p=2.4, taper_e=0.7, # the shells flatten toward the tips, where the layers are pressed together
    gape=0.0013, gape_tip=0.0002,  # pocket mouth: gap between the rims at the back / near the tips
    # irregularity
    asym=0.07,           # the two arms are never the same size
    skew=0.06,           # nor is the notch square to the back
    wobble=0.0003,       # low-frequency dents (m)
    rim_noise=0.016,     # relative rim radius noise
    seed=3,
)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _unit(v):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)


class Cookie:
    def __init__(self, **kw):
        self.p = dict(P)
        self.p.update(kw)
        p = self.p
        rng = np.random.default_rng(p["seed"])
        # rim radius noise: a few low harmonics plus a little frilly high-frequency
        self.rim_h = [(k, rng.normal() * p["rim_noise"] / k ** 0.9, rng.uniform(0, 2 * np.pi)) for k in range(2, 26)]
        # surface wobble: sum of random plane waves in disc coords
        self.waves = [(rng.normal(size=2) * rng.uniform(40, 160), rng.uniform(0, 2 * np.pi), rng.normal() * p["wobble"]) for _ in range(14)]
        self.vf = math.pi * p["rf"] / 2                  # disc distance used by each half of the fold arc
        self.Rg = p["R"]
        self._build_fold()
        self._build_mouth()
        self._build_ribs()

    # ------------------------------------------------------------------ outline
    def rim_radius(self, theta):
        R = self.p["R"]
        r = np.ones_like(theta)
        for k, a, ph in self.rim_h:
            r = r + a * np.cos(k * theta + ph)
        return R * r

    def inside(self, u, v, margin=0.0):
        th = np.arctan2(v, u)
        return np.hypot(u, v) <= self.rim_radius(th) - margin

    # ------------------------------------------------------------------ fold line
    def _build_fold(self):
        """the fold as a plan curve: straight-ish arms, rounded apex; tabulated against u"""
        p = self.p
        R, k = p["R"], p["fold_len"]
        n = 4001
        u = np.linspace(-1.25 * R, 1.25 * R, n)
        sig = k * u                                   # arc length along the pinched fold
        half = math.pi / 2 - p["beta"] / 2            # heading of the left arm (from +x)
        sa = p["r_apex"] * half                       # half the apex arc
        L = k * R
        # heading: left arm -> round the apex -> right arm, plus the inward curl of each arm
        t = np.clip(sig / sa, -1, 1)
        h = -half * (1.5 * t - 0.5 * t ** 3)          # smooth turn through the apex
        arm = np.clip((np.abs(sig) - sa) / (L - sa), 0, 1.3)
        h = h - np.sign(sig) * p["arm_bow"] * arm ** 1.5 + p["skew"] * (1 - arm.clip(0, 1)) * 0.0
        d = np.stack([np.cos(h), np.sin(h)], 1)
        ds = sig[1] - sig[0]
        pos = np.zeros((n, 2))
        pos[1:] = np.cumsum((d[1:] + d[:-1]) / 2 * ds, 0)
        pos -= pos[n // 2]
        # a small skew of the whole notch
        c, s = math.cos(p["skew"]), math.sin(p["skew"])
        rot = np.array([[c, -s], [s, c]])
        self.fu = u
        self.fpos = pos @ rot.T
        self.fh = h + p["skew"]
        self.fz = -p["droop"] * np.clip(np.abs(u) / R, 0, 1.25) ** 2

    def fold(self, u):
        """fold point, outward (toward the rim) horizontal normal, for disc coordinate u"""
        x = np.interp(u, self.fu, self.fpos[:, 0])
        y = np.interp(u, self.fu, self.fpos[:, 1])
        z = np.interp(u, self.fu, self.fz)
        h = np.interp(u, self.fu, self.fh)
        pos = np.stack([x, y, z], -1)
        nrm = np.stack([-np.sin(h), np.cos(h), np.zeros_like(h)], -1)  # left of travel = away from the notch
        return pos, nrm

    # ------------------------------------------------------------------ shells
    def profile(self, u, s, bottom):
        """(outward, up) offset from the fold of the layer point at distance s from the fold"""
        p = self.p
        R = self.Rg
        q = np.clip(np.abs(u) / R, 0, 1)
        W = np.sqrt(np.maximum(R * R - u * u, 1e-10))
        flat = (1 - q ** p["taper_p"]) ** p["taper_e"]          # 1 in the middle, 0 at the tips
        size = 1 + p["asym"] * np.tanh(u / 0.008)                # right arm a little fuller
        # climb and turn shrink together, so the rim always comes back down to meet the other layer
        psi0 = (p["psi0_b"] if bottom else p["psi0"]) * flat
        turn = (p["turn_b"] if bottom else p["turn"]) * flat * size
        sn = np.minimum(p["neck"], 0.3 * W)
        n = 40
        ss = np.linspace(0, 1, n)[None, :] * s[..., None]
        a = ss / np.maximum(sn[..., None], 1e-6)
        rise = psi0[..., None] * np.where(a < 1, a * a * (3 - 2 * a), 1.0)
        dome = np.clip((ss - sn[..., None]) / np.maximum(W[..., None] - sn[..., None], 1e-6), 0, 1.15)
        psi = rise - turn[..., None] * dome
        ds = s / (n - 1)
        c, sn_ = np.cos(psi), np.sin(psi)
        out = (np.sum(c, -1) - 0.5 * (c[..., 0] + c[..., -1])) * ds
        up = (np.sum(sn_, -1) - 0.5 * (sn_[..., 0] + sn_[..., -1])) * ds
        return out, (-up if bottom else up)

    def _build_mouth(self):
        """How far the top shell's rim must come down to rest just above the bottom shell's
        rim (the two rims run together round the outside, parted by a thin seam that widens
        to the pocket mouth at the back). Tabulated against u; applied in base()."""
        p = self.p
        R = self.Rg
        us = np.linspace(-R * 0.999, R * 0.999, 241)
        ns = 96
        W = np.sqrt(R * R - us * us)
        S = W[:, None] * np.linspace(0, 1, ns)[None, :]
        U = np.repeat(us[:, None], ns, 1)
        ot, zt = self.profile(U, S, False)
        ob, zb = self.profile(U, S, True)
        dz = np.zeros(len(us))
        for i in range(len(us)):
            # bottom shell height under the top rim: outer branch of the bottom profile
            k = int(np.argmax(ob[i]))
            lo = int(ns * 0.35)
            if k <= lo + 1:
                zb_at = zb[i, -1]
            else:
                zb_at = np.interp(min(ot[i, -1], ob[i, k]), ob[i, lo:k + 1], zb[i, lo:k + 1])
            q = abs(us[i]) / R
            gap = p["gape_tip"] + (p["gape"] - p["gape_tip"]) * (1 - q * q) ** 1.5
            want = zb_at - 2 * p["rf"] + p["T_rim"] + gap
            dz[i] = want - zt[i, -1]
        self.mouth_u, self.mouth_dz = us, dz

    def shell(self, ut, st, bottom):
        """point of a shell on the cross-section at fold coordinate ut, st along it from the fold"""
        f, n = self.fold(ut)
        out, up = self.profile(ut, st, bottom)
        if not bottom:
            R = self.Rg
            W = np.sqrt(np.maximum(R * R - ut * ut, 1e-10))
            up = up + np.interp(ut, self.mouth_u, self.mouth_dz) * np.clip(st / W, 0, 1.15) ** 2.5
        return f + out[..., None] * n + up[..., None] * np.array([0.0, 0.0, 1.0])

    def _build_ribs(self):
        """Where each bit of batter ends up. The pinch shortens the fold, but the rim keeps its
        length: it is laid round the outside of the horseshoe at its true spacing. So a line
        drawn straight out from the fold on the flat disc leans, in the cookie, toward the
        spot on the outline that is the right distance along the rim. h(u) is that spot,
        as the fold coordinate of the cross-section it lies on."""
        R = self.Rg
        ut = np.linspace(-R, R, 801)
        rim = self.shell(ut, np.sqrt(np.maximum(R * R - ut * ut, 0)), False)
        S = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(rim, axis=0), axis=1))])
        S /= S[-1]
        u = np.linspace(-R, R, 801)
        frac = 1 - np.arccos(np.clip(u / R, -1, 1)) / np.pi      # how far round the flat rim
        self.rib_u = u
        self.rib_h = np.interp(frac, S, ut)

    def base(self, u, b, bottom):
        """layer point for disc coords (u, b >= 0 from the fold), before the fold offset"""
        R = self.Rg
        # measure against the real, wavy rim: every rim point lies at the end of its cross-section
        # (so the two rims always come together), and the waviness goes into its length
        rho = self.rim_radius(np.arctan2(-b if bottom else b, u)) / R
        un, bn = u / rho, b / rho
        W = np.sqrt(np.maximum(R * R - un * un, 1e-8))
        f = np.clip(bn / W, 0, 1.0)
        lean = f ** 1.6
        ut = un + (np.interp(un, self.rib_u, self.rib_h) - un) * lean
        Wt = np.sqrt(np.maximum(R * R - ut * ut, 1e-8))
        return self.shell(ut, f * Wt * (1 + (rho - 1) * f * f), bottom)

    def base_normal(self, u, b, bottom, h=2e-5):
        """normal of the layer pointing away from the pocket (up for the top, down for the bottom)"""
        pu = self.base(u + h, b, bottom) - self.base(u - h, b, bottom)
        pb = self.base(u, b + h, bottom) - self.base(u, np.maximum(b - h, 0), bottom)
        n = _unit(np.cross(pu, pb))
        return -n if bottom else n

    def mid(self, u, v, noise=True):
        """Mid-surface point for disc coords (u, v) (arrays)."""
        u = np.asarray(u, float); v = np.asarray(v, float)
        rf, vf = self.p["rf"], self.vf
        b = np.maximum(np.abs(v) - vf, 0)
        bottom = v < 0
        out = np.zeros(u.shape + (3,))
        up = np.array([0.0, 0.0, 1.0])
        for flag in (False, True):
            m = bottom == flag
            if not np.any(m):
                continue
            out[m] = self.base(u[m], b[m], flag) + (-rf if flag else rf) * up
        fold = np.abs(v) < vf
        if np.any(fold):
            # half circle joining the two layers round the fold, bulging into the notch
            uf = u[fold]
            f, n = self.fold(uf)
            th = v[fold] / rf  # -pi/2 .. pi/2
            out[fold] = f + rf * (np.sin(th)[..., None] * up - np.cos(th)[..., None] * n)
        if noise:
            w = np.zeros(u.shape)
            for k, ph, amp in self.waves:
                w += amp * np.sin(k[0] * u + k[1] * v + ph)
            taper = smoothstep(0.0, 0.006, np.abs(v))  # keep the fold clean
            nn = self.mid_normal_fd(u, v, noise=False)
            out = out + (w * taper)[..., None] * nn
        return out

    def mid_normal_fd(self, u, v, noise=True, h=3e-5):
        f = lambda a, b: self.mid(a, b, noise=noise)
        pu = f(u + h, v) - f(u - h, v)
        pv = f(u, v + h) - f(u, v - h)
        return _unit(np.cross(pu, pv))

    def thickness(self, u, v):
        p = self.p
        r = np.hypot(u, v) / self.rim_radius(np.arctan2(v, u))
        return p["T"] + (p["T_rim"] - p["T"]) * smoothstep(0.55, 1.0, r)


# ---------------------------------------------------------------------- sampling

def graded(half, hmin, hmax, w):
    """1-D samples on [-half, half], spacing hmin at 0 growing to hmax beyond w."""
    xs = [0.0]
    x = 0.0
    while x < half:
        h = hmin + (hmax - hmin) * min(1.0, x / w)
        x += h
        xs.append(x)
    xs = np.array(xs)
    return np.concatenate([-xs[:0:-1], xs])


def interior_points(ck, hu=(0.00045, 0.0013, 0.007), hv=(0.00012, 0.0013, 0.006), margin=0.0006):
    R = ck.p["R"] * 1.06
    us = graded(R, *hu)
    vs = graded(R, *hv)
    U, V = np.meshgrid(us, vs, indexing="ij")
    U, V = U.ravel(), V.ravel()
    keep = ck.inside(U, V, margin)
    return np.stack([U[keep], V[keep]], 1)


def rim_polygon(ck, n=720):
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    r = ck.rim_radius(th)
    return np.stack([r * np.cos(th), r * np.sin(th)], 1), th
