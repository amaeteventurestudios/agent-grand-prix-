# Agent Grand Prix car kit for Blender (run headless: blender -b -P art/cars/build.py -- falcon).
# Cars are built from lofted cross-sections in the game's car frame: X forward (nose +X), Y left,
# Z up, wheels at x=+-1.55, y=+-0.83, radius 0.34. Every vertex carries a livery mask in its colour:
# R primary paint, G secondary paint, B glowing accent, A finish (1 paint, .55 carbon, .8 metal, 0 rubber).
# The game tints the mask with team colours, so one file serves every livery.
import bpy, bmesh, math
from mathutils import Vector

PAINT, CARBON, METAL, RUBBER = 1.0, 0.55, 0.8, 0.0
P1 = (1, 0, 0, PAINT); P2 = (0, 1, 0, PAINT); GLOW = (0, 0, 1, PAINT)
CF = (0, 0, 0, CARBON); MT = (0, 0, 0, METAL); RB = (0, 0, 0, RUBBER)
WHEELS = {'FL': (1.55, 0.83, 0.34, 0.34), 'FR': (1.55, -0.83, 0.34, 0.34), 'RL': (-1.55, 0.83, 0.34, 0.42), 'RR': (-1.55, -0.83, 0.34, 0.42)}

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def superellipse(x, w, zb, zt, n=24, ntop=2.6, nbot=6.0, yoff=0.0):
    """A closed cross-section at x: half-width w, from zb to zt, rounder on top, flatter underneath."""
    zc = (zb + zt) / 2
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        ex = 2 / (ntop if s >= 0 else nbot)
        y = w * math.copysign(abs(c) ** ex, c) + yoff
        z = zc + (zt - zc if s >= 0 else zc - zb) * math.copysign(abs(s) ** ex, s)
        pts.append(Vector((x, y, z)))
    return pts

def naca(chord, thick, n=10, camber=0.0):
    """Aerofoil outline (u along chord from leading edge, v up), closed, sharp trailing edge."""
    up, lo = [], []
    for i in range(n + 1):
        u = (1 - math.cos(math.pi * i / n)) / 2
        yt = 5 * thick * (0.2969 * math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4)
        yc = camber * 4 * u * (1 - u)
        up.append((u * chord, yc + yt)); lo.append((u * chord, yc - yt))
    return up[:-1] + lo[::-1][:-1]

def loft(name, rings, closed_ring=True, cap=True):
    """Skin a list of rings (lists of Vectors with the same count) into one mesh object."""
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    m = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(m if closed_ring else m - 1):
            j = (i + 1) % m
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap and closed_ring:
        for r, flip in ((vs[0], True), (vs[-1], False)):
            c = sum((v.co for v in r), Vector()) / len(r)
            cv = bm.verts.new(c)
            for i in range(m):
                q = (r[i], r[(i + 1) % m], cv)
                bm.faces.new(q[::-1] if flip else q)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob

def wing(name, stations, chord_n=10, camber=0.04):
    """A wing lofted along its span. stations: (y, x_leading_edge, z, chord, thickness, pitch_deg)."""
    rings = []
    for (y, x, z, chord, th, pitch) in stations:
        a = math.radians(pitch)
        ring = []
        for (u, v) in naca(chord, th, chord_n, camber):
            # chord runs backwards (-X) from the leading edge, pitched nose-down by `pitch`
            px, pz = -u, v
            ring.append(Vector((x + px * math.cos(a) - pz * math.sin(a), y, z + px * math.sin(a) + pz * math.cos(a))))
        rings.append(ring)
    return loft(name, rings)

def arc_shell(name, hub, radius, width, th0, th1, steps, thick=0.035, flare=0.0, yoff=0.0, lip=0.0, side=1):
    """A fender: a curved shell around a wheel's axis from angle th0 to th1 (0 = forward, 90 = up)."""
    hx, hy, hz = hub
    rings = []
    for k in range(steps + 1):
        th = math.radians(th0 + (th1 - th0) * k / steps)
        r = Vector((math.cos(th), 0, math.sin(th)))
        ring = []
        prof = [(-width / 2, 0), (width / 2, 0), (width / 2, thick), (-width / 2, thick)]
        if lip:  # a skirt turned down over the outer shoulder of the tyre
            o = width / 2
            prof = [(-o, thick), (-o, 0), (o - thick, 0), (o - thick, -lip), (o, -lip), (o, thick)]
            if side < 0: prof = [(-yy, rr) for (yy, rr) in prof[::-1]]
        for (yy, rr) in prof:
            ring.append(Vector((hx, hy + yy + yoff, hz)) + r * (radius + rr + flare * math.sin(math.pi * k / steps)))
        rings.append(ring)
    return loft(name, rings)

