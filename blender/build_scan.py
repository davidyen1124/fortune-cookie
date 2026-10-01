"""Prepare the scanned fortune cookie for the web page.

Source: "Fortune Cookie" by Frank McMains (photogrammetry, ~350 photos, Metashape),
https://sketchfab.com/3d-models/fortune-cookie-47018f5b63ef477484f5e25debb484df, CC BY 4.0,
as mirrored in Objaverse (art/scan/fortune_cookie_mcmains.glb).

  - finds the cookie's own frame (across the arms, shell normal, toward the tips) from its
    mirror symmetry, and scales it to life size using the slip in the scan (16 mm wide)
  - lifts the scanned slip stub off the mesh (the page puts its own printed slip there)
  - cuts the shell into two hollow halves along a chipped line across the notch, several
    different ways, with a wall thickness and a broken edge
  - writes meshes -> public/assets/cookie.glb, the photo texture -> blender/baked, and
    colliders, mass properties, break lines and the slip's place -> public/assets/cookie.json

Run:  Blender -b -P build_scan.py
"""
import bpy, bmesh, sys, os, math, json
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "art", "scan", "fortune_cookie_mcmains.glb")
ASSETS = os.path.join(ROOT, "public", "assets")
BAKED = os.path.join(HERE, "baked")
os.makedirs(BAKED, exist_ok=True)
MASS = 0.0080        # kg
WALL = 0.0013        # shell thickness (m)
SLIP_W = 0.0141      # the slip in the scan sets the scale (a narrow slip: the cookie comes out 54 mm across)
N_VARIANTS = 4
TARGET_TRIS = 26000


def to_three(p):
    """cookie frame here is already x across, y up (shell normal), z toward the tips"""
    return np.asarray(p)


def principal(I):
    ev, R = np.linalg.eigh(I)
    if np.linalg.det(R) < 0:
        R[:, 0] *= -1
    tr = R[0, 0] + R[1, 1] + R[2, 2]
    if tr > 0:
        S = math.sqrt(tr + 1.0) * 2
        q = [(R[2, 1] - R[1, 2]) / S, (R[0, 2] - R[2, 0]) / S, (R[1, 0] - R[0, 1]) / S, 0.25 * S]
    else:
        i = int(np.argmax([R[0, 0], R[1, 1], R[2, 2]])); j, k = (i + 1) % 3, (i + 2) % 3
        S = math.sqrt(1.0 + R[i, i] - R[j, j] - R[k, k]) * 2
        q = [0, 0, 0, 0]
        q[i] = 0.25 * S; q[j] = (R[j, i] + R[i, j]) / S; q[k] = (R[k, i] + R[i, k]) / S; q[3] = (R[k, j] - R[j, k]) / S
    return [float(x) for x in ev], [float(x) for x in q]


