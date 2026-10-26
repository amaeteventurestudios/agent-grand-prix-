# The safety car: a long-bonnet luxury grand tourer, our own design, in pearl silver with a graphite
# lower body, an orange stripe along the flanks, LED light strips, five-spoke wheels and a roof light
# bar. Unlike the race cars it keeps its own colours (vertex colour = real colour, alpha = finish:
# 1 paint, 0.8 metal, 0.55 trim, 0 rubber), and its two roof lamps are their own meshes (lamp_L,
# lamp_R) so the game can flash them. Frame as the race cars: X forward, Y left, Z up.
# blender -b --factory-startup -P art/cars/safety.py [-- --render /tmp/sc]
import sys, os, math, json
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
from carkit import reset, superellipse, loft, lathe, finish, paint, join, tris, resample, empty

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
lin = lambda h: tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)))
def C(h, a=1.0): return lin(h) + (a,)
SILVER, GRAPHITE, ORANGE = C('#d5d9df'), C('#2a2e35', 0.8), C('#ff7a1a')
TRIM, CHROME, RUBBER = C('#121418', 0.55), C('#e9edf2', 0.8), C('#141518', 0.0)
LENS = C('#1d232b', 0.55)
HEAD, TAIL, AMBER = C('#f4f8ff'), C('#e0142a'), C('#ffa31a')

WB = 1.46; TY = 0.85; R = 0.37; TW = 0.3   # wheel x, wheel y, radius, tyre width
# the body in plan and profile: x, half-width, top (beltline / bonnet), side roundness. The lower edge
# is the sill, cut up into a round arch over each wheel; a narrower graphite core fills the wheel wells.
PLAN = [
    (2.46, 0.66, 0.54, 3.0),
    (2.38, 0.86, 0.62, 5.0),
    (2.15, 0.96, 0.68, 7.0),
    (1.80, 1.00, 0.76, 8.0),
    (1.46, 1.02, 0.80, 8.0),
    (1.05, 0.99, 0.83, 8.0),
    (0.60, 0.96, 0.86, 8.0),
    (-0.40, 0.96, 0.89, 8.0),
    (-1.00, 1.00, 0.93, 8.0),
    (-1.46, 1.03, 0.95, 8.0),
    (-1.90, 1.00, 0.95, 8.0),
    (-2.20, 0.93, 0.92, 6.0),
    (-2.38, 0.80, 0.86, 4.0),
    (-2.45, 0.64, 0.78, 3.0),
]
ARCH = 0.45   # arch radius around each hub
def sill(x):
    z = 0.21 if -2.2 < x < 2.25 else 0.21 + (abs(x) - 2.2) * 0.5
    for hx in (WB, -WB):
        d = abs(x - hx)
        if d < ARCH: z = max(z, R + math.sqrt(ARCH * ARCH - d * d))
    return z
def body_rows(step):
    xs, x = [], PLAN[0][0]
    while x > PLAN[-1][0]: xs.append(x); x -= step
    xs.append(PLAN[-1][0])
    # extra rings right at each arch edge keep the cut crisp
    for hx in (WB, -WB):
        for d in (-ARCH, -ARCH + 0.01, ARCH - 0.01, ARCH): xs.append(hx + d)
    xs = sorted(set(round(v, 4) for v in xs), reverse=True)
    return [(x, lerp(PLAN, x, 1), min(sill(x), lerp(PLAN, x, 2) - 0.06), lerp(PLAN, x, 2), lerp(PLAN, x, 3)) for x in xs]

# the cabin: a low fastback greenhouse set back on the long bonnet
CABIN = [
    (0.62, 0.66, 0.80, 0.84, 3.0),
    (0.30, 0.70, 0.84, 1.10, 2.8),
    (0.00, 0.70, 0.86, 1.25, 2.6),
    (-0.40, 0.69, 0.88, 1.27, 2.6),
    (-0.85, 0.66, 0.90, 1.20, 2.6),
    (-1.35, 0.60, 0.92, 1.06, 2.6),
    (-1.85, 0.50, 0.92, 0.95, 2.6),
]

def lerp(T, x, i):
    if x >= T[0][0]: return T[0][i]
    for a, b in zip(T, T[1:]):
        if b[0] <= x <= a[0]:
            t = (a[0] - x) / (a[0] - b[0]); return a[i] + (b[i] - a[i]) * t
    return T[-1][i]

def body_rule(p, n):
    if p.z < 0.3 and n.z < 0.7: return GRAPHITE                   # sills, splitter, diffuser
    return SILVER

