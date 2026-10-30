# The city kit: buildings modelled in Blender, with soft shading baked in, for the skylines.
# blender -b --factory-startup -P art/buildings/buildings.py [-- --render /tmp/kit.png]
#
# Each design is built at its real size in metres (footprint centred on the origin, ground at 0)
# in two levels of detail: LOD 0 with balconies, fins, rooftop tanks and masts, LOD 1 without them.
# Windows are not modelled: the game's facade shader (js/kit.js) draws them on every wall, so a
# wall face only says what kind of wall it is. Each corner colour carries:
#   RGB  the colour (white walls take the building's own paint in the game)
#   A    (style + 8 * paint + 0.5) / 16: style 0 plain, 1 glass curtain wall, 2 punched windows,
#        3 balconies; paint 1 means the game tints it with the building's paint colour.
# Ambient occlusion (the soft dark where walls meet the ground, under balconies and between fins)
# is baked by Cycles into one shared 1024 px map; LOD 1 keeps LOD 0's UVs, so it uses the same map.
# Every node carries its numbers in extras (height, footprint, floor height, window width, size
# class), which the game reads as userData.
import sys, os, math, json
import bpy, bmesh
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = f'{ROOT}/assets/buildings/city.glb'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

PLAIN, GLASS, PUNCHED, BALCONY = 0, 1, 2, 3

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

WALL = '#ffffff'        # painted in the game
CONC = '#c9c6bf'        # bare concrete
CONC_D = '#8f8d88'
DARK = '#4c535c'        # plant louvres, frames
WHITE = '#f1f1ee'
ROOF = '#9a9890'
TANK = '#202226'        # black plastic water tanks
TANK_B = '#2f5f9e'
RUST = '#9a4e32'
TEAL = '#3f7f86'
GREEN = '#4f7d3a'
AWN = ['#d7682f', '#2f6db3', '#c9a227']


class Mesh:
    """A bmesh with a colour per corner and a detail flag per face."""
    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.det = self.bm.faces.layers.int.new('detail')

    def face(self, pts, rgb, style, paint, detail, smooth=False):
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        c = lin(rgb) + [(style + 8 * paint + 0.5) / 16]
        for l in f.loops: l[self.col] = c
        f[self.det] = detail; f.smooth = smooth
        return f

    def prism(self, poly, z0, z1, rgb=WALL, style=PUNCHED, paint=1, detail=0, top=ROOF, top_paint=0,
              bottom=False, top_scale=1.0, smooth=False, cap=True):
        """Straight walls around a footprint polygon (counter-clockwise, seen from above)."""
        n = len(poly)
        cx = sum(p[0] for p in poly) / n; cy = sum(p[1] for p in poly) / n
        up = [(cx + (x - cx) * top_scale, cy + (y - cy) * top_scale) for x, y in poly]
        for i in range(n):
            (ax, ay), (bx, by) = poly[i], poly[(i + 1) % n]
            (ux, uy), (vx, vy) = up[i], up[(i + 1) % n]
            self.face([(ax, ay, z0), (bx, by, z0), (vx, vy, z1), (ux, uy, z1)], rgb, style, paint, detail, smooth)
        if cap: self.face([(x, y, z1) for x, y in up], top, PLAIN, top_paint, detail)
        if bottom: self.face([(x, y, z0) for x, y in reversed(poly)], rgb, PLAIN, paint, detail)

    def box(self, cx, cy, z0, sx, sy, sz, **kw):
        self.prism(rect(cx, cy, sx, sy), z0, z0 + sz, **kw)


def rect(cx, cy, sx, sy):
    return [(cx - sx / 2, cy - sy / 2), (cx + sx / 2, cy - sy / 2), (cx + sx / 2, cy + sy / 2), (cx - sx / 2, cy + sy / 2)]

def chamfer(cx, cy, sx, sy, c):
    x0, x1, y0, y1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2
    return [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]

def circle(cx, cy, r, n, rot=0.0):
    return [(cx + r * math.cos(rot + 2 * math.pi * i / n), cy + r * math.sin(rot + 2 * math.pi * i / n)) for i in range(n)]