def strut(name, p1, p2, w=0.05, h=0.018):
    """A flat aerofoil-section suspension arm between two points."""
    p1, p2 = Vector(p1), Vector(p2)
    d = (p2 - p1).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-4: side = Vector((1, 0, 0))
    side.normalize(); up = side.cross(d).normalized()
    rings = []
    for p in (p1, p2):
        rings.append([p + side * (w / 2 * math.cos(2 * math.pi * i / 6)) + up * (h / 2 * math.sin(2 * math.pi * i / 6)) for i in range(6)])
    return loft(name, rings)

def lathe(name, profile, segs, axis_y=True):
    """Revolve (radius, y) profile points around the Y axis (wheels)."""
    rings = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        rings.append([Vector((r * math.cos(a), y, r * math.sin(a))) for (r, y) in profile])
    # rings around the axis; skin them as a closed loop of rings
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    m = len(profile)
    for k in range(segs):
        a, b = vs[k], vs[(k + 1) % segs]
        for i in range(m - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob

def finish(ob, subdiv=0, smooth=True, bevel=0.0):
    """Apply bevel and subdivision, then smooth shading with weighted normals."""
    if bevel > 0:
        m = ob.modifiers.new('bevel', 'BEVEL'); m.width = bevel; m.segments = 2; m.limit_method = 'ANGLE'
    if subdiv:
        m = ob.modifiers.new('subd', 'SUBSURF'); m.levels = subdiv; m.render_levels = subdiv
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        with bpy.context.temp_override(object=ob, active_object=ob):
            bpy.ops.object.modifier_apply(modifier=m.name)
    for p in ob.data.polygons: p.use_smooth = smooth
    if smooth:
        m = ob.modifiers.new('wn', 'WEIGHTED_NORMAL'); m.keep_sharp = True; m.weight = 50
        with bpy.context.temp_override(object=ob, active_object=ob):
            bpy.ops.object.modifier_apply(modifier='wn')
    return ob

def paint(ob, rule):
    """Write the livery mask: rule(face_centre, face_normal) -> RGBA."""
    me = ob.data
    attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = attr
    for p in me.polygons:
        c = rule(ob.matrix_world @ p.center, p.normal)
        for li in p.loop_indices: attr.data[li].color = c
    return ob

def solid(c):
    return lambda p, n: c

def join(name, obs):
    obs = [o for o in obs if o]
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    obs[0].name = name; obs[0].data.name = name
    return obs[0]

def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)

def wheel(name, key, segs, rim_detail=True):
    x, y, r, w = WHEELS[key]
    s = 1 if y > 0 else -1
    hw = w / 2
    rr = 0.225  # rim radius
    tyre = [(rr, -hw + 0.01), (r - 0.04, -hw), (r - 0.008, -hw + 0.03), (r, -hw + 0.08), (r, hw - 0.08), (r - 0.008, hw - 0.03), (r - 0.04, hw), (rr, hw - 0.01)]
    t = lathe(name + '_tyre', tyre, segs)
    paint(t, solid(RB))
    face = hw * s
    rim = [(0.0, face * 0.2), (0.06, face * 0.35), (0.16, face * 0.55), (rr - 0.02, face * 0.8), (rr, face * 0.97), (rr, -face * 0.9)] if rim_detail else [(0.0, face * 0.5), (rr, face * 0.95), (rr, -face * 0.9)]
    rm = lathe(name + '_rim', rim, segs)
    paint(rm, lambda p, n: P2 if 0.185 < Vector((p.x, 0, p.z)).length < rr - 0.012 else MT)
    wob = join(name, [t, rm])
    if s < 0: pass
    wob.location = (x, y, r)
    finish(wob, 0, True)
    return wob

def empty(name, loc, parent):
    e = bpy.data.objects.new(name, None); e.location = loc; e.parent = parent
    bpy.context.collection.objects.link(e)
    return e

def arch(x, yc, hw, zb, ztop, t, n=12):
    """An open-bottomed arch section at x (a wheel tunnel): outer edge up and over, inner edge back."""
    outer, inner = [], []
    for i in range(n + 1):
        a = math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        ex = 2 / 3.2
        outer.append(Vector((x, yc + hw * math.copysign(abs(c) ** ex, c), zb + (ztop - zb) * abs(s) ** ex)))
        inner.append(Vector((x, yc + (hw - t) * math.copysign(abs(c) ** ex, c), zb + (ztop - t - zb) * abs(s) ** ex)))
    return outer + inner[::-1]