def ribbon(name, xs, s, z0, z1, col, out=0.004):
    """A thin flush strip on the body's flank (side s) between heights z0 and z1: stripes, vents."""
    rings = [[Vector((x, s * (lerp(PLAN, x, 1) + o), z)) for (o, z) in ((0, z0), (out, z0), (out, z1), (0, z1))] for x in xs]
    ob = loft(name, rings); paint(ob, lambda p, n: col); return ob

def face(name, body, front, ys, z0, z1, col, depth=0.03, lift=0.004):
    """A lamp or grille hugging the nose (front) or the tail between heights z0 and z1 across ys:
    each slice is found by casting a ray at the body, so the panel follows its curve."""
    bpy.context.view_layer.update()
    s = 1 if front else -1; rings = []
    n = max(2, int(abs(ys[1] - ys[0]) / 0.03) + 1)
    for i in range(n):
        y = ys[0] + (ys[1] - ys[0]) * i / (n - 1); ring = []
        for z in (z0, z1):
            hit, loc, nrm, _ = body.ray_cast(Vector((s * 4, y, z)), Vector((-s, 0, 0)))
            x = loc.x if hit else s * 2.3
            ring.append((x, z))
        (xa, za), (xb, zb) = ring
        rings.append([Vector((xa - s * depth, y, za)), Vector((xa + s * lift, y, za)), Vector((xb + s * lift, y, zb)), Vector((xb - s * depth, y, zb))])
    ob = loft(name, rings); paint(ob, lambda p, n: col); return ob

def wheel(key, x, y, segs):
    s = 1 if y > 0 else -1; hw = TW / 2; rr = 0.25
    tyre = [(rr, -hw + 0.01), (rr + 0.03, -hw), (R - 0.04, -hw), (R, -hw + 0.06), (R, hw - 0.06), (R - 0.04, hw), (rr + 0.03, hw), (rr, hw - 0.01)]
    t = lathe(f'wheel_{key}_tyre', tyre, segs); paint(t, lambda p, n: RUBBER)
    face = hw * s
    rim = [(0.0, face * 0.6), (0.05, face * 0.75), (rr - 0.015, face * 0.92), (rr, face * 0.97), (rr, -face * 0.9)]
    rm = lathe(f'wheel_{key}_rim', rim, segs)
    # five spokes: the face reads as metal on the spokes and dark between them
    def spokes(p, n):
        r = math.hypot(p.x, p.z)
        if r < 0.05 or r > rr - 0.03: return CHROME
        a = (math.degrees(math.atan2(p.z, p.x)) % 72)
        return CHROME if a < 20 or a > 52 else TRIM
    paint(rm, spokes)
    disc = lathe(f'wheel_{key}_disc', [(0.0, -face * 0.1), (0.2, -face * 0.1), (0.2, face * 0.3), (0.0, face * 0.3)], segs)
    paint(disc, lambda p, n: ORANGE if math.hypot(p.x, p.z) > 0.14 and abs(p.y) < 0.05 else TRIM)   # orange calipers behind
    w = join(f'wheel_{key}', [t, rm, disc]); w.location = (x, y, R); finish(w, 0, True)
    return w