def tanks(m, pts, z, r=0.9, h=1.6, rgb=TANK):
    """Rooftop water tanks on a little stand: the black plastic tanks seen on roofs all over Lagos."""
    for x, y in pts:
        m.box(x, y, z, r * 1.8, r * 1.8, 0.5, rgb=CONC_D, style=PLAIN, paint=0, detail=1, top=CONC_D)
        m.prism(circle(x, y, r, 8), z + 0.5, z + 0.5 + h, rgb=rgb, style=PLAIN, paint=0, detail=1, top=rgb, smooth=True)

def mast(m, x, y, z, h, r=0.35):
    m.prism(circle(x, y, r, 6), z, z + h, rgb=WHITE, style=PLAIN, paint=0, detail=1, top=WHITE, top_scale=0.3)

def ac_units(m, face_y, xs, zs, out=1):
    """Air conditioners hung on a wall that faces +y (out=1) or -y (out=-1)."""
    for x in xs:
        for z in zs:
            m.box(x, face_y + out * 0.35, z, 0.9, 0.7, 0.6, rgb=WHITE, style=PLAIN, paint=0, detail=1, top=WHITE)

def parapet(m, cx, cy, sx, sy, z, h=1.1, t=0.25, rgb=WALL, paint=1):
    m.box(cx, cy - sy / 2 + t / 2, z, sx, t, h, rgb=rgb, style=PLAIN, paint=paint, detail=1, top=rgb, top_paint=paint)
    m.box(cx, cy + sy / 2 - t / 2, z, sx, t, h, rgb=rgb, style=PLAIN, paint=paint, detail=1, top=rgb, top_paint=paint)
    m.box(cx - sx / 2 + t / 2, cy, z, t, sy - 2 * t, h, rgb=rgb, style=PLAIN, paint=paint, detail=1, top=rgb, top_paint=paint)
    m.box(cx + sx / 2 - t / 2, cy, z, t, sy - 2 * t, h, rgb=rgb, style=PLAIN, paint=paint, detail=1, top=rgb, top_paint=paint)


# ---- the designs. Each returns (mesh, meta). meta: h (height to the main roof), fh floor height,
# ww window width (negative: measured round the centre, for round towers), y0 first floor line,
# size class (tall / mid / low), and how far the game may stretch it up or down ----

def glass_tower():
    """A glass tower on a podium: chamfered corners, a dark plant floor two thirds up, a stepped
    crown with corner fins and a mast. The new business district look."""
    m = Mesh(); H = 150
    m.box(0, 0, 0, 46, 38, 5, rgb='#20262e', style=GLASS, paint=0, top=CONC)      # shopfronts
    m.box(0, 0, 5, 46, 38, 11, style=PUNCHED, top=CONC)                             # podium offices
    parapet(m, 0, 0, 46, 38, 16)
    m.prism(chamfer(0, 0, 27, 27, 4.5), 16, 96, rgb='#ffffff', style=GLASS, paint=1, top=ROOF)
    m.prism(chamfer(0, 0, 27.6, 27.6, 4.6), 96, 100.5, rgb=DARK, style=PLAIN, paint=0, top=ROOF)  # plant floor
    m.prism(chamfer(0, 0, 27, 27, 4.5), 100.5, H - 10, rgb='#ffffff', style=GLASS, paint=1, top=ROOF)
    m.prism(chamfer(0, 0, 22, 22, 3.5), H - 10, H, rgb='#ffffff', style=GLASS, paint=1, top=ROOF)
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):                               # crown fins
        m.box(sx * 11.2, sy * 11.2, H - 12, 1.2, 1.2, 20, rgb=WHITE, style=PLAIN, paint=0, detail=1, top=WHITE)
    m.box(0, 0, H, 10, 8, 3.5, rgb=CONC, style=PLAIN, paint=0, detail=1, top=ROOF)
    mast(m, 0, 0, H + 3.5, 24)
    return m, dict(h=H, w=46, d=38, fh=3.8, ww=3.0, y0=0.0, size='tall', s=(0.8, 1.3))

