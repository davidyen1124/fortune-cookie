"""Turn the parametric cookie (cookie_geom) into Blender meshes: the whole cookie and
its broken pieces. Runs inside Blender (needs mathutils for the 2-D triangulation).

Every vertex keeps its flat-disc coordinates as UVs, so one baked texture set covers
the whole cookie and every fracture variant alike.
"""
import math
import numpy as np
import bpy
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

import cookie_geom as cg

RIM_SEG = 5  # segments across the rounded rim


def uv_of(u, v, side, R):
    """Atlas: side A (outside) in the left square, side B (pocket) in the right square."""
    s = 0.5 / (2.12 * R)
    x = u * s + 0.25 + (0.5 if side == "B" else 0.0)
    y = v * s * 2 + 0.5
    return x, y


def triangulate(boundary, interior, margin_fn=None):
    """Constrained Delaunay of a closed boundary polygon (N,2) plus interior points (M,2).
    Returns (pts2d, tris, nb) with the boundary as the first nb points, in order."""
    nb = len(boundary)
    verts = [Vector((float(x), float(y))) for x, y in boundary] + [Vector((float(x), float(y))) for x, y in interior]
    edges = [(i, (i + 1) % nb) for i in range(nb)]
    faces = [list(range(nb))]
    out = delaunay_2d_cdt(verts, edges, faces, 1, 1e-9)
    ov, oe, of, orig_v = out[0], out[1], out[2], out[3]
    # map output vertices back to input order; new vertices (should be none) are appended
    remap = {}
    pts = np.array([[v.x, v.y] for v in verts])
    extra = []
    for i, ids in enumerate(orig_v):
        if ids:
            remap[i] = ids[0]
        else:
            remap[i] = len(pts) + len(extra)
            extra.append([ov[i].x, ov[i].y])
    if extra:
        pts = np.concatenate([pts, np.array(extra)], 0)
    tris = [[remap[i] for i in f] for f in of]
    # make every triangle counter-clockwise in (u, v)
    tris = np.array(tris)
    a, b, c = pts[tris[:, 0]], pts[tris[:, 1]], pts[tris[:, 2]]
    cr = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
    tris[cr < 0] = tris[cr < 0][:, [0, 2, 1]]
    # drop unused points
    used = np.unique(tris)
    return pts, tris, nb, used


def region_outline(ck, frac=None, keep="left", n_rim=720):
    """Closed outline (counter-clockwise) of the whole disc, or of one side of a fracture
    polyline `frac` (K,2) that runs from rim to rim. Returns (outline, is_break) where
    is_break flags the outline vertices that lie on the fracture."""
    poly, th = cg.rim_polygon(ck, n_rim)
    if frac is None:
        return poly, np.zeros(len(poly), bool)
    # angles where the fracture meets the rim
    t0 = math.atan2(frac[0, 1], frac[0, 0])
    t1 = math.atan2(frac[-1, 1], frac[-1, 0])

    def arc(ta, tb):
        # counter-clockwise arc from ta to tb
        if tb <= ta:
            tb += 2 * math.pi
        m = max(2, int((tb - ta) / (2 * math.pi) * n_rim))
        tt = np.linspace(ta, tb, m + 1)[1:-1]
        r = ck.rim_radius(tt)
        return np.stack([r * np.cos(tt), r * np.sin(tt)], 1)

    fr = frac.copy()
    # snap the ends exactly onto the rim
    for idx in (0, -1):
        t = math.atan2(fr[idx, 1], fr[idx, 0])
        r = ck.rim_radius(np.array([t]))[0]
        fr[idx] = [r * math.cos(t), r * math.sin(t)]
    # the fracture runs from its start (t0) to its end (t1). The piece on the left of the
    # direction of travel is closed by the ccw rim arc from t1 back to t0.
    if keep == "left":
        rim = arc(t1, t0)
        outline = np.concatenate([fr, rim], 0)
        is_break = np.concatenate([np.ones(len(fr), bool), np.zeros(len(rim), bool)])
    else:
        rim = arc(t0, t1)
        outline = np.concatenate([fr[::-1], rim], 0)
        is_break = np.concatenate([np.ones(len(fr), bool), np.zeros(len(rim), bool)])
    return outline, is_break


