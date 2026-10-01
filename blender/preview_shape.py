"""Quick shape check: build the whole cookie with a plain material and render it from
the angles of the reference photos (front, 3/4, top, back, side).
Run: Blender -b -P preview_shape.py -- [key=value ...]"""
import bpy, sys, os, math, importlib
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cookie_geom, cookie_mesh
importlib.reload(cookie_geom); importlib.reload(cookie_mesh)

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
kw = {}
out = os.path.join(os.path.dirname(HERE), "renders", "shape")
for a in ARGS:
    k, v = a.split("=")
    if k == "out":
        out = v
    else:
        kw[k] = float(v) if k != "seed" else int(v)
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"; prefs.get_devices()
for d in prefs.devices: d.use = True
sc.cycles.device = "GPU"
sc.cycles.samples = 24
sc.cycles.use_denoising = True
sc.view_settings.view_transform = "AgX"

ck = cookie_geom.Cookie(**kw)
interior = cookie_geom.interior_points(ck)
outline, isb = cookie_mesh.region_outline(ck)
ob, info = cookie_mesh.build_solid(ck, outline, isb, interior, "Cookie")
import bmesh
bm = bmesh.new(); bm.from_mesh(ob.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(ob.data); bm.free()
print("verts", len(ob.data.vertices), "faces", len(ob.data.polygons))
# sit on the floor
zs = np.array([v.co.z for v in ob.data.vertices])
xs = np.array([v.co.x for v in ob.data.vertices]); ys = np.array([v.co.y for v in ob.data.vertices])
ob.location.z = -zs.min()
print("size (cm) x %.2f y %.2f z %.2f" % ((xs.max() - xs.min()) * 100, (ys.max() - ys.min()) * 100, (zs.max() - zs.min()) * 100))
cx, cy, cz = (xs.max() + xs.min()) / 2, (ys.max() + ys.min()) / 2, (zs.max() - zs.min()) / 2

mat = bpy.data.materials.new("m")
nt = mat.node_tree
b = nt.nodes.get("Principled BSDF")
b.inputs["Base Color"].default_value = (0.78, 0.52, 0.22, 1)
b.inputs["Roughness"].default_value = 0.5
mat2 = bpy.data.materials.new("brk")
mat2.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (0.9, 0.8, 0.5, 1)
ob.data.materials.append(mat); ob.data.materials.append(mat2)
# DIAG_SIDES: pocket-side faces (B) in red so any layer crossing shows up from outside
red = bpy.data.materials.new("red"); red.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.8, 0.05, 0.05, 1)
ob.data.materials.append(red)
ntri = len(info["tris"])
for i, poly in enumerate(ob.data.polygons):
    if i < 2 * ntri and i % 2 == 1:
        poly.material_index = 0

# studio
world = bpy.data.worlds.new("w"); sc.world = world
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.8, 0.8, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
fl = bpy.data.meshes.new("floor")
fl.from_pydata([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [], [(0, 1, 2, 3)])
flo = bpy.data.objects.new("floor", fl); sc.collection.objects.link(flo)
fm = bpy.data.materials.new("fm"); fm.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (0.9, 0.9, 0.9, 1)
fl.materials.append(fm)
ld = bpy.data.lights.new("key", "AREA"); ld.energy = 18; ld.size = 0.3
lo = bpy.data.objects.new("key", ld); sc.collection.objects.link(lo)
lo.location = (-0.25, -0.3, 0.45)
lo.rotation_euler = (Vector((0, 0, 0.02)) - lo.location).to_track_quat("-Z", "Y").to_euler()

cam_d = bpy.data.cameras.new("c"); cam_d.lens = 85
cam = bpy.data.objects.new("c", cam_d); sc.collection.objects.link(cam); sc.camera = cam
sc.render.resolution_x = 560; sc.render.resolution_y = 460
tgt = Vector((cx, cy, cz))
views = {
    "top": (0.0, -0.02, 1.0),
    "threequarter": (-0.75, -0.75, 0.62),
    "front": (0.0, -1.0, 0.42),
    "back": (0.15, 1.0, 0.35),
    "side": (1.0, -0.05, 0.2),
    "low": (0.55, -1.0, 0.5),
}
for name, d in views.items():
    dv = Vector(d).normalized() * 0.36
    cam.location = tgt + dv
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(out, name + ".png")
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "shape_preview.blend"))