def office_slab():
    """A 1970s office slab on stilts, wrapped in concrete sun fins: the old Marina look."""
    m = Mesh(); H = 92; W, D = 50, 18
    m.box(0, 0, 0, W - 8, D - 6, 7, rgb='#1f252c', style=GLASS, paint=0, top=CONC)  # glass lobby
    for x in range(-22, 23, 11):                                                    # stilts
        for y in (-7, 7):
            m.box(x, y, 0, 1.4, 1.4, 7, rgb=CONC, style=PLAIN, paint=0, detail=1, top=CONC)
    m.box(0, 0, 7, W, D, H - 7, rgb='#5a6672', style=GLASS, paint=0, top=ROOF, bottom=True)
    for i in range(17):                                                             # fins, long faces
        x = -W / 2 + 1.5 + i * (W - 3) / 16
        for y in (-D / 2 - 0.6, D / 2 + 0.6):
            m.box(x, y, 7, 0.35, 1.2, H - 7, rgb=WALL, style=PLAIN, paint=1, detail=1, top=WALL, top_paint=1)
    for i in range(6):                                                              # fins, ends
        y = -D / 2 + 1.5 + i * (D - 3) / 5
        for x in (-W / 2 - 0.6, W / 2 + 0.6):
            m.box(x, y, 7, 1.2, 0.35, H - 7, rgb=WALL, style=PLAIN, paint=1, detail=1, top=WALL, top_paint=1)
    m.box(0, 0, H, W + 2.4, D + 2.4, 1.6, rgb=WALL, style=PLAIN, paint=1, top=ROOF, bottom=True)  # roof slab
    m.box(-12, 0, H + 1.6, 9, 7, 5, rgb=CONC, style=PLAIN, paint=0, detail=1, top=ROOF)  # lift room
    tanks(m, [(8, -3), (11, -3), (14, -3)], H + 1.6, r=1.1, h=2.0, rgb=TANK_B)
    mast(m, 16, 4, H + 1.6, 12, 0.2)
    return m, dict(h=H + 1.6, w=W + 2.4, d=D + 2.4, fh=3.6, ww=3.0, y0=7.0, size='mid', s=(0.75, 1.25))

def round_tower():
    """A round glass tower on a drum, white rings every few floors and an open crown."""
    m = Mesh(); H = 125; R = 15
    m.prism(circle(0, 0, 22, 24), 0, 10, style=PUNCHED, top=CONC, smooth=True)
    parapet_ring = circle(0, 0, 22, 24)
    m.prism(parapet_ring, 10, 11.1, rgb=WALL, style=PLAIN, paint=1, detail=1, top=WALL, top_paint=1, smooth=True)
    m.prism(circle(0, 0, R, 20), 10, H, rgb='#ffffff', style=GLASS, paint=1, top=ROOF, smooth=True)
    for z in range(26, H - 4, 16):                                                  # white rings
        m.prism(circle(0, 0, R + 0.9, 20), z, z + 0.7, rgb=WHITE, style=PLAIN, paint=0, detail=1, top=WHITE, bottom=True, smooth=True)
    # the crown: an open ring of slim posts holding a halo
    for i in range(10):
        a = 2 * math.pi * i / 10
        m.box(math.cos(a) * (R - 0.6), math.sin(a) * (R - 0.6), H, 0.8, 0.8, 9, rgb=WHITE, style=PLAIN, paint=0, detail=1, top=WHITE)
    m.prism(circle(0, 0, R + 0.4, 20), H + 9, H + 10.2, rgb=WHITE, style=PLAIN, paint=0, detail=1, top=WHITE, bottom=True, smooth=True)
    m.prism(circle(0, 0, 7, 12), H, H + 1.2, rgb=CONC_D, style=PLAIN, paint=0, detail=1, top=DARK)  # helipad
    return m, dict(h=H, w=44, d=44, fh=3.7, ww=-3.0, y0=0.0, size='tall', s=(0.8, 1.3))

def stepped_tower():
    """Three glass tiers with planted terraces at each step and a spire: the tallest on the skyline."""
    m = Mesh(); H = 185
    tiers = [(32, 0, 92), (25, 92, 148), (18, 148, H)]
    for i, (s, z0, z1) in enumerate(tiers):
        m.prism(chamfer(0, 0, s, s, 2.5), z0, z1, rgb='#ffffff', style=GLASS, paint=1, top=ROOF)
        if i < 2:
            nxt = tiers[i + 1][0]
            off = (s + nxt) / 4
            for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):                         # terrace gardens
                w = (s - nxt) / 2 - 1.2
                if sx: m.box(sx * off, 0, z1, w, nxt - 2, 1.4, rgb=GREEN, style=PLAIN, paint=0, detail=1, top=GREEN)
                else: m.box(0, sy * off, z1, nxt - 2, w, 1.4, rgb=GREEN, style=PLAIN, paint=0, detail=1, top=GREEN)
            parapet(m, 0, 0, s, s, z1, h=1.2, rgb=WHITE, paint=0)
    m.box(0, 0, H, 9, 9, 6, rgb=DARK, style=PLAIN, paint=0, top=ROOF)
    m.prism(circle(0, 0, 1.6, 8), H + 6, H + 40, rgb=WHITE, style=PLAIN, paint=0, detail=1, top=WHITE, top_scale=0.1, smooth=True)
    return m, dict(h=H, w=32, d=32, fh=4.0, ww=3.2, y0=0.0, size='tall', s=(0.8, 1.35))

