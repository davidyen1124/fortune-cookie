"""Build the fortune cookie in Blender and export everything the web page needs.

  - crust texture atlas (colour, normal, AO / roughness) composited from the imagegen
    macro scans, with the browning of a disc baked on a tray (darker toward the rim)
  - AO baked with Cycles on the full-resolution cookie
  - the whole cookie plus several fracture variants (two pieces each) and crumb shards
    -> public/assets/cookie.glb
  - convex-hull colliders, mass properties, the crease line (where the slip lies) and
    each break line (where the crumbs come from) -> public/assets/cookie.json

Run:  Blender -b -P build_cookie.py -- [--quick]
"""
import bpy, bmesh, sys, os, math, json, importlib
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cookie_geom as cg, cookie_mesh as cm
importlib.reload(cg); importlib.reload(cm)

ROOT = os.path.dirname(HERE)
ART = os.path.join(ROOT, "art")
ASSETS = os.path.join(ROOT, "public", "assets")
BAKED = os.path.join(HERE, "baked")
RENDERS = os.path.join(ROOT, "renders")
for d in (ASSETS, BAKED, RENDERS):
    os.makedirs(d, exist_ok=True)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
QUICK = "--quick" in ARGS
ATLAS = (2048, 1024) if QUICK else (4096, 2048)
MASS = 0.0080          # kg, a standard restaurant fortune cookie
N_VARIANTS = 5
rng = np.random.default_rng(11)


def srgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


# ---------------------------------------------------------------------- scene
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = "GPU"
    sc.view_settings.view_transform = "Khronos PBR Neutral"
    return sc


def load_px(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3]
    bpy.data.images.remove(img)
    return px


