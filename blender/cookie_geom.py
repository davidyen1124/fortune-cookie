"""Parametric fortune cookie, built the way a real one is folded.

A flat disc of batter (radius R) is folded in half over the fortune slip, then the
middle of the fold is pressed over a cup rim so the two halves of the fold (crease)
come together side by side. The crease ends up as the vertical slit at the front,
the line from the crease's middle to the rim (M -> T) becomes the rounded ridge on
top, and each quarter of the disc puffs out into a lobe with a pocket inside.

Disc coordinates (u, v), metres, u^2 + v^2 <= R^2:
  v = 0  the crease (fold line, where the slip lies)
  v > 0  outer layer (the smooth outside shell)
  v < 0  inner layer (lines the pocket, faces the cavity between the lobes)
  u < 0  left lobe, u > 0 right lobe, u = 0 the ridge

World frame (Blender, z up): x right, -y toward the viewer (front / slit), z up.
Side A of the disc (the +normal side, baked against the tray) ends up outside.
"""
import math
import numpy as np

P = dict(
    R=0.0405,          # disc radius (8.1 cm disc)
    T=0.00125,         # shell thickness in the middle
    T_rim=0.0008,      # shell thickness at the rim (batter spreads thinner, bakes crisper)
    rf=0.00078,        # crease fold radius of the mid-surface (layers just touch)
    # outer loop: the directions (seen from M) the outer half-disc sweeps through,
    # polar in angle around the cone axis, phi = 0 toward the slit. rho(phi) in radians,
    # scaled so the loop has spherical length pi (a half disc rolls into it without stretching)
    a1=0.0,            # > 0: slit side fuller than the ridge side
    a2=-0.26,          # < 0: wider across (the two lobes) than front-to-back
    a3=-0.03,          # heart-ish: sharpens the ridge
    notch=0.30, notch_w=0.30,  # the lobes bulge forward past the slit (heart notch at phi = 0)
    tilt=math.radians(8),   # cone axis tilted back (slit side up)
    # apex: the fold at M is bent over a cup rim, so the tip is a rounded dome
    psi_top=1.35, s_round=0.012,
    bulge=0.06,        # lobes bow outward along their generators (radians at mid-length)
    drop=0.25, drop_p=1.6,           # generators curve down toward the rim: a puffy dome, not a skirt
    ridge_len=0.018, ridge_q=2.0,   # the apex is a short rounded ridge (the part that lay on the cup rim)
    flare=0.0,         # rim flares out a little (radians at the rim)
    # pocket between the layers: the inner loop sits inside the outer one
    delta1=0.22, delta_p=1.1,    # angular gap at the ridge / how fast it opens from the lips
    lip=0.0,                      # extra spacing of the slit lips
    lip_open=0.0016, lip_r0=0.008,   # the slit gapes a little below the top
    # irregularity
    asym=0.05,           # left/right lobe difference
    wobble=0.00035,      # low-frequency dents (m)
    rim_noise=0.018,     # relative rim radius noise
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
        self.xl = p["rf"] + p["T"] / 2 + p["lip"]       # half spacing of the two lip folds
        self.vf = math.pi * p["rf"] / 2                  # disc distance used by each half of the fold arc
        self._build_loop()

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

    # ------------------------------------------------------------------ cone loop
    def _rho_shape(self, phi):
        p = self.p
        side = np.tanh(np.sin(phi) * 3)  # +1 right lobe, -1 left lobe
        w = np.angle(np.exp(1j * phi))  # -pi..pi
        notch = 1 - p["notch"] * np.exp(-(w / p["notch_w"]) ** 2)
        return (1 + p["a1"] * np.cos(phi) + p["a2"] * np.cos(2 * phi) + p["a3"] * np.cos(3 * phi)) * notch * (1 + p["asym"] * side * np.sin(phi) ** 2)

    def _dir(self, psi, phi):
        """unit direction at angle psi from the axis, azimuth phi (0 = toward the slit)"""
        c, e1, e2 = self.axis
        sp = np.sin(psi)[..., None]
        return np.cos(psi)[..., None] * c + sp * (np.sin(phi)[..., None] * e1 + np.cos(phi)[..., None] * e2)

    def _build_loop(self):
        p = self.p
        t = p["tilt"]
        # axis: down, tilted back (away from the viewer, +y) by `tilt`; e2 points toward the slit
        c = np.array([0.0, math.sin(t), -math.cos(t)])
        e1 = np.array([1.0, 0.0, 0.0])
        e2 = np.cross(c, e1)  # (0, -cos t, -sin t) -> front
        if e2[1] > 0:
            e2 = -e2
        self.axis = (c, e1, e2)
        phi = np.linspace(0, 2 * np.pi, 2049)
        shape = self._rho_shape(phi)

        def length(k):
            d = self._dir(k * shape, phi)
            return np.sum(np.linalg.norm(np.diff(d, axis=0), axis=1))
        lo, hi = 0.05, 1.4
        for _ in range(60):
            m = 0.5 * (lo + hi)
            if length(m) < math.pi:
                lo = m
            else:
                hi = m
        self.k = 0.5 * (lo + hi)
        d = self._dir(self.k * shape, phi)
        seg = np.linalg.norm(np.diff(d, axis=0), axis=1)
        s = np.concatenate([[0], np.cumsum(seg)])
        self.loop_phi = phi
        self.loop_alpha = s / s[-1] * math.pi  # isometric: alpha (disc angle) along the loop

    def loop_at(self, alpha):
        """(psi, phi) of the outer loop at disc angle alpha in [0, pi]"""
        phi = np.interp(alpha, self.loop_alpha, self.loop_phi)
        return self.k * self._rho_shape(phi), phi

    def _delta(self, alpha):
        """angular gap between the layers, 0 at the lips, largest at the ridge (alpha in [0, pi])"""
        p = self.p
        q = np.sin(np.clip(alpha, 0, np.pi))
        return p["delta1"] * q ** p["delta_p"]

    # ------------------------------------------------------------------ layers
    def layer(self, r, alpha, inner):
        """Point on the outer (inner=False) or inner layer, before the lip/fold offsets.
        r: distance from M along the disc; alpha in [0, pi] measured from the B lip."""
        p = self.p
        psi0, phi = self.loop_at(alpha)
        if inner:
            psi0 = psi0 * (1 - self._delta(alpha)) - 0.0 * alpha
        lobe = np.sin(phi) ** 2
        n = 28
        ss = np.linspace(0, 1, n)[None, :] * r[..., None]
        R = p["R"]
        e = np.exp(-ss / p["s_round"])
        body = psi0[..., None] - p["drop"] * (psi0[..., None] / self.k) * np.clip(ss / R, 0, 1.2) ** p["drop_p"]
        psi = (p["psi_top"] * e + body * (1 - e)
               + p["bulge"] * lobe[..., None] * np.sin(np.pi * np.clip(ss / R, 0, 1))
               + p["flare"] * smoothstep(0.7 * R, 1.05 * R, ss))
        d = self._dir(psi, np.broadcast_to(phi[..., None], psi.shape))
        ds = (r / (n - 1))[..., None]
        pos = (np.sum(d, -2) - 0.5 * (d[..., 0, :] + d[..., -1, :])) * ds
        # generators start along the ridge instead of all from one point
        back = self._dir(np.array(p["psi_top"]), np.array(np.pi))
        w = np.sin(np.clip(alpha, 0, np.pi)) ** p["ridge_q"]
        pos = pos + (p["ridge_len"] * w)[..., None] * back
        return pos

    def base(self, u, b, inner):
        """layer point for disc coords (u, b>=0) with the lips pulled apart"""
        r = np.hypot(u, b)
        alpha = np.arctan2(b, u)  # 0 at the B lip (u > 0), pi at the A lip
        pos = self.layer(r, alpha, inner)
        c, e1, e2 = self.axis
        p = self.p
        x = r / p["lip_r0"]
        opening = self.xl + p["lip_open"] * x * np.exp(1 - x)
        pos = pos + (opening * np.cos(alpha) ** 3)[..., None] * e1
        return pos

    def base_normal(self, u, b, inner, h=2e-5):
        pu = self.base(u + h, b, inner) - self.base(u - h, b, inner)
        pb = self.base(u, b + h, inner) - self.base(u, np.maximum(b - h, 0), inner)
        n = _unit(np.cross(pu, pb))
        return n

    def mid(self, u, v, noise=True):
        """Mid-surface point for disc coords (u, v) (arrays)."""
        u = np.asarray(u, float); v = np.asarray(v, float)
        rf, vf = self.p["rf"], self.vf
        b = np.maximum(np.abs(v) - vf, 0)
        inner = v < 0
        out = np.zeros(u.shape + (3,))
        for flag in (False, True):
            m = inner == flag
            if not np.any(m):
                continue
            um, bm = u[m], b[m]
            Pm = self.base(um, bm, flag)
            nrm = self.base_normal(um, np.maximum(bm, 1e-4), flag)
            out[m] = Pm + (-rf if flag else rf) * nrm
        fold = np.abs(v) < vf
        if np.any(fold):
            uf = u[fold]
            L = self.base(uf, np.zeros_like(uf), False)
            n0 = self.lip_normal(uf)
            tb = self.base(uf, np.full_like(uf, 1e-4), False) - L
            tb = _unit(tb - np.sum(tb * n0, -1, keepdims=True) * n0)
            th = v[fold] / rf  # -pi/2 .. pi/2
            out[fold] = L + rf * (np.sin(th)[..., None] * n0 - np.cos(th)[..., None] * tb)
        if noise:
            w = np.zeros(u.shape)
            for k, ph, amp in self.waves:
                w += amp * np.sin(k[0] * u + k[1] * np.abs(v) + ph)  # same dents on both layers
            taper = smoothstep(0.0, 0.006, np.abs(v)) * smoothstep(0.004, 0.012, np.hypot(u, v))
            # outward (away from the cone axis) for both layers, so the layers dent together
            nn = self.mid_normal_fd(u, v, noise=False) * np.where(v < 0, -1.0, 1.0)[..., None]
            out = out + (w * taper)[..., None] * nn
        return out

    def lip_normal(self, u, h=2e-5):
        """outward normal of the outer layer along the lip line (used to separate the layers)"""
        b0 = np.full_like(u, 1e-4)
        pu = self.base(u + h, b0, False) - self.base(u - h, b0, False)
        pb = self.base(u, b0 + h, False) - self.base(u, b0, False)
        return _unit(np.cross(pu, pb))

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