def slim_residential():
    """A slim apartment tower: a balcony band on every floor wrapping all four sides."""
    m = Mesh(); H = 104; S = 21; fh = 3.2
    m.box(0, 0, 0, S, S, 6, rgb='#2a3038', style=GLASS, paint=0, top=CONC)
    m.box(0, 0, 6, S, S, H - 6, style=PUNCHED, top=ROOF)
    z = 6 + fh
    while z < H - 1:
        m.prism(chamfer(0, 0, S + 2.6, S + 2.6, 1.2), z - 0.25, z, rgb=WHITE, style=PLAIN, paint=0, detail=1, top=WHITE, bottom=True)
        z += fh
    parapet(m, 0, 0, S, S, H, rgb=WALL)
    m.box(0, 3, H, 6, 6, 4.5, rgb=WALL, style=PLAIN, paint=1, detail=1, top=ROOF)
    tanks(m, [(-6, -6), (-3.5, -6), (5, -6)], H)
    return m, dict(h=H, w=S + 2.6, d=S + 2.6, fh=fh, ww=3.4, y0=6.0, size='tall', s=(0.6, 1.2))

def apartment_block():
    """A mid-rise block of flats: balconies on both long sides, a stair core at one end, tanks on top."""
    m = Mesh(); W, D = 38, 15; fh = 3.1; n = 12; H = 4 + n * fh
    m.box(0, 0, 0, W, D, 4, rgb='#e7e1d4', style=PUNCHED, paint=1, top=CONC)
    m.box(0, 0, 4, W, D, H - 4, style=PUNCHED, top=ROOF)
    m.box(W / 2 + 2, 0, 0, 4, 6, H + 3, rgb=WALL, style=PLAIN, paint=1, top=ROOF)   # stair core
    for k in range(1, n + 1):
        z = 4 + k * fh - fh + 0.05
        for y, s in ((-D / 2, -1), (D / 2, 1)):
            m.box(0, y + s * 0.8, z, W - 2, 1.6, 0.22, rgb=WHITE, style=PLAIN, paint=0, detail=1, top=WHITE, bottom=True)
            m.box(0, y + s * 1.55, z + 0.22, W - 2, 0.1, 1.0, rgb=WALL, style=PLAIN, paint=1, detail=1, top=WALL, top_paint=1)
    parapet(m, 0, 0, W, D, H)
    tanks(m, [(-14, -3), (-11.5, -3), (-9, -3), (-6.5, -3), (8, 3), (10.5, 3)], H)
    mast(m, 15, -4, H, 6, 0.12)
    return m, dict(h=H, w=W + 4, d=D + 3.2, fh=fh, ww=3.2, y0=4.0, size='mid', s=(0.8, 1.3))

def office_mid():
    """A low glass office on a colonnade, with a deep roof overhang."""
    m = Mesh(); W, D, H = 32, 24, 30
    m.box(0, 0, 0, W - 5, D - 5, 5, rgb='#1d242b', style=GLASS, paint=0, top=CONC)
    for x in (-13.5, -4.5, 4.5, 13.5):
        for y in (-9.6, 9.6):
            m.box(x, y, 0, 1.1, 1.1, 5, rgb=WALL, style=PLAIN, paint=1, detail=1, top=WALL)
    m.box(0, 0, 5, W, D, H - 5, rgb='#ffffff', style=GLASS, paint=1, top=ROOF, bottom=True)
    m.box(0, 0, H, W + 3, D + 3, 1.2, rgb=WALL, style=PLAIN, paint=1, top=ROOF, bottom=True)
    m.box(6, 2, H + 1.2, 8, 6, 3, rgb=CONC, style=PLAIN, paint=0, detail=1, top=ROOF)
    m.box(-7, -3, H + 1.2, 4, 3, 1.6, rgb=CONC_D, style=PLAIN, paint=0, detail=1, top=CONC_D)
    m.box(-7, 3, H + 1.2, 4, 3, 1.6, rgb=CONC_D, style=PLAIN, paint=0, detail=1, top=CONC_D)
    return m, dict(h=H + 1.2, w=W + 3, d=D + 3, fh=3.6, ww=3.0, y0=5.0, size='mid', s=(0.7, 1.4))