def point_in_poly(pts, poly):
    x, y = pts[:, 0][:, None], pts[:, 1][:, None]
    x1, y1 = poly[:, 0][None, :], poly[:, 1][None, :]
    x2, y2 = np.roll(poly[:, 0], -1)[None, :], np.roll(poly[:, 1], -1)[None, :]
    cond = ((y1 > y) != (y2 > y))
    xint = (x2 - x1) * (y - y1) / np.where(y2 - y1 == 0, 1e-12, y2 - y1) + x1
    return (np.sum(cond & (x < xint), 1) % 2) == 1


def seg_dist(pts, poly, closed=True):
    """distance from points to a polyline"""
    a = poly
    b = np.roll(poly, -1, 0) if closed else poly[1:]
    if not closed:
        a = poly[:-1]
    d = np.full(len(pts), np.inf)
    for i in range(0, len(a), 256):
        A, B = a[i:i + 256][None], b[i:i + 256][None]
        P = pts[:, None]
        AB = B - A
        t = np.clip(np.sum((P - A) * AB, -1) / np.maximum(np.sum(AB * AB, -1), 1e-18), 0, 1)
        q = A + t[..., None] * AB
        d = np.minimum(d, np.min(np.linalg.norm(P - q, axis=-1), 1))
    return d


def build_solid(ck, outline, is_break, interior, name, collection=None):
    """Mesh of the shell over a disc region: side A, side B, rounded rim, broken walls."""
    R = ck.p["R"]
    # interior points strictly inside the region, not too close to its outline
    inside = point_in_poly(interior, outline)
    pts_in = interior[inside]
    d = seg_dist(pts_in, outline)
    pts_in = pts_in[d > 0.00035]
    pts, tris, nb, used = triangulate(outline, pts_in)
    n = len(pts)
    u, v = pts[:, 0], pts[:, 1]
    mid = ck.mid(u, v)
    nrm = ck.mid_normal_fd(u, v)
    t = ck.thickness(u, v)
    A = mid + nrm * (t / 2)[:, None]
    B = mid - nrm * (t / 2)[:, None]

    # outward in-surface direction at the outline (2-D normal of the ccw outline -> 3-D)
    ob = outline
    tan2 = np.roll(ob, -1, 0) - np.roll(ob, 1, 0)
    out2 = np.stack([tan2[:, 1], -tan2[:, 0]], 1)
    out2 /= np.linalg.norm(out2, axis=1, keepdims=True)
    h = 2e-5
    ub, vb = ob[:, 0], ob[:, 1]
    Pu = (ck.mid(ub + h, vb) - ck.mid(ub - h, vb)) / (2 * h)
    Pv = (ck.mid(ub, vb + h) - ck.mid(ub, vb - h)) / (2 * h)
    O3 = Pu * out2[:, :1] + Pv * out2[:, 1:]
    O3 /= np.linalg.norm(O3, axis=1, keepdims=True) + 1e-9

    verts, uvs, faces, fuv, fmat, sharp_faces = [], [], [], [], [], []
    verts.extend(A.tolist())
    verts.extend(B.tolist())
    uvA = [uv_of(a, b, "A", R) for a, b in zip(u, v)]
    uvB = [uv_of(a, b, "B", R) for a, b in zip(u, v)]
    for tri in tris:
        faces.append(tuple(int(i) for i in tri)); fuv.append([uvA[i] for i in tri]); fmat.append(0)
        rt = (int(tri[0]) + n, int(tri[2]) + n, int(tri[1]) + n)
        faces.append(rt); fuv.append([uvB[i - n] for i in rt]); fmat.append(0)

    # outline walls
    rng = np.random.default_rng(abs(hash(name)) % 2**32)
    ring = []  # per outline vertex: list of vertex indices from A to B
    brk_len = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(ob, axis=0), axis=1))])
    for i in range(nb):
        ti = t[i] / 2
        if is_break[i]:
            # rough broken face: straight across the shell, with a jagged middle
            j = rng.uniform(-0.25, 0.25) * t[i]
            ids = [i]
            p = mid[i] + O3[i] * j
            ids.append(len(verts)); verts.append(p.tolist())
            ids.append(i + n)
            ring.append(("break", ids))
        else:
            ids = [i]
            for k in range(1, RIM_SEG):
                ph = math.pi * k / RIM_SEG
                p = mid[i] + nrm[i] * (ti * math.cos(ph)) + O3[i] * (ti * math.sin(ph) * 0.85)
                ids.append(len(verts)); verts.append(p.tolist())
            ids.append(i + n)
            ring.append(("rim", ids))
    for i in range(nb):
        j = (i + 1) % nb
        ka, ia = ring[i]
        kb, ib = ring[j]
        both_break = is_break[i] and is_break[j]
        if both_break:
            # break wall (material 1), uv: along the break x across the thickness
            for k in range(len(ia) - 1):
                q = (ia[k], ib[k], ib[k + 1], ia[k + 1])
                # wall winding: outline ccw, A at k=0 -> outward face
                faces.append(q[::-1] if True else q)
                s0, s1 = brk_len[i] / 0.02, brk_len[j] / 0.02
                f = [(s0, k / 2), (s1, k / 2), (s1, (k + 1) / 2), (s0, (k + 1) / 2)]
                fuv.append(f[::-1]); fmat.append(1); sharp_faces.append(len(faces) - 1)
            continue
        # rim (or a rim/break junction): use the rim profile, resampled to match
        ra = ia if ka == "rim" else [ia[0]] + [ia[1]] * (RIM_SEG - 1) + [ia[-1]]
        rb = ib if kb == "rim" else [ib[0]] + [ib[1]] * (RIM_SEG - 1) + [ib[-1]]
        for k in range(RIM_SEG):
            q = (ra[k], rb[k], rb[k + 1], ra[k + 1])
            if len(set(q)) < 4:
                q = tuple(dict.fromkeys(q))
                if len(q) < 3:
                    continue
            faces.append(q[::-1])
            # uv: A-side half of the profile samples side A at the edge, the rest side B
            side = "A" if k < RIM_SEG / 2 else "B"
            push = 1.0 + 0.004 * (k + 0.5)
            fu = []
            for vi in q[::-1]:
                # outline index of this vertex
                oi = i if vi in ra else j
                fu.append(uv_of(ob[oi, 0] * push, ob[oi, 1] * push, side, R))
            fuv.append(fu); fmat.append(0)

    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(x) for x in verts], [], faces)
    me.update()
    uvl = me.uv_layers.new(name="UVMap")
    for poly, fu in zip(me.polygons, fuv):
        for li, uvv in zip(poly.loop_indices, fu):
            uvl.data[li].uv = uvv
    for poly, m in zip(me.polygons, fmat):
        poly.material_index = m
        poly.use_smooth = True
    ob_ = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob_)
    # sharp edges around the broken walls
    if sharp_faces:
        import bmesh
        bm = bmesh.new(); bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        sf = set(sharp_faces)
        for e in bm.edges:
            fs = [f.index in sf for f in e.link_faces]
            if len(fs) == 2 and fs[0] != fs[1]:
                e.smooth = False
        bm.to_mesh(me); bm.free()
    return ob_, dict(pts=pts, tris=tris, nb=nb, mid=mid, nrm=nrm, t=t, outline=ob, is_break=is_break)


