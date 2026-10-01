"""Studio light probe for the web page: a seamless white sweep lit by a big soft key,
a fill card and a rim strip, captured as an equirectangular HDR from where the cookie
sits. Also writes the key light's direction so the real-time shadow matches it, and a
Cycles reference render of the cookie in the same studio (for calibrating the page).

Run:  Blender -b -P build_studio.py -- [--ref]
"""
import bpy, sys, os, math, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "public", "assets")
RENDERS = os.path.join(ROOT, "renders")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

# key: big softbox up and to the left, a little in front of the cookie (toward the camera, -y)
LIGHTS = [
    dict(name="key", loc=(-0.55, -0.45, 0.75), size=(0.9, 0.7), power=700, color=(1.0, 0.97, 0.92)),
    dict(name="fill", loc=(0.8, -0.35, 0.35), size=(0.6, 0.9), power=160, color=(0.95, 0.97, 1.0)),
    dict(name="rim", loc=(0.25, 0.9, 0.55), size=(1.2, 0.25), power=260, color=(1.0, 0.96, 0.9)),
    dict(name="top", loc=(0.0, 0.1, 1.3), size=(1.2, 1.2), power=160, color=(1.0, 1.0, 1.0)),
]


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


def studio(sc, bg=(0.93, 0.92, 0.9)):
    world = bpy.data.worlds.new("w"); sc.world = world
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.5, 0.5, 0.5, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    # seamless sweep: floor curving up into a back wall
    import bmesh
    bm = bmesh.new()
    prof = []
    for i in range(40):
        t = i / 39
        if t < 0.6:
            prof.append((-1.5 + 3.0 * t / 0.6 * 0.6, 0.0))
    ys = [(-2.0 + 3.2 * i / 30, 0.0) for i in range(31)]
    R = 0.8
    for k in range(1, 17):
        a = (math.pi / 2) * k / 16
        ys.append((1.2 + R * math.sin(a), R - R * math.cos(a)))
    ys.append((2.0, 2.5))
    verts = []
    for x in (-3.0, 3.0):
        for y, z in ys:
            verts.append(bm.verts.new((x, y, z)))
    n = len(ys)
    for i in range(n - 1):
        bm.faces.new((verts[i], verts[i + 1], verts[n + i + 1], verts[n + i]))
    me = bpy.data.meshes.new("sweep"); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    sweep = bpy.data.objects.new("sweep", me); sc.collection.objects.link(sweep)
    m = bpy.data.materials.new("paper")
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*bg, 1)
    b.inputs["Roughness"].default_value = 0.85
    me.materials.append(m)
    for L in LIGHTS:
        ld = bpy.data.lights.new(L["name"], "AREA")
        ld.shape = "RECTANGLE"; ld.size, ld.size_y = L["size"]
        ld.energy = L["power"]; ld.color = L["color"]
        lo = bpy.data.objects.new(L["name"], ld); sc.collection.objects.link(lo)
        lo.location = L["loc"]
        lo.rotation_euler = (Vector((0, 0, 0.02)) - Vector(L["loc"])).to_track_quat("-Z", "Y").to_euler()
        # visible to camera rays so the probe sees the softboxes (they show up in reflections)
        lo.visible_camera = True
    return sweep


def probe(sc):
    cam_d = bpy.data.cameras.new("probe")
    cam_d.type = "PANO"
    cam_d.panorama_type = "EQUIRECTANGULAR"
    cam_d.clip_start = 0.0005  # the floor is only 2.5 cm below
    cam = bpy.data.objects.new("probe", cam_d); sc.collection.objects.link(cam)
    cam.location = (0, 0, 0.025)
    cam.rotation_euler = (math.pi / 2, 0, 0)  # look along +y, z up
    sc.camera = cam
    sc.render.resolution_x = 1024; sc.render.resolution_y = 512
    sc.cycles.samples = 512
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "HDR"
    sc.render.filepath = os.path.join(ASSETS, "studio.hdr")
    bpy.ops.render.render(write_still=True)


def main():
    sc = reset()
    studio(sc)
    if "--ref" not in ARGS:
        probe(sc)
        key = Vector(LIGHTS[0]["loc"]).normalized()
        # three.js frame: (x, z, -y)
        meta = dict(key=[key.x, key.z, -key.y], lights=[dict(name=L["name"], dir=list(Vector(L["loc"]).normalized())) for L in LIGHTS])
        with open(os.path.join(ASSETS, "studio.json"), "w") as fh:
            json.dump(meta, fh, indent=1)
        print("probe done", meta["key"])
        return
    # reference render: the cookie from cookie.blend in the same studio
    with bpy.data.libraries.load(os.path.join(HERE, "cookie.blend")) as (src, dst):
        dst.objects = ["Cookie"]
    ob = dst.objects[0]
    sc.collection.objects.link(ob)
    # the baked crust (same maps the page uses)
    B = os.path.join(HERE, "baked")
    m = bpy.data.materials.new("crust_ref")
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    def img(name, cs):
        n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(os.path.join(B, name)); n.image.colorspace_settings.name = cs
        return n
    col = img("crust_color.png", "sRGB"); orm = img("crust_orm.png", "Non-Color"); nrm = img("crust_normal.png", "Non-Color")
    sep = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 0.4
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
    nt.links.new(col.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Subsurface Weight"].default_value = 0.25
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.55, 0.25)
    b.inputs["Subsurface Scale"].default_value = 0.0015
    b.inputs["Coat Weight"].default_value = 0.12
    b.inputs["Coat Roughness"].default_value = 0.35
    ob.data.materials.clear(); ob.data.materials.append(m); ob.data.materials.append(m)
    zs = [(ob.matrix_world @ v.co).z for v in ob.data.vertices]
    ob.location.z -= min(zs)
    cam_d = bpy.data.cameras.new("c"); cam_d.lens = 100
    cam = bpy.data.objects.new("c", cam_d); sc.collection.objects.link(cam); sc.camera = cam
    tgt = Vector((0, 0, 0.012))
    import math as _m
    az, el, d = 0.5, 0.66, 0.3
    cam.location = tgt + Vector((d * _m.sin(az) * _m.cos(el), -d * _m.cos(az) * _m.cos(el), d * _m.sin(el)))
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.view_settings.exposure = -5.9  # the studio is in absolute units: the lit floor reads ~56
    sc.render.resolution_x = 1200; sc.render.resolution_y = 900
    sc.cycles.samples = 256
    sc.render.filepath = os.path.join(RENDERS, "ref_cookie.png")
    bpy.ops.render.render(write_still=True)


main()