def shophouse():
    """Four storeys over shops: a coloured awning, two balconies, AC units and tanks on the roof."""
    m = Mesh(); W, D, fh = 15, 12, 3.2; H = 4 + 3 * fh
    m.box(0, 0, 0, W, D, 4, rgb='#2a2c30', style=GLASS, paint=0, top=CONC)          # shop fronts
    m.box(0, 0, 4, W, D, H - 4, style=PUNCHED, top=ROOF)
    m.box(0, -D / 2 - 1.2, 3.2, W, 2.4, 0.18, rgb=AWN[0], style=PLAIN, paint=0, detail=1, top=AWN[0], bottom=True)
    for k in (1, 2):
        z = 4 + k * fh
        m.box(-3, -D / 2 - 0.6, z - 0.2, 6, 1.2, 0.2, rgb=WHITE, style=PLAIN, paint=0, detail=1, top=WHITE, bottom=True)
        m.box(-3, -D / 2 - 1.15, z, 6, 0.1, 1.0, rgb=DARK, style=PLAIN, paint=0, detail=1, top=DARK)
    ac_units(m, -D / 2, [4.5], [5.5, 8.7, 11.9], out=-1)
    parapet(m, 0, 0, W, D, H)
    m.box(4, 2, H, 3.5, 3.5, 2.6, rgb=WALL, style=PLAIN, paint=1, detail=1, top=ROOF)
    tanks(m, [(-4.5, 2.5), (-2, 2.5)], H, r=0.8, h=1.4)
    return m, dict(h=H, w=W, d=D + 2.4, fh=fh, ww=3.0, y0=4.0, size='low', s=(0.85, 1.25))

def house():
    """Two storeys under a pitched tin roof, a veranda on the front."""
    m = Mesh(); W, D, H = 13, 10, 6.6
    m.box(0, 0, 0, W, D, H, style=PUNCHED, top=ROOF, )
    roof = [(-W / 2 - 0.8, -D / 2 - 0.8), (W / 2 + 0.8, -D / 2 - 0.8), (W / 2 + 0.8, D / 2 + 0.8), (-W / 2 - 0.8, D / 2 + 0.8)]
    ridge = 2.8
    a, b, c, d = [(x, y, H) for x, y in roof]
    m.face([a, b, (W / 2 + 0.8, 0, H + ridge), (-W / 2 - 0.8, 0, H + ridge)], RUST, PLAIN, 0, 0)
    m.face([c, d, (-W / 2 - 0.8, 0, H + ridge), (W / 2 + 0.8, 0, H + ridge)], RUST, PLAIN, 0, 0)
    m.face([b, c, (W / 2 + 0.8, 0, H + ridge)], WALL, PLAIN, 1, 0)
    m.face([d, a, (-W / 2 - 0.8, 0, H + ridge)], WALL, PLAIN, 1, 0)
    m.face([a, d, c, b], RUST, PLAIN, 0, 0)                                        # eaves underside
    m.box(0, -D / 2 - 1.3, 0, W - 2, 2.6, 0.25, rgb=CONC, style=PLAIN, paint=0, detail=1, top=CONC)
    for x in (-5, -1.7, 1.7, 5):
        m.box(x, -D / 2 - 2.4, 0.25, 0.35, 0.35, 2.9, rgb=WHITE, style=PLAIN, paint=0, detail=1, top=WHITE)
    m.box(0, -D / 2 - 1.3, 3.15, W - 1.6, 2.9, 0.2, rgb=TEAL, style=PLAIN, paint=0, detail=1, top=TEAL, bottom=True)
    tanks(m, [(W / 2 + 1.6, 3)], 0, r=0.8, h=1.6)
    return m, dict(h=H, w=W + 1.6, d=D + 3, fh=3.3, ww=3.2, y0=0.0, size='low', s=(0.85, 1.2))


DESIGNS = [glass_tower, office_slab, round_tower, stepped_tower, slim_residential, apartment_block, office_mid, shophouse, house]