def fracture_line(ck, rng, offset=0.0, tilt=0.0, rough=0.0012, wander=0.003):
    """Jagged rim-to-rim break running roughly along the ridge (u ~ 0) across both layers.
    Returns (K,2) points from the bottom of the disc (v < 0) to the top (v > 0)."""
    R = ck.p["R"] * 1.12
    vs = np.linspace(-R, R, 181)
    # low-frequency meander + small zigzag
    u = offset + tilt * vs
    for k in range(1, 5):
        u += rng.normal() * wander / k * np.sin(k * np.pi * (vs / R + 1) / 2 + rng.uniform(0, 6.28))
    zig = np.cumsum(rng.normal(size=len(vs))) * rough * 0.14
    zig -= np.linspace(zig[0], zig[-1], len(vs))
    # a brittle wafer breaks in short straight runs with small steps, not a sawtooth
    chip = np.repeat(rng.normal(size=len(vs) // 7 + 1), 7)[:len(vs)] * rough * 0.2
    u += zig + chip
    pts = np.stack([u, vs], 1)
    # clip to the disc (keep the part inside, extend ends exactly to the rim later)
    r = np.hypot(pts[:, 0], pts[:, 1])
    rr = ck.rim_radius(np.arctan2(pts[:, 1], pts[:, 0]))
    ins = np.where(r < rr)[0]
    i0, i1 = ins[0], ins[-1]
    return pts[max(i0 - 1, 0):i1 + 2]