def shell_mass(v, tris, mass):
    """mass properties of a thin shell: mass spread evenly over its surface"""
    a, b, c = v[tris[:, 0]], v[tris[:, 1]], v[tris[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    cen = (a + b + c) / 3
    A = area.sum()
    com = (cen * area[:, None]).sum(0) / A
    m = area / A * mass
    r = cen - com
    I = np.zeros((3, 3))
    for i in range(3):
        for j in range(3):
            I[i, j] = -(m * r[:, i] * r[:, j]).sum()
    I += np.eye(3) * (m * (r * r).sum(1)).sum()
    return A, com, I


def hulls(points, cell=0.011, max_pts=30, rng=None):
    """convex pieces: the surface points grouped in a coarse 3-D grid"""
    keys = {}
    idx = np.floor(points / cell).astype(int)
    for i, k in enumerate(map(tuple, idx)):
        keys.setdefault(k, []).append(i)
    out = []
    for ids in keys.values():
        P = points[ids]
        if len(P) < 5:
            continue
        if len(P) > max_pts:
            d = rng.normal(size=(36, 3)); d /= np.linalg.norm(d, axis=1, keepdims=True)
            ext = np.unique(np.argmax(P @ d.T, axis=0))
            P = P[ext]
        if np.linalg.matrix_rank(P - P.mean(0), tol=1e-7) < 3:
            continue
        out.append(P)
    return out


def mesh_np(me):
    v = np.array([x.co[:] for x in me.vertices])
    me.calc_loop_triangles()
    t = np.array([lt.vertices[:] for lt in me.loop_triangles])
    return v, t


def main():
    rng = np.random.default_rng(7)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    sc = bpy.context.scene
    ob = [o for o in sc.objects if o.type == "MESH"][0]
    # bake the import hierarchy's transform into the mesh
    bpy.context.view_layer.objects.active = ob
    for o in sc.objects:
        o.select_set(o == ob)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(sc.objects):
        if o != ob:
            bpy.data.objects.remove(o)
    me = ob.data
    img = [i for i in bpy.data.images if i.size[0] > 0][0]
    W, H = img.size
    tex = np.array(img.pixels[:], np.float32).reshape(H, W, 4)[..., :3]

    # ---- which faces are the paper slip: unsaturated in the photo texture
    uvl = me.uv_layers[0].data
    bm = bmesh.new(); bm.from_mesh(me)
    # the scan comes as separate texture islands: weld them into one continuous surface
    # (UVs live on the face corners, so the seams keep their texture coordinates)
    n_before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-5)
    print("welded", n_before, "->", len(bm.verts), "vertices")
    bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
    uv_layer = bm.loops.layers.uv[0]
    sat = np.zeros(len(bm.faces))
    for f in bm.faces:
        uv = sum((l[uv_layer].uv for l in f.loops), Vector((0, 0))) / len(f.loops)
        px = tex[min(H - 1, max(0, int(uv.y * H))), min(W - 1, max(0, int(uv.x * W)))]
        mx, mn = px.max(), px.min()
        sat[f.index] = (mx - mn) / (mx + 1e-6)
    paper = sat < 0.28
    # keep only the big connected patch of paper (not a pale crumb somewhere on the cookie)
    seen = np.zeros(len(bm.faces), bool); best = []
    for f in bm.faces:
        if not paper[f.index] or seen[f.index]:
            continue
        stack, comp = [f], []
        seen[f.index] = True
        while stack:
            g = stack.pop(); comp.append(g.index)
            for e in g.edges:
                for h in e.link_faces:
                    if paper[h.index] and not seen[h.index]:
                        seen[h.index] = True; stack.append(h)
        if len(comp) > len(best):
            best = comp
    slip_faces = set(best)
    slip_verts = np.array([v.co[:] for v in {v for i in slip_faces for v in bm.faces[i].verts}])
    print("slip faces", len(slip_faces), "of", len(bm.faces))

    # ---- the cookie's frame, from the cookie without the slip
    cv = np.array([v.co[:] for v in bm.verts if not all(f.index in slip_faces for f in v.link_faces)])
    c0 = cv.mean(0)
    w, ev = np.linalg.eigh(np.cov((cv - c0).T))
    up = ev[:, 0]                      # thinnest direction: the normal of the fold plane
    e1, e2 = ev[:, 1], ev[:, 2]
    P2 = np.stack([(cv - c0) @ e1, (cv - c0) @ e2], 1)
    # mirror symmetry in the fold plane: the notch axis is the best mirror line
    grid = 64; ext = np.abs(P2).max() * 1.05

    def occ(p):
        g = np.zeros((grid, grid), bool)
        ij = np.clip(((p / ext * 0.5 + 0.5) * grid).astype(int), 0, grid - 1)
        g[ij[:, 0], ij[:, 1]] = True
        return g
    base = occ(P2)
    best_a, best_s = 0, -1
    for a in np.linspace(0, np.pi, 180, endpoint=False):
        d = np.array([np.cos(a), np.sin(a)])
        refl = 2 * np.outer(P2 @ d, d) - P2
        s = (occ(refl) & base).sum() / base.sum()
        if s > best_s:
            best_a, best_s = a, s
    ax = np.array([np.cos(best_a), np.sin(best_a)])       # along the notch axis, in the plane
    perp = np.array([-ax[1], ax[0]])
    # the tips are at the end where the middle is empty (the notch)
    t = P2 @ ax; sdev = P2 @ perp
    far = t > np.percentile(t, 80); near = t < np.percentile(t, 20)
    gap_far = np.abs(sdev[far]).min() if far.any() else 0
    gap_near = np.abs(sdev[near]).min() if near.any() else 0
    if gap_near > gap_far:
        ax = -ax; perp = -perp
    zc = e1 * ax[0] + e2 * ax[1]                           # toward the tips
    # top = the side the scan's "up" is on; keep a right-handed frame x = y cross z
    yc = up if up[1] > 0 else -up
    xc = np.cross(yc, zc)
    R = np.stack([xc, yc, zc], 0)                          # world -> cookie
    print("symmetry score %.3f" % best_s)

    # ---- scale: the slip is 16 mm wide
    sv = (slip_verts - c0) @ R.T
    sc0 = sv.mean(0)
    sw, sev = np.linalg.eigh(np.cov((sv - sc0).T))
    s_n, s_w, s_l = sev[:, 0], sev[:, 1], sev[:, 2]        # normal, across, along the slip
    width = np.ptp((sv - sc0) @ s_w)
    # the stub is cut off square: its width is the extent across its shorter in-plane axis
    scale = SLIP_W / width
    print("slip width in scan units %.4f -> scale %.4f" % (width, scale))

    for v in bm.verts:
        v.co = Vector(((np.array(v.co[:]) - c0) @ R.T) * scale)
    bm.normal_update()
    sv = sv * scale; sc0 = sc0 * scale
    # the slip points out of the cookie: away from the cookie's middle
    if (sc0 @ s_l) < 0:
        s_l = -s_l
    s_w = np.cross(s_n, s_l)
    along = (sv - sc0) @ s_l
    stub = dict(center=sc0, along=s_l, across=s_w, normal=s_n, lo=float(along.min()), hi=float(along.max()))
    print("stub length %.1f mm, width %.1f mm" % ((stub["hi"] - stub["lo"]) * 1000, np.ptp((sv - sc0) @ s_w) * 1000))

    # ---- take the slip off the cookie: the paper-coloured patch, plus its shaded edges and
    # underside (anything in the slip's own slab that is pale or lies flat in its plane)
    bm.faces.ensure_lookup_table()
    acr = (sv - sc0) @ s_w
    gone = []
    for f in bm.faces:
        if f.index in slip_faces:
            gone.append(f); continue
        d = np.array(f.calc_center_median()[:]) - sc0
        a, b, n = d @ s_l, d @ s_w, d @ s_n
        if a < stub["lo"] - 0.001 or a > stub["hi"] + 0.002 or abs(b) > np.abs(acr).max() + 0.0015 or abs(n) > 0.003:
            continue
        flat = abs(np.array(f.normal[:]) @ s_n) > 0.75
        if sat[f.index] < 0.5 or (flat and a > stub["lo"] + 0.004):
            gone.append(f)
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    # and any small loose flakes left behind
    bm.faces.ensure_lookup_table()
    seen = set(); comps = []
    for f in bm.faces:
        if f in seen:
            continue
        stack = [f]; seen.add(f); comp = []
        while stack:
            g = stack.pop(); comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h); stack.append(h)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    print("components", [len(c) for c in comps[:8]])
    loose = [c for c in comps[1:] if len(c) < 400]
    for comp in loose:
        bmesh.ops.delete(bm, geom=comp, context="FACES")
    print("removed", len(gone), "slip faces and", len(loose), "loose bits")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    me.update()

    # ---- lighter mesh for the web (the detail is in the photo texture)
    ntri = len(me.polygons)
    if ntri > TARGET_TRIS:
        mod = ob.modifiers.new("dec", "DECIMATE"); mod.ratio = TARGET_TRIS / ntri
        bpy.ops.object.modifier_apply(modifier="dec")
    for p in me.polygons:
        p.use_smooth = True
    v, tris = mesh_np(me)
    size = v.max(0) - v.min(0)
    print("cookie size (mm): across %.1f, thick %.1f, deep %.1f; tris %d" % (size[0] * 1000, size[1] * 1000, size[2] * 1000, len(tris)))

    crust = bpy.data.materials.new("crust"); inner = bpy.data.materials.new("inner"); crumb = bpy.data.materials.new("crumb")
    me.materials.clear()
    for m in (crust, inner, crumb):
        me.materials.append(m)
    ob.name = "Cookie"; me.name = "Cookie"

    # photo texture for the page
    img.filepath_raw = os.path.join(BAKED, "scan_color.png"); img.file_format = "PNG"; img.save()

    meta = dict(mass=MASS, variants=[], source="Fortune Cookie by Frank McMains, CC BY 4.0, https://sketchfab.com/3d-models/fortune-cookie-47018f5b63ef477484f5e25debb484df",
                note="y up (top shell), z toward the tips, x across the arms. Each object's origin is its centre of mass.")
    coll = bpy.data.collections.new("export"); sc.collection.children.link(coll)

    def finish(o, mass, extra_pts=None):
        vv, tt = mesh_np(o.data)
        A, com, I = shell_mass(vv, tt, mass)
        for x in o.data.vertices:
            x.co -= Vector(com)
        o.location = (0, 0, 0)
        pts = vv - com
        hs = hulls(pts, rng=rng)
        ev_, q = principal(I)
        return dict(name=o.name, mass=float(mass), com=[float(x) for x in com], principal=ev_, frame=q,
                    hulls=[h.round(5).tolist() for h in hs]), A

    # ---- landmarks: the apex of the notch and the back of the cookie on the symmetry line
    mid = np.abs(v[:, 0]) < 0.0015
    zb = v[mid, 2]
    back = np.array([0.0, 0.0, zb.min()])
    # apex: on the symmetry line, the frontmost surface point (the notch ends there)
    apex = np.array([0.0, 0.0, zb.max()])

    # ---- the break: a chipped line across the notch, from the apex to the back rim
    area_all, com_w, _ = shell_mass(v, tris, MASS)
    variants = []
    for k in range(N_VARIANTS):
        r = np.random.default_rng(100 + k)
        off = r.uniform(-0.002, 0.002); tilt = r.uniform(-0.08, 0.08); lean = r.uniform(-0.12, 0.12)
        ph = r.uniform(0, 6.28, 4); am = r.normal(size=4) * 0.0012
        cen = v[tris].mean(1)

        def cut(p):
            z, y = p[:, 2], p[:, 1]
            x = off + tilt * z + lean * y
            for i in range(4):
                x = x + am[i] / (i + 1) * np.sin((i + 1) * 60 * z + ph[i]) + 0.0004 * np.sin((i + 2) * 190 * y + ph[i] * 2)
            return x
        left = cen[:, 0] < cut(cen)
        pieces = []
        brk = None
        for side, mask in (("L", left), ("R", ~left)):
            pm = me.copy(); po = bpy.data.objects.new(f"V{k}_{side}", pm); pm.name = po.name
            coll.objects.link(po)
            b2 = bmesh.new(); b2.from_mesh(pm); b2.faces.ensure_lookup_table()
            # faces are triangles after decimation; mask is per loop-triangle = per face
            cen_f = np.array([f.calc_center_median()[:] for f in b2.faces])
            keep = (cen_f[:, 0] < cut(cen_f)) if side == "L" else (cen_f[:, 0] >= cut(cen_f))
            bmesh.ops.delete(b2, geom=[f for f, kp in zip(b2.faces, keep) if not kp], context="FACES")
            # stray islands (a few triangles on the wrong side of a wiggle) go with the crumbs
            b2.faces.ensure_lookup_table()
            seen = set(); comps = []
            for f in b2.faces:
                if f in seen:
                    continue
                stack = [f]; seen.add(f); comp = []
                while stack:
                    g = stack.pop(); comp.append(g)
                    for e in g.edges:
                        for h in e.link_faces:
                            if h not in seen:
                                seen.add(h); stack.append(h)
                comps.append(comp)
            comps.sort(key=len, reverse=True)
            for comp in comps[1:]:
                if len(comp) < 0.05 * len(comps[0]):
                    bmesh.ops.delete(b2, geom=comp, context="FACES")
            if side == "L":
                be = [e for e in b2.edges if e.is_boundary]
                brk = np.array([((e.verts[0].co + e.verts[1].co) / 2)[:] for e in be])
            b2.to_mesh(pm); b2.free()
            # wall thickness and a broken edge
            bpy.context.view_layer.objects.active = po
            for o in sc.objects:
                o.select_set(o == po)
            n0 = len(pm.vertices)
            sm = po.modifiers.new("wall", "SOLIDIFY")
            sm.thickness = WALL; sm.offset = -1; sm.use_even_offset = False; sm.use_rim = True
            sm.material_offset = 1; sm.material_offset_rim = 2
            sm.thickness_clamp = 0.8
            bpy.ops.object.modifier_apply(modifier="wall")
            # broken edge UVs: along the edge / across the wall
            uv = pm.uv_layers[0].data
            for poly in pm.polygons:
                poly.use_smooth = poly.material_index != 2
                if poly.material_index == 2:
                    for li in poly.loop_indices:
                        vi = pm.loops[li].vertex_index
                        co = pm.vertices[vi].co
                        uv[li].uv = ((co.z * 37 + co.y * 53) % 1.0, 0.08 if vi < n0 else 0.92)
            share = float(mask.sum()) / len(mask)
            pieces.append((po, share))
        infos = []
        for po, share in pieces:
            info, _ = finish(po, MASS * share)
            infos.append(info)
        keep_idx = rng.choice(len(brk), size=min(60, len(brk)), replace=False)
        variants.append(dict(pieces=infos, brk=(brk[keep_idx] - com_w).round(5).tolist()))
        print("variant", k, [(i["name"], round(i["mass"] * 1000, 2), len(i["hulls"])) for i in infos])

    coll.objects.link(ob)
    sc.collection.objects.unlink(ob) if ob.name in sc.collection.objects else None
    whole, _ = finish(ob, MASS)
    meta["whole"] = whole
    meta["variants"] = variants
    com_w = np.array(whole["com"])
    meta["hinge"] = dict(back=(back - com_w).round(5).tolist(), apex=(apex - com_w).round(5).tolist())
    meta["slip"] = dict(center=(stub["center"] - com_w).round(5).tolist(), along=stub["along"].round(4).tolist(),
                        across=stub["across"].round(4).tolist(), normal=stub["normal"].round(4).tolist(),
                        lo=round(stub["lo"], 5), hi=round(stub["hi"], 5))
    meta["size"] = [float(x) for x in size]

    # ---- crumbs: small flakes carrying a bit of the photo texture
    vv, _ = mesh_np(ob.data)
    uvs = np.array([d.uv[:] for d in ob.data.uv_layers[0].data])
    crumbs = []
    for i in range(10):
        r = np.random.default_rng(500 + i)
        s = r.uniform(0.0012, 0.0032); th = r.uniform(0.0006, 0.0011); kk = r.integers(5, 8)
        ang = np.sort(r.uniform(0, 2 * np.pi, kk)); rad = s * r.uniform(0.55, 1.0, kk)
        poly = np.stack([rad * np.cos(ang), rad * np.sin(ang)], 1)
        top = np.column_stack([poly[:, 0], np.full(kk, th / 2) + r.normal(0, th * 0.12, kk), poly[:, 1]])
        bot = np.column_stack([poly[:, 0] * 0.92, np.full(kk, -th / 2) + r.normal(0, th * 0.12, kk), poly[:, 1] * 0.92])
        verts = np.concatenate([top, bot])
        faces = [list(range(kk))[::-1], list(range(kk, 2 * kk))]
        mats = [0, 1]
        for j in range(kk):
            a, b = j, (j + 1) % kk
            faces.append([a, b, b + kk, a + kk]); mats.append(2)
        cm = bpy.data.meshes.new(f"Crumb{i}")
        cm.from_pydata([tuple(p) for p in verts], [], faces)
        for m in (crust, inner, crumb):
            cm.materials.append(m)
        ul = cm.uv_layers.new(name="UVMap")
        base = uvs[r.integers(len(uvs))]
        for poly_, m in zip(cm.polygons, mats):
            poly_.material_index = m
            for li in poly_.loop_indices:
                p = verts[cm.loops[li].vertex_index]
                ul.data[li].uv = (base[0] + p[0] * 2, base[1] + p[2] * 2) if m < 2 else (r.uniform(0, 1), 0.5 + p[1] / th * 0.4)
        co = bpy.data.objects.new(f"Crumb{i}", cm); coll.objects.link(co)
        b3 = bmesh.new(); b3.from_mesh(cm); bmesh.ops.recalc_face_normals(b3, faces=b3.faces); b3.to_mesh(cm); b3.free()
        vol = s * s * th * 2
        crumbs.append(dict(name=co.name, mass=float(vol * 800), hull=verts.round(6).tolist()))
    meta["crumbs"] = crumbs

    for o in sc.objects:
        o.select_set(o.name in coll.objects)
    bpy.ops.export_scene.gltf(filepath=os.path.join(ASSETS, "cookie.glb"), use_selection=True, export_format="GLB",
                              export_yup=False, export_apply=True, export_texcoords=True, export_normals=True,
                              export_tangents=False, export_materials="EXPORT", export_image_format="NONE", export_extras=False)
    with open(os.path.join(ASSETS, "cookie.json"), "w") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "scan.blend"))
    print("exported")


main()