def to_object(m, name):
    me = bpy.data.meshes.new(name)
    bmesh.ops.remove_doubles(m.bm, verts=m.bm.verts, dist=1e-4)
    m.bm.to_mesh(me); m.bm.free()
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.active_color_index = me.color_attributes.render_color_index = 0
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob

def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    objs, metas = [], {}
    for i, fn in enumerate(DESIGNS):
        m, meta = fn()
        ob = to_object(m, fn.__name__ + '_0')
        ob.location = ((i % 5) * 400.0, (i // 5) * 400.0, 0)     # apart, so they don't shade each other
        objs.append(ob); metas[fn.__name__] = meta
    # ground under each, for the dark where the walls meet it (not exported)
    grounds = []
    for ob in objs:
        bpy.ops.mesh.primitive_plane_add(size=160, location=ob.location)
        grounds.append(bpy.context.object)

    # one UV layout for all of them, in proportion to their real size
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')

    # bake ambient occlusion into one map
    img = bpy.data.images.new('city_ao', 1024, 1024, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new('city'); mat.use_nodes = True
    nt = mat.node_tree; tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    tex.interpolation = 'Linear'
    nt.links.new(tex.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    nt.nodes.active = tex
    for ob in objs: ob.data.materials.append(mat)
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64
    sc.world = bpy.data.worlds.new('w'); sc.world.light_settings.distance = 7.0
    sc.render.bake.margin = 6
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type='AO', use_clear=True)
    for g in grounds: bpy.data.objects.remove(g)

    # LOD 1: the same building without its detail parts
    lods = []
    report = {}
    for ob in objs:
        lo = ob.copy(); lo.data = ob.data.copy(); lo.name = ob.name[:-2] + '_1'
        bpy.context.collection.objects.link(lo)
        bm = bmesh.new(); bm.from_mesh(lo.data)
        det = bm.faces.layers.int['detail']
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[det]], context='FACES')
        bm.to_mesh(lo.data); bm.free()
        lods.append(lo)
        key = ob.name[:-2]; meta = metas[key]
        for o, lod in ((ob, 0), (lo, 1)):
            o.location = (0, 0, 0)
            for k, v in meta.items(): o[k] = list(v) if isinstance(v, tuple) else v
            o['design'] = key; o['lod'] = lod
        report[key] = [tris(ob), tris(lo)]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs + lods: o.select_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=f'{ROOT}/art/buildings/city.blend')
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_normals=True, export_materials='EXPORT', export_extras=True,
        export_image_format='JPEG', export_jpeg_quality=72, export_texcoords=True)
    img.filepath_raw = '/tmp/city_ao.png'; img.file_format = 'PNG'; img.save()
    report['bytes'] = os.path.getsize(OUT)
    print('REPORT', json.dumps(report))

    if '--render' in ARGS:
        render(ARGS[ARGS.index('--render') + 1], objs, lods)


def render(path, objs, lods):
    """A check sheet: every design side by side in late sun, with the baked shading."""
    sc = bpy.context.scene
    for lo in lods: lo.hide_render = True
    x = 0
    for ob in objs:
        w = ob['w']; ob.location = (x + w / 2, 0, 0); x += w + 14
    bpy.ops.mesh.primitive_plane_add(size=2000, location=(x / 2, 0, 0))
    g = bpy.context.object; gm = bpy.data.materials.new('g'); gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.25, 0.3, 0.2, 1); g.data.materials.append(gm)
    # show the colour attribute times the baked AO
    mat = objs[0].data.materials[0]; nt = mat.node_tree
    ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    tex = [n for n in nt.nodes if n.type == 'TEX_IMAGE'][0]
    nt.links.new(ca.outputs['Color'], mix.inputs[6]); nt.links.new(tex.outputs['Color'], mix.inputs[7])
    nt.links.new(mix.outputs[2], nt.nodes['Principled BSDF'].inputs['Base Color'])
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 4
    sun.rotation_euler = (math.radians(55), 0, math.radians(35)); sc.collection.objects.link(sun)
    sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.65, 0.8, 1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
    cam.location = (x / 2, -330, 120); cam.rotation_euler = (math.radians(78), 0, 0); cam.data.lens = 24
    sc.camera = cam; sc.render.resolution_x, sc.render.resolution_y = 1800, 700; sc.cycles.samples = 32
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)


main()