def build(lod):
    step = (0.035, 0.12, 0.35)[lod]; n = (40, 20, 10)[lod]
    rings = [superellipse(r[0], r[1], r[2], r[3], n, r[4], 6.0) for r in body_rows(step)]
    body = finish(loft('body', rings), 0); paint(body, body_rule)
    core = loft('core', [superellipse(x, 0.72, 0.2, lerp(PLAN, x, 2) - 0.1, 12, 6, 6) for x in (2.2, 1.8, 1.0, 0.0, -1.0, -2.2)])
    paint(core, lambda p, n: TRIM)
    parts = [body, core]
    # the flank stripe, running between the arches; a chrome vent behind each front wheel
    run = [x / 100 for x in range(int((WB - ARCH - 0.02) * 100), int((-WB + ARCH + 0.02) * 100) - 1, -int(step * 100) or -4)]
    nose = [x / 100 for x in range(229, int((WB + ARCH + 0.02) * 100) - 1, -4)]
    tail = [x / 100 for x in range(int((-WB - ARCH - 0.02) * 100), -219, -4)]
    for sd in (1, -1):
        for xs in (run, nose, tail):
            if len(xs) > 1: parts.append(ribbon('stripe', xs, sd, 0.585, 0.62, ORANGE))
        parts.append(ribbon('vent', [0.86, 0.6], sd, 0.44, 0.5, CHROME, 0.006))
        # thin LED headlights, swept back into the wings
        parts.append(face('lens', body, True, (sd * 0.44, sd * 0.78), 0.485, 0.55, LENS))
        parts.append(face('head', body, True, (sd * 0.47, sd * 0.76), 0.53, 0.545, HEAD, lift=0.01))
    parts.append(face('grille', body, True, (-0.46, 0.46), 0.36, 0.46, TRIM))
    parts.append(face('tail', body, False, (-0.78, 0.78), 0.72, 0.76, TAIL))
    parts.append(face('diffuser', body, False, (-0.6, 0.6), 0.3, 0.42, TRIM))
    car = join('safety_body', parts)
    glass = finish(loft('glass', [superellipse(r[0], r[1], r[2], r[3], n, r[4], 5.0) for r in resample(CABIN, max(step, 0.06))]), 0)
    def cabin(p, n):
        if n.z > 0.8 and -1.0 < p.x < 0.05 and abs(p.y) < 0.55: return SILVER          # the roof
        if abs(n.y) > 0.6 and (abs(p.x + 0.42) < 0.03 or p.z < 0.93): return TRIM    # pillar and sill line
        return C('#0b0e12', 0.55)                                                    # dark glass
    paint(glass, cabin)
    glass.name = 'safety_glass'
    # the roof light bar: a slim graphite base and two lamps the game flashes in turn
    bar = loft('bar', [[Vector((x, yy, zz)) for (yy, zz) in ((-0.5, 1.24), (0.5, 1.24), (0.46, 1.32), (-0.46, 1.32))] for x in (-0.2, -0.52)])
    paint(bar, lambda p, n: GRAPHITE); bar.name = 'safety_bar'
    lamps = []
    for nm, s in (('lamp_L', 1), ('lamp_R', -1)):
        l = loft(nm, [[Vector((x, s * yy, zz)) for (yy, zz) in ((0.04, 1.3), (0.44, 1.3), (0.4, 1.38), (0.06, 1.38))] for x in (-0.23, -0.49)])
        paint(l, lambda p, n: AMBER); l.name = nm; lamps.append(l)
    segs = (28, 16, 8)[lod]
    wheels = [wheel(k, sx * WB, sy * TY, segs) for k, sx, sy in (('FL', 1, 1), ('FR', 1, -1), ('RL', -1, 1), ('RR', -1, -1))]
    return car, glass, bar, lamps, wheels

reset()
mats = {}
def mat(key, rough, metal, alpha=1.0):
    m = bpy.data.materials.new(key); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    a = m.node_tree.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
    m.node_tree.links.new(a.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal; b.inputs['Alpha'].default_value = alpha
    if alpha < 1: m.blend_method = 'BLEND'
    return m
paintm, glassm = mat('sc_paint', 0.3, 0.55), mat('sc_glass', 0.05, 0.0, 0.85)
report = {}
for lod in range(3):
    grp = bpy.data.objects.new(f'safety_LOD{lod}', None); bpy.context.collection.objects.link(grp)
    car, glass, bar, lamps, wheels = build(lod)
    for o in [car, bar] + lamps + wheels: o.data.materials.append(paintm)
    glass.data.materials.append(paintm)
    for o in [car, glass, bar] + lamps + wheels: o.parent = grp; o.name = f'{o.name}_L{lod}'
    report[f'LOD{lod}'] = sum(tris(o) for o in [car, glass, bar] + lamps + wheels)
os.makedirs(f'{root}/assets/vehicles/safety', exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=f'{root}/art/cars/safety.blend')
out = f'{root}/assets/vehicles/safety/safety.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True,
    export_vertex_color='ACTIVE', export_normals=True, export_materials='EXPORT', export_extras=False)
report['bytes'] = os.path.getsize(out)
print('REPORT', json.dumps(report))

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if '--render' in args:
    prefix = args[args.index('--render') + 1]
    for o in bpy.data.objects:
        if o.type == 'EMPTY' and '_LOD' in o.name:
            for ch in o.children: ch.hide_render = not o.name.endswith('LOD0')
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 40; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 960, 540; sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.78, 0.82, 1)
    bpy.ops.mesh.primitive_plane_add(size=60)
    fl = bpy.data.materials.new('floor'); fl.use_nodes = True
    fl.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.4, 0.42, 0.44, 1)
    bpy.context.object.data.materials.append(fl)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = 3.5; sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(-30))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 50
    # blender is Z up; the GLB export turns it Y up, the scene here stays Z up
    for k, p in {'34': (7.0, 5.2, 3.0), 'side': (0.0, 9.5, 1.0), 'rear': (-7.0, -4.6, 2.6), 'front': (7.5, 0.0, 1.2)}.items():
        cam.location = p
        d = Vector((0, 0, 0.6)) - Vector(p); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{prefix}_{k}.png'; bpy.ops.render.render(write_still=True)