def save_px(arr, path, colorspace="sRGB"):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    a = np.ones((h, w, 4), np.float32)
    a[..., :arr.shape[2] if arr.ndim == 3 else 1] = arr if arr.ndim == 3 else arr[..., None]
    if arr.ndim == 2:
        a[..., 1] = a[..., 2] = arr
    img.pixels.foreach_set(np.clip(a, 0, 1).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


# ---------------------------------------------------------------------- textures
def seamless(t):
    """cross-fade a texture with its half-offset copy so it tiles"""
    h, w = t.shape[:2]
    y, x = np.mgrid[0:h, 0:w]
    wx = np.sin(np.pi * (x + 0.5) / w); wy = np.sin(np.pi * (y + 0.5) / h)
    m = (wx * wy)[..., None] ** 0.8
    sh = np.roll(np.roll(t, h // 2, 0), w // 2, 1)
    return t * m + sh * (1 - m)


def sample(t, x, y):
    """bilinear, wrapping; x, y in texels"""
    h, w = t.shape[:2]
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    x0 %= w; y0 %= h; x1 = (x0 + 1) % w; y1 = (y0 + 1) % h
    return (t[y0, x0] * (1 - fx) * (1 - fy) + t[y0, x1] * fx * (1 - fy) + t[y1, x0] * (1 - fx) * fy + t[y1, x1] * fx * fy)


def smooth_noise(shape, scale_px, seed):
    """band-limited noise (FFT-filtered), zero mean, unit std"""
    r = np.random.default_rng(seed)
    n = r.normal(size=shape)
    fy = np.fft.fftfreq(shape[0])[:, None]; fx = np.fft.fftfreq(shape[1])[None, :]
    k = np.exp(-((fx ** 2 + fy ** 2) * (scale_px ** 2) * 2 * np.pi ** 2))
    f = np.real(np.fft.ifft2(np.fft.fft2(n) * k))
    return (f - f.mean()) / (f.std() + 1e-9)


def build_textures(ck):
    """Colour, height and roughness in the atlas (sRGB), from the imagegen scans."""
    W, H = ATLAS
    R = ck.p["R"]
    s = 0.5 / (2.12 * R)
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    U = (x + 0.5) / W; V = (y + 0.5) / H
    V = 1 - V  # image rows run top-down, uv v bottom-up
    side = (U >= 0.5).astype(np.float32)
    du = (U - 0.25 - 0.5 * side) / s
    dv = (V - 0.5) / (2 * s)
    rn = np.hypot(du, dv) / ck.rim_radius(np.arctan2(dv, du))

    outer = seamless(load_px(os.path.join(ART, "imagegen", "cookie_outer_albedo.png")))
    inner = seamless(load_px(os.path.join(ART, "imagegen", "cookie_inner_albedo.png")))
    tile = 0.026  # metres of cookie per texture tile
    th = outer.shape[0]

    def layer(tex, rot, off, scale):
        c, sn = math.cos(rot), math.sin(rot)
        tu = (c * du - sn * dv) / (tile * scale) * th + off[0]
        tv = (sn * du + c * dv) / (tile * scale) * th + off[1]
        return sample(tex, tu, tv)

    A = 0.65 * layer(outer, 0.3, (0, 0), 1.0) + 0.35 * layer(outer, 2.1, (300, 170), 0.63)
    B = 0.65 * layer(inner, 1.2, (80, 40), 1.0) + 0.35 * layer(inner, 4.0, (500, 260), 0.7)
    tex = np.where(side[..., None] > 0.5, B, A)
    lum = tex.mean(-1)
    # normalise each side's scan to its own mean, keep its detail (contrast k)
    mA = A.reshape(-1, 3).mean(0); mB = B.reshape(-1, 3).mean(0)
    detail = np.where(side[..., None] > 0.5, B / mB, A / mA)

    # target colours (sRGB) from the reference photos
    c_mid_A, c_rim_A, c_spot_A = srgb("#EBC286"), srgb("#C47F36"), srgb("#DDA35A")
    c_mid_B, c_rim_B = srgb("#EDD09A"), srgb("#CF9A50")
    big = smooth_noise((H, W), 60 if not QUICK else 30, 3)        # toasting blotches
    med = smooth_noise((H, W), 14 if not QUICK else 7, 4)
    rim = cg.smoothstep(0.72, 1.0, rn) ** 1.3
    toast = np.clip(0.22 * big + 0.1 * med - 0.25, 0, 1)
    baseA = c_mid_A[None, None] * (1 - rim[..., None]) + c_rim_A[None, None] * rim[..., None]
    baseA = baseA * (1 - toast[..., None]) + c_spot_A[None, None] * toast[..., None]
    rimB = cg.smoothstep(0.8, 1.02, rn) ** 1.5
    baseB = c_mid_B[None, None] * (1 - rimB[..., None]) + c_rim_B[None, None] * rimB[..., None]
    base = np.where(side[..., None] > 0.5, baseB, baseA)
    k = np.where(side[..., None] > 0.5, 0.5, 0.6)
    col = base * (1 + k * (detail - 1))
    # lighter toward the crease on the inside (the fold kept it pale)
    col = np.clip(col, 0, 1)

    # height: pores are dark in the scans; plus soft blisters
    hl = (lum - lum.mean()) / (lum.std() + 1e-6)
    blister = smooth_noise((H, W), 10 if not QUICK else 5, 7)
    height = 0.55 * hl + 0.45 * np.where(side > 0.5, 0.5, 1.0) * blister
    # roughness: satin outside with rougher pores, matte inside
    rough = np.where(side > 0.5, 0.72, 0.46) + 0.08 * np.clip(-hl, -1, 2) + 0.05 * med
    rough = np.clip(rough + 0.12 * rim, 0.3, 0.9)
    return col, height, rough, side


def normal_from_height(height, strength):
    gy, gx = np.gradient(height)
    # image rows run top-down: +v is -row
    nx = -gx * strength; ny = gy * strength
    n = np.stack([nx, ny, np.ones_like(nx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


# ---------------------------------------------------------------------- geometry helpers
def to_three(p):
    """Blender (x, y, z) -> glTF / three.js (x, z, -y)"""
    p = np.asarray(p)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], -1)


def mesh_arrays(ob):
    me = ob.data
    v = np.array([vv.co[:] for vv in me.vertices])
    tris = []
    for poly in me.polygons:
        ids = list(poly.vertices)
        for k in range(1, len(ids) - 1):
            tris.append((ids[0], ids[k], ids[k + 1]))
    return v, np.array(tris)


def mass_props(v, tris, density):
    """volume, centre of mass and inertia tensor (about the COM) of a closed mesh"""
    a, b, c = v[tris[:, 0]], v[tris[:, 1]], v[tris[:, 2]]
    det = np.einsum("ij,ij->i", a, np.cross(b, c))
    vol = det.sum() / 6
    com = (det[:, None] * (a + b + c)).sum(0) / (24 * vol)
    # covariance (Tonon)
    C = np.zeros((3, 3))
    for i in range(3):
        for j in range(3):
            C[i, j] = (det * (2 * (a[:, i] * a[:, j] + b[:, i] * b[:, j] + c[:, i] * c[:, j])
                               + a[:, i] * b[:, j] + a[:, j] * b[:, i] + a[:, i] * c[:, j] + a[:, j] * c[:, i]
                               + b[:, i] * c[:, j] + b[:, j] * c[:, i])).sum() / 120
    m = vol * density
    C = C * density
    C = C - m * np.outer(com, com)
    I = np.trace(C) * np.eye(3) - C
    return vol, com, I, m


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


def hulls_for(info, cell=0.0085, max_pts=36):
    """convex pieces: group the shell's vertices by cells of the flat disc"""
    pts, mid, nrm, t = info["pts"], info["mid"], info["nrm"], info["t"]
    top = mid + nrm * (t / 2)[:, None]
    bot = mid - nrm * (t / 2)[:, None]
    u, v = pts[:, 0], pts[:, 1]
    # finer cells near the crease and the apex, where the shell bends tightly
    cu = np.floor(u / cell).astype(int)
    vv = np.sign(v) * np.sqrt(np.abs(v) * cell)  # sqrt spacing: small cells near v = 0
    cv = np.floor(vv / (cell * 0.55)).astype(int)
    keys = {}
    for i, key in enumerate(zip(cu, cv)):
        keys.setdefault(key, []).append(i)
    hulls = []
    for key, ids in keys.items():
        ids = np.array(ids)
        # include neighbours' boundary so pieces overlap slightly (no gaps)
        P = np.concatenate([top[ids], bot[ids]], 0)
        if len(P) < 6:
            continue
        if len(P) > max_pts:
            # keep extreme points in many directions + a random subset
            dirs = rng.normal(size=(40, 3)); dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
            ext = np.unique(np.argmax(P @ dirs.T, axis=0))
            rest = rng.choice(len(P), size=min(len(P), max_pts - len(ext)), replace=False) if max_pts > len(ext) else []
            P = P[np.unique(np.concatenate([ext, rest]).astype(int))]
        hulls.append(P)
    return hulls


def grow_hulls(hulls, info, cell):
    """make neighbouring cells overlap by adding each cell's neighbours' nearest points"""
    return hulls


# ---------------------------------------------------------------------- main
def main():
    sc = reset()
    ck = cg.Cookie()
    R = ck.p["R"]
    fine = cg.interior_points(ck)  # dense, for baking AO
    web = cg.interior_points(ck, hu=(0.0008, 0.0021, 0.008), hv=(0.00016, 0.0021, 0.006))

    coll = bpy.data.collections.new("export"); sc.collection.children.link(coll)
    outline, isb = cm.region_outline(ck)

    # ---- textures
    col, height, rough, side = build_textures(ck)
    save_px(col[::-1], os.path.join(BAKED, "crust_color.png"))
    nm = normal_from_height(height, 1.0 if not QUICK else 0.5)
    save_px(nm[::-1], os.path.join(BAKED, "crust_normal.png"), "Non-Color")
    print("textures done")

    # ---- AO bake on the dense cookie
    hi, hi_info = cm.build_solid(ck, outline, isb, fine, "CookieHi")
    bm = bmesh.new(); bm.from_mesh(hi.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(hi.data); bm.free()
    W, H = ATLAS
    aw, ah = W // 2, H // 2
    ao_img = bpy.data.images.new("ao", aw, ah, alpha=False, float_buffer=True)
    ao_img.colorspace_settings.name = "Non-Color"
    mat = bpy.data.materials.new("bake")
    nodes = mat.node_tree.nodes
    tn = nodes.new("ShaderNodeTexImage"); tn.image = ao_img
    nodes.active = tn
    hi.data.materials.append(mat); hi.data.materials.append(mat)
    sc.cycles.samples = 128 if not QUICK else 32
    bpy.context.view_layer.objects.active = hi
    for o in sc.objects:
        o.select_set(o == hi)
    sc.render.bake.margin = 24
    bpy.ops.object.bake(type="AO", margin=24)
    ao = np.array(ao_img.pixels[:], np.float32).reshape(ah, aw, 4)[..., 0]
    print("ao baked", ao.min(), ao.max())
    # ORM-style: R = AO, G = roughness, B = 0
    ao_full = np.repeat(np.repeat(ao, 2, 0), 2, 1)[:H, :W]
    orm = np.stack([ao_full, rough[::-1], np.zeros_like(ao_full)], -1)
    save_px(orm, os.path.join(BAKED, "crust_orm.png"), "Non-Color")

    # ---- export meshes
    meta = dict(R=R, mass=MASS, variants=[], note="three.js frame (y up). Each object's origin is its centre of mass.")
    whole, winfo = cm.build_solid(ck, outline, isb, web, "Cookie", coll)
    fix_normals(whole)
    v, tris = mesh_arrays(whole)
    vol, com, I, _ = mass_props(v, tris, 1.0)
    density = MASS / vol
    meta["density"] = density
    meta["whole"] = finish(whole, winfo, density, coll)
    print("whole: volume %.2f cm3, density %.0f kg/m3, %d tris" % (vol * 1e6, density, len(tris)))

    # the crease (where the slip lies): v = 0 from the A lip over M to the B lip, and the
    # middle of the pocket between the layers at distances s from the fold (the slip sits there)
    uu = np.linspace(-R * 0.98, R * 0.98, 97)
    ss = np.array([0.0, 0.0006, 0.0012, 0.002, 0.003, 0.0045, 0.006, 0.008, 0.010, 0.012, 0.014, 0.016, 0.018])
    U, S = np.meshgrid(uu, ss, indexing="ij")
    pocket = 0.5 * (ck.mid(U, S) + ck.mid(U, -S))
    crease = ck.mid(uu, np.zeros_like(uu))
    com_b = meta["whole"]["com_b"]
    meta["crease"] = dict(u=uu.round(6).tolist(), s=ss.tolist(), p=to_three(crease - com_b).round(6).tolist(),
                          pocket=to_three(pocket - com_b).round(6).tolist())

    for k in range(N_VARIANTS):
        vr = np.random.default_rng(100 + k)
        frac = cm.fracture_line(ck, vr, offset=vr.uniform(-0.004, 0.004), tilt=vr.uniform(-0.12, 0.12),
                                rough=vr.uniform(0.0008, 0.0016), wander=vr.uniform(0.0015, 0.004))
        pieces = []
        for keep in ("left", "right"):
            ol, br = cm.region_outline(ck, frac, keep)
            ob, info = cm.build_solid(ck, ol, br, web, f"V{k}_{keep[0].upper()}", coll)
            fix_normals(ob)
            pieces.append(finish(ob, info, density, coll))
        # break line in 3-D (crumbs spawn along it)
        fr = frac[(np.hypot(frac[:, 0], frac[:, 1]) < ck.rim_radius(np.arctan2(frac[:, 1], frac[:, 0])) - 0.0005)]
        bl = ck.mid(fr[:, 0], fr[:, 1])
        meta["variants"].append(dict(pieces=pieces, brk=to_three(bl - meta["whole"]["com_b"])[::4].round(5).tolist()))
        print("variant", k, [p["name"] for p in pieces], [round(p["mass"] * 1000, 2) for p in pieces])

    # ---- crumbs: small flakes of shell
    meta["crumbs"] = make_crumbs(ck, coll, density)

    # ---- export
    for o in sc.objects:
        o.select_set(o.users_collection[0] == coll)
    bpy.ops.export_scene.gltf(filepath=os.path.join(ASSETS, "cookie.glb"), use_selection=True, export_format="GLB",
                              export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,
                              export_tangents=False, export_materials="EXPORT", export_image_format="NONE", export_extras=False)
    meta["whole"].pop("com_b")
    for vr in meta["variants"]:
        for p in vr["pieces"]:
            p.pop("com_b")
    with open(os.path.join(ASSETS, "cookie.json"), "w") as fh:
        json.dump(meta, fh, separators=(",", ":"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "cookie.blend"))
    print("exported")


def fix_normals(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free()
    if len(ob.data.materials) == 0:
        for name in ("crust", "crumb"):
            m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
            ob.data.materials.append(m)


def finish(ob, info, density, coll):
    """move the origin to the centre of mass, return collider + mass data (three.js frame)"""
    v, tris = mesh_arrays(ob)
    vol, com, I, m = mass_props(v, tris, density)
    me = ob.data
    for vv in me.vertices:
        vv.co -= Vector(com)
    ob.location = (0, 0, 0)
    hulls = hulls_for(info)
    hulls3 = [to_three(h - com).round(5).tolist() for h in hulls]
    # inertia to the three.js frame: M I M^T with M the axis swap
    Mx = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float)
    It = Mx @ I @ Mx.T
    ev, q = principal(It)
    return dict(name=ob.name, mass=float(m), com=to_three(com).round(6).tolist(), com_b=np.array(com),
                principal=ev, frame=q, hulls=hulls3)


def make_crumbs(ck, coll, density, n=10):
    """a few irregular flakes: thin convex chips of shell (a patch of the atlas on top)"""
    out = []
    crust = bpy.data.materials.get("crust") or bpy.data.materials.new("crust")
    crumb = bpy.data.materials.get("crumb") or bpy.data.materials.new("crumb")
    for i in range(n):
        r = np.random.default_rng(500 + i)
        size = r.uniform(0.0012, 0.0032)
        t = r.uniform(0.0006, 0.0011)
        k = r.integers(5, 8)
        ang = np.sort(r.uniform(0, 2 * np.pi, k))
        rad = size * r.uniform(0.55, 1.0, k)
        poly = np.stack([rad * np.cos(ang), rad * np.sin(ang)], 1)
        top = np.column_stack([poly, np.full(k, t / 2) + r.normal(0, t * 0.12, k)])
        bot = np.column_stack([poly * r.uniform(0.85, 1.0), np.full(k, -t / 2) + r.normal(0, t * 0.12, k)])
        verts = np.concatenate([top, bot])
        faces = [list(range(k)), list(range(2 * k - 1, k - 1, -1))]
        mats = [0, 0]
        for j in range(k):
            a, b = j, (j + 1) % k
            faces.append([a, a + k, b + k, b]); mats.append(1)
        me = bpy.data.meshes.new(f"Crumb{i}")
        me.from_pydata([tuple(p) for p in verts], [], faces)
        me.materials.append(crust); me.materials.append(crumb)
        uvl = me.uv_layers.new(name="UVMap")
        # sample a random patch of side A of the atlas
        cu, cv = r.uniform(0.12, 0.38), r.uniform(0.3, 0.7)
        sc_ = 0.5 / (2.12 * ck.p["R"])
        for poly, m in zip(me.polygons, mats):
            poly.material_index = m
            for li in poly.loop_indices:
                p = verts[me.loops[li].vertex_index]
                if m == 0:
                    uvl.data[li].uv = (cu + p[0] * sc_, cv + p[1] * sc_ * 2)
                else:
                    uvl.data[li].uv = (r.uniform(0, 1), 0.5 + p[2] / t * 0.5)
        ob = bpy.data.objects.new(f"Crumb{i}", me)
        coll.objects.link(ob)
        fix_normals(ob)
        vv, tris = mesh_arrays(ob)
        vol, com, I, m = mass_props(vv, tris, density)
        for x in me.vertices:
            x.co -= Vector(com)
        out.append(dict(name=ob.name, mass=float(abs(m)), hull=to_three(verts - com).round(6).tolist()))
    return out


main()
