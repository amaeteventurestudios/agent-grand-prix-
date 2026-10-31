# The second-generation car kit: long, low, sharp-edged bodies like the reference pictures.
#
# Every body panel is lofted from cross-sections made of a few key points joined by gently bulged
# curves. A key can be sharp, and a sharp key runs as a crisp crease the whole length of the panel
# (the nose ridge, the chines, the sidepod shoulders), which is what gives the cars their chiselled,
# premium look under studio light. Shape tables list those key points at a few stations along the
# car; the kit resamples them with smooth splines, so the surfaces flow.
#
# Three kinds of cross-section:
#   mirror  a centre-line body (nose, tub, engine cover): keys from the bottom of the centre line,
#           out along the left side and back to the top of the centre line; the right side mirrors it
#   loop    a closed body off the centre line (a sidepod): keys all the way round, built on the left
#           and mirrored to the right
#   shell   a wall with a thickness (a wheel pod, a fender): an open line of keys, outer face first
# Each key is (y, z, bulge) or (y, z, bulge, dx): bulge pushes the curve to the next key outward (a
# share of its length), dx moves that key forward or back so an opening can be raked.
#
# Paint rules get a Q for each vertex: x and u (the place round the section, counted in keys, so 2.5
# is halfway from key 2 to key 3), s (+1 left side, -1 right), inner (the inside of a shell), cap (an
# end face), and p, n (position and normal). The kit samples each rule a little either side of the
# vertex, so the 0.5 edge the game draws lands on the rule's own line: crisp stripes along creases.
import math, bpy, bmesh
from mathutils import Vector, Matrix
from carkit import (PAINT, CARBON, METAL, RUBBER, P1, P2, GLOW, CF, MT, RB, WHEELS, naca, wing, strut, lathe,
                    paint, solid, join, tris, empty, resample, finish, superellipse, loft)

def solid(c):
    """One colour everywhere (works as a carkit paint rule or a Q rule)."""
    return lambda *a: c

class Q:
    __slots__ = ('x', 'u', 's', 'inner', 'cap', 'p', 'n')
    def __init__(self, x, u, s, inner, cap, p, n):
        self.x, self.u, self.s, self.inner, self.cap, self.p, self.n = x, u, s, inner, cap, p, n

def _flat(rows):
    out = []
    for x, keys in rows:
        t = [x]
        for k in keys: t += [k[0], k[1], k[2], k[3] if len(k) > 3 else 0.0]
        out.append(tuple(t))
    return out

def _unflat(t):
    return t[0], [t[i:i + 4] for i in range(1, len(t), 4)]

def _curve(keys, sharp, segs, closed=False):
    """Points (y, z, dx) through the keys, each point's u, and the indices of sharp points."""
    pts, us, sh = [], [], []
    n = len(keys)
    for i in range(n if closed else n - 1):
        ay, az, ab, adx = keys[i]; by, bz, bb, bdx = keys[(i + 1) % n]
        dy, dz = by - ay, bz - az; L = math.hypot(dy, dz) or 1e-6
        ny, nz = dz / L, -dy / L
        cy, cz = (ay + by) / 2 + ny * ab * L, (az + bz) / 2 + nz * ab * L
        k = segs[i]
        for j in range(k):
            t = j / k
            if j == 0 and sharp[i]: sh.append(len(pts))
            pts.append(((1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by,
                        (1 - t) ** 2 * az + 2 * (1 - t) * t * cz + t * t * bz, adx + (bdx - adx) * t))
            us.append(i + t)
    if not closed:
        y, z, b, dx = keys[-1]
        if sharp[-1]: sh.append(len(pts))
        pts.append((y, z, dx)); us.append(n - 1.0)
    return pts, us, sh

def _offset(pts, t):
    """The inner face of an open line of (y, z, dx) points, t inward (to the left of travel)."""
    out = []
    for i, (y, z, dx) in enumerate(pts):
        a = pts[max(0, i - 1)]; b = pts[min(len(pts) - 1, i + 1)]
        dy, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dy, dz) or 1e-6
        out.append((y - dz / L * t, z + dy / L * t, dx))
    return out

def _scale(lod_segs, lod):
    return [max(1, int(round(k * (1.0, 0.4, 0.2)[lod]))) for k in lod_segs]

def panel(name, rows, sharp, segs, rule, lod, mode='mirror', s=1, step=None, t=0.03, yoff=0.0,
          cap=('fan', 'fan'), smooth_paint=True):
    """Loft one panel from a shape table. Returns the object (painted). The right-hand copy of a
    loop or shell panel (s=-1) is the left one mirrored, so both sides match exactly."""
    if s < 0 and mode != 'mirror':
        return mirror_y(panel(name, rows, sharp, segs, rule, lod, mode, 1, step, t, yoff, cap, smooth_paint))
    step = step or (0.07, 0.16, 0.4)[lod]
    sg = _scale(segs, lod)
    table = [_unflat(r) for r in resample(_flat(rows), step)]
    rings, meta, sharp_cols = [], [], set()
    for (x, keys) in table:
        if mode == 'mirror':
            pts, us, sh = _curve(keys, sharp, sg)
            ring = [(x + dx, y, z) for (y, z, dx) in pts] + [(x + dx, -y, z) for (y, z, dx) in pts[-2:0:-1]]
            m = [(x, u, 1, False) for u in us] + [(x, u, -1, False) for u in us[-2:0:-1]]
            n0 = len(pts)
            cols = set(sh) | {2 * n0 - 2 - i for i in sh if 0 < i < n0 - 1}
        elif mode == 'loop':
            pts, us, sh = _curve(keys, sharp, sg, closed=True)
            ring = [(x + dx, s * (y + yoff), z) for (y, z, dx) in pts]
            m = [(x, u, s, False) for u in us]
            cols = set(sh)
        else:  # shell
            pts, us, sh = _curve(keys, sharp, sg)
            inn = _offset(pts, t)
            ring = [(x + dx, s * y, z) for (y, z, dx) in pts] + [(x + dx, s * y, z) for (y, z, dx) in inn[::-1]]
            n0 = len(pts)
            m = [(x, u, s, False) for u in us] + [(x, u, s, True) for u in us[::-1]]
            cols = set(sh) | {2 * n0 - 1 - i for i in sh} | {0, n0 - 1, n0, 2 * n0 - 1}
        rings.append([Vector(p) for p in ring]); meta.append(m); sharp_cols = cols
    return _mesh(name, rings, meta, sharp_cols, rule, cap, smooth_paint, closed=True)

def _mesh(name, rings, meta, sharp_cols, rule, cap, smooth_paint, closed=True):
    bm = bmesh.new()
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    vmeta = [mm for row in meta for mm in row]
    m = len(rings[0])
    faces = []
    for a, b in zip(vs, vs[1:]):
        for i in range(m if closed else m - 1):
            j = (i + 1) % m
            try:
                f = bm.faces.new((a[i], a[j], b[j], b[i])); f.smooth = True
            except ValueError: pass
    bm.edges.ensure_lookup_table()
    for a, b in zip(vs, vs[1:]):
        for i in sharp_cols:
            e = bm.edges.get((a[i], b[i]))
            if e: e.smooth = False
    capmeta = []
    for end, (r, mm, kind) in enumerate(((vs[0], meta[0], cap[0]), (vs[-1], meta[-1], cap[1]))):
        if not kind: continue
        flip = end == 0
        if kind == 'ngon':
            f = bm.faces.new(r[::-1] if flip else r)
            res = bmesh.ops.triangulate(bm, faces=[f], quad_method='BEAUTY', ngon_method='EAR_CLIP')
            for ff in res['faces']: ff.smooth = False
        else:
            c = sum((v.co for v in r), Vector()) / len(r)
            cv = bm.verts.new(c); capmeta.append((mm[0][0], -1.0, 1, False, True))
            for i in range(m):
                q = (r[i], r[(i + 1) % m], cv)
                ff = bm.faces.new(q[::-1] if flip else q); ff.smooth = False
        for i in range(m):
            e = bm.edges.get((r[i], r[(i + 1) % m]))
            if e: e.smooth = False
    vmeta += capmeta
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    # paint per vertex. Each colour channel stores how far the vertex is from that channel's nearest
    # edge (found by walking the rule along the section and along the car), so the game's 0.5 step,
    # interpolated across each triangle, lands exactly on the rule's line: straight, crisp stripes.
    cols = []
    bm.verts.ensure_lookup_table()
    nr = len(rings)
    N = 14
    for vi, v in enumerate(bm.verts):
        x, u, s, inner, *rest = vmeta[vi]
        capv = bool(rest and rest[0])
        base = rule(Q(x, u, s, inner, capv, v.co, v.normal))
        if not (vi < nr * m and smooth_paint):
            cols.append(tuple(base)); continue
        ri, ci = divmod(vi, m)
        P = rings[ri]
        dx = max(abs(meta[min(nr - 1, ri + 1)][ci][0] - x), abs(x - meta[max(0, ri - 1)][ci][0]), 1e-3)
        cn, cp = (ci + 1) % m, (ci - 1) % m
        dun = meta[ri][cn][1] - u; dup = u - meta[ri][cp][1]
        mun = (P[cn] - P[ci]).length / dun if 1e-4 < dun < 1.5 else None
        mup = (P[ci] - P[cp]).length / dup if 1e-4 < dup < 1.5 else None
        mu = mun or mup or 0.05
        D = max(dx, (P[cn] - P[ci]).length, (P[ci] - P[cp]).length, 1e-3)
        near = [[9.0, 9.0] for _ in range(3)]  # per channel: nearest edge across (u) and along (x), metres
        for axis, sgn in ((0, 1), (0, -1), (1, 1), (1, -1)):
            hit = [False] * 3
            for k in range(1, N + 1):
                t = D * k / N
                q = Q(x + sgn * t, u, s, inner, False, v.co, v.normal) if axis else Q(x, u + sgn * t / mu, s, inner, False, v.co, v.normal)
                c = rule(q)
                for ch in range(3):
                    if not hit[ch] and (c[ch] > 0.5) != (base[ch] > 0.5):
                        hit[ch] = True
                        near[ch][axis] = min(near[ch][axis], t - D / (2 * N))
                if all(hit): break
        out = []
        for ch in range(3):
            au, ax = near[ch]
            d = (au * ax / math.sqrt(au * au + ax * ax)) if au < 9 and ax < 9 else min(au, ax)
            sg = 1 if base[ch] > 0.5 else -1
            out.append(min(1.0, max(0.0, 0.5 + sg * 0.5 * d / D)))
        out.append(base[3])
        cols.append(tuple(out))
    # end caps take the colour of the face, not the ring
    bm.faces.index_update()
    capcol = {}
    for f in bm.faces:
        if not f.smooth:
            c = f.calc_center_median()
            capcol[f.index] = tuple(rule(Q(c.x, -1.0, 1 if c.y >= 0 else -1, False, True, c, f.normal)))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); me.color_attributes.active_color = attr
    for p in me.polygons:
        cc = capcol.get(p.index)
        for li, vi in zip(p.loop_indices, p.vertices):
            attr.data[li].color = cc if cc else cols[vi]
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob

def flat_paint(ob, rule):
    """Per-face paint for flat-shaded parts (plates)."""
    me = ob.data
    attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = attr
    for p in me.polygons:
        c = ob.matrix_world @ p.center
        col = rule(Q(c.x, -1.0, 1 if c.y >= 0 else -1, False, False, c, p.normal))
        for li in p.loop_indices: attr.data[li].color = col
    return ob

def plate(name, poly, thick, rule, frame='xz', at=0.0, tilt=0.0, pivot=None, smooth_rule=False):
    """A flat plate cut to a polygon and given a thickness: endplates, fins, pylons (frame 'xz',
    points (x, z), standing at y = at) or floors and deflectors (frame 'xy', points (x, y), at z = at).
    tilt leans it (degrees) about the X axis through pivot."""
    bm = bmesh.new()
    def P(a, b, o):
        return Vector((a, at + o, b)) if frame == 'xz' else Vector((a, b, at + o))
    v0 = [bm.verts.new(P(a, b, -thick / 2)) for (a, b) in poly]
    v1 = [bm.verts.new(P(a, b, thick / 2)) for (a, b) in poly]
    n = len(poly)
    fs = [bm.faces.new(v0[::-1]), bm.faces.new(v1)]
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((v0[i], v0[j], v1[j], v1[i]))
    bmesh.ops.triangulate(bm, faces=fs, quad_method='BEAUTY', ngon_method='EAR_CLIP')
    if tilt:
        pv = Vector(pivot) if pivot else Vector((0, at, 0))
        bmesh.ops.rotate(bm, verts=bm.verts, cent=pv, matrix=Matrix.Rotation(math.radians(tilt), 3, 'X'))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces: f.smooth = False
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return flat_paint(ob, rule)

def mirror_y(ob, keep=False):
    """The object mirrored to the other side of the car (a copy if keep, else the object itself)."""
    me = ob.data.copy() if keep else ob.data
    me.transform(Matrix.Scale(-1, 4, (0, 1, 0)))
    me.flip_normals()
    if not keep: return ob
    o2 = bpy.data.objects.new(ob.name + '_m', me); bpy.context.collection.objects.link(o2)
    return o2

def blade_wing(name, stations, lod, rule, camber=0.05, thick_scale=1.0):
    """A wing along stations (y, x_le, z, chord, thick, pitch), painted per vertex with rule(Q):
    Q.u is the place along the chord (0 leading edge, 1 trailing edge), Q.x the span position |y|."""
    n = (12, 6, 3)[lod]
    rings, meta = [], []
    for (y, x, z, chord, th, pitch) in stations:
        a = math.radians(pitch)
        ring, mm = [], []
        prof = naca(chord, th * thick_scale, n, camber)
        for (uu, vv) in prof:
            px, pz = -uu, vv
            ring.append(Vector((x + px * math.cos(a) - pz * math.sin(a), y, z + px * math.sin(a) + pz * math.cos(a))))
            mm.append((abs(y), uu / chord, 1 if y >= 0 else -1, vv < 0))
        rings.append(ring); meta.append(mm)
    return _mesh(name, rings, meta, {n}, rule, ('fan', 'fan'), True)

def span(stations_fn, ys):
    return [stations_fn(y) for y in ys]

# ---------------------------------------------------------------- wheels
def wheel(name, key, lod, ring=P2, spokes=10, style='turbine', lip=True, tyre_ring=None):
    """A low-profile tyre on a big rim: dished face, spokes, a painted lip, a brake disc behind."""
    x, y, r, w = WHEELS[key]
    s = 1 if y > 0 else -1
    hw = w / 2
    rr = 0.252
    segs = (40, 18, 8)[lod]
    tyre = [(rr + 0.004, -hw + 0.022), (rr + 0.02, -hw + 0.002), (r - 0.034, -hw), (r - 0.007, -hw + 0.022), (r, -hw + 0.055),
            (r, hw - 0.055), (r - 0.007, hw - 0.022), (r - 0.034, hw), (rr + 0.02, hw - 0.002), (rr + 0.004, hw - 0.022)]
    t = lathe(name + '_tyre', tyre, segs)
    def tyre_paint(p, n):
        rad = Vector((p.x, 0, p.z)).length
        if tyre_ring and p.y * s > hw - 0.02 and rr + 0.018 < rad < rr + 0.036: return tyre_ring
        return RB
    paint(t, tyre_paint)
    parts = [t]
    face = hw * s
    if lod == 2:
        rm = lathe(name + '_rim', [(0.0, face * 0.6), (rr, face * 0.9), (rr, -face * 0.9)], segs)
        paint(rm, lambda p, n: MT)
        parts.append(rm)
    else:
        rim = [(0.0, face * 0.42), (0.05, face * 0.46), (0.07, face * 0.4), (rr - 0.03, face * 0.6), (rr - 0.012, face * 0.9), (rr, face * 0.94), (rr, -face * 0.9)]
        rm = lathe(name + '_rim', rim, segs)
        paint(rm, lambda p, n: ring if lip and Vector((p.x, 0, p.z)).length > rr - 0.016 and p.y * s > hw * 0.8 else MT)
        parts.append(rm)
        # spokes: blades from the hub to the lip, swept like a turbine
        ns = spokes if lod == 0 else max(5, spokes // 2)
        for k in range(ns):
            a0 = 2 * math.pi * k / ns
            ringset = []
            steps = 4 if lod == 0 else 2
            for j in range(steps + 1):
                f = j / steps
                rad = 0.06 + f * (rr - 0.075)
                sweep = (0.55 * f * f if style == 'turbine' else 0.0)
                a = a0 + sweep
                wdt = 0.024 - 0.008 * f if style == 'turbine' else 0.03 - 0.01 * f
                yy = face * (0.5 + 0.38 * f)
                c, sn = math.cos(a), math.sin(a)
                tx, tz = -sn, c
                pts = []
                for (dw, dd) in ((-wdt, 0.0), (wdt, 0.0), (wdt * 0.6, -0.022 * s), (-wdt * 0.6, -0.022 * s)):
                    pts.append(Vector((rad * c + tx * dw, yy + dd, rad * sn + tz * dw)))
                ringset.append(pts)
            sp = loft(name + '_spoke', ringset)
            paint(sp, solid(MT))
            parts.append(sp)
        hub = lathe(name + '_hub', [(0.0, face * 0.98), (0.035, face * 0.95), (0.05, face * 0.8), (0.06, face * 0.45)], (16, 8, 4)[lod])
        paint(hub, solid(ring if lip else MT))
        parts.append(hub)
        disc = lathe(name + '_disc', [(0.08, -face * 0.1), (0.2, -face * 0.1), (0.2, face * 0.1), (0.08, face * 0.1)], (24, 12, 6)[lod])
        paint(disc, solid(CF))
        parts.append(disc)
    wob = join(name, parts)
    wob.location = (x, y, r)
    for p in wob.data.polygons: p.use_smooth = True
    return wob

def helmet(hx, lod, rule=None):
    h = loft('helmet', [superellipse(hx + dx, w, 0.52 - hh, 0.52 + hh, (14, 10, 6)[lod], 2, 2) for (dx, w, hh) in
                        ((0.17, 0.02, 0.02), (0.12, 0.1, 0.1), (0.0, 0.13, 0.13), (-0.14, 0.11, 0.11), (-0.21, 0.03, 0.03))])
    finish(h, 1 if lod == 0 else 0)
    return paint(h, rule or (lambda p, n: CF if n.x > 0.5 and p.z > 0.49 else P2))

CAMS = {  # attachment points in the car frame
    'cam_chase': (-5.2, 0, 1.9), 'cam_cockpit': (0.35, 0, 0.78), 'cam_front': (3.2, 0, 0.35),
    'cam_rear': (-2.9, 0, 1.25), 'cam_wheel': (1.2, 1.15, 0.45), 'cam_top': (0, 0, 9.0),
}

# ---------------------------------------------------------------- the parts every car shares
def panel_inlet(name, rows, sharp, segs, rule, lod, s=1, depth=0.3, inset=0.035, step=None):
    """A closed loop panel (sidepod) with an intake mouth at the front: the lip, then a duct going in."""
    if s < 0:
        return mirror_y(panel_inlet(name, rows, sharp, segs, rule, lod, 1, depth, inset, step))
    ob = panel(name, rows, sharp, segs, rule, lod, mode='loop', s=s, step=step, cap=(None, 'fan'))
    # the duct: the lip ring shrunk toward its middle, then pushed back into the pod
    x0, keys = rows[0]
    sg = _scale(segs, lod)
    pts, us, sh = _curve([tuple(k) + (0.0,) * (4 - len(k)) for k in keys], sharp, sg, closed=True)
    cy = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
    def ring(dxx, k):
        out = []
        for (y, z, dx) in pts:
            vy, vz = y - cy, z - cz; L = math.hypot(vy, vz) or 1e-6
            f = max(0.0, 1 - k / L)
            out.append(Vector((x0 + dx + dxx, s * (cy + vy * f), cz + vz * f)))
        return out
    lipr = [Vector((x0 + dx, s * y, z)) for (y, z, dx) in pts]
    rings = [ring(-depth, inset * 1.6), ring(-0.02, inset), lipr]
    meta = [[(x0 - depth, u, s, True) for u in us], [(x0 - 0.02, u, s, 'lip') for u in us], [(x0, u, s, 'lip') for u in us]]
    duct = _mesh(name + '_duct', rings, meta, set(sh), rule, ('fan', None), False)
    return join(name, [ob, duct])

def floor(S, lod, parts, rule):
    pts = S['floor']  # left half outline, front to back, (x, y)
    poly = pts + [(x, -y) for (x, y) in pts[::-1]]
    parts.append(plate('floor', poly, 0.026, rule, frame='xy', at=0.068))
    if lod < 2:
        for (x0, x1, y, h) in S.get('floor_fences', ()):
            for s in (1, -1):
                parts.append(plate('fence', [(x0, 0.08), (x1, 0.08), (x1 + 0.04, 0.08 + h), (x0 - 0.06, 0.08 + h * 0.6)], 0.012,
                                   rule, at=s * y))

def diffuser(S, lod, parts, light=True):
    x0, x1, w = S.get('diffuser', (-1.85, -2.42, 0.56))
    d = plate('diffuser', [(x0, -w), (x1, -w), (x1, w), (x0, w)], 0.02, solid(CF), frame='xy', at=0.0)
    # tilt the ramp up toward the back
    for v in d.data.vertices:
        f = (x0 - v.co.x) / (x0 - x1); v.co.z += 0.07 + f * 0.17
    parts.append(d)
    if lod < 2:
        for yy in (-0.42, -0.21, 0.0, 0.21, 0.42):
            parts.append(plate('strake', [(x0, 0.07), (x1, 0.24), (x1, 0.33), (x0 + 0.1, 0.12)], 0.012, solid(CF), at=yy))
    if light:
        parts.append(plate('rainlight', [(x1 - 0.01, 0.26), (x1 - 0.05, 0.26), (x1 - 0.05, 0.32), (x1 - 0.01, 0.32)], 0.16,
                           lambda q: GLOW if q.n.x < -0.5 else CF, at=0.0))

def rear_wing(S, lod, parts):
    R = S['rwing']
    for k, el in enumerate(R['elements']):
        ys = [t * R['span'] for t in (-1, -0.8, -0.55, -0.3, 0, 0.3, 0.55, 0.8, 1)] if lod < 2 else [-R['span'], 0, R['span']]
        st = [el(y) for y in ys]
        parts.append(blade_wing('rwing%d' % k, st, lod, (lambda q, k=k: R['paint'](k, q))))
    for s in (1, -1):
        parts.append(plate('rplate', R['plate'], R.get('plate_t', 0.026), (lambda q: R['plate_paint'](q)), at=s * (R['span'] + 0.012)))
    for (yy, poly, t) in R.get('pylons', ()):
        parts.append(plate('pylon', poly, t, R.get('pylon_paint', solid(CF)), at=yy))

def front_wing(S, lod, parts):
    F = S['fwing']
    for k, (ys, el) in enumerate(F['elements']):
        yy = ys if lod == 0 else ys[::2] if lod == 1 else [ys[0], ys[-1]]
        if yy[-1] != ys[-1]: yy = list(yy) + [ys[-1]]
        if ys[0] >= 0:  # one side's element: build it for both sides
            for s in (1, -1):
                st = [el(y) for y in yy]
                st = [(s * a, b, c, d, e, f) for (a, b, c, d, e, f) in st]
                if s < 0: st = st[::-1]
                parts.append(blade_wing('fwing%d' % k, st, lod, (lambda q, k=k: F['paint'](k, q))))
        else:
            parts.append(blade_wing('fwing%d' % k, [el(y) for y in yy], lod, (lambda q, k=k: F['paint'](k, q))))
    for s in (1, -1):
        if F.get('plate'):
            parts.append(plate('fplate', F['plate'], 0.024, F.get('plate_paint', solid(CF)), at=s * F['plate_y']))

def canopy(S, lod):
    C = S['canopy']
    n = (28, 16, 8)[lod]
    rings = [superellipse(x, w, C['zb'], zt, n, C.get('round', 2.2), 2.0) for (x, w, zt) in resample(C['rows'], (0.08, 0.2, 0.5)[lod])]
    g = finish(loft('glass', rings), 0)
    paint(g, solid((0, 0, 0, 1)))
    return g

def halo_bar(S, lod, parts, rule):
    C = S['canopy']
    if lod == 2 or not C.get('bar'): return
    x0, x1, w = C['bar']
    rows = [r for r in resample(C['rows'], 0.08) if x1 <= r[0] <= x0]
    rings = []
    for (x, ww, zt) in rows:
        rings.append([Vector((x, dy, zt + dz)) for (dy, dz) in ((-w, -0.004), (w, -0.004), (w * 0.7, 0.016), (-w * 0.7, 0.016))])
    parts.append(paint(finish(loft('bar', rings), 0, False), lambda p, n: rule(Q(p.x, 0, 1, False, False, p, n))))

def mirrors(S, lod, parts, rule):
    if lod == 2: return
    mx, my, mz = S.get('mirror_at', (0.8, 0.46, 0.66))
    for s in (1, -1):
        parts.append(paint(finish(strut('mstalk', (mx - 0.08, s * (my - 0.2), mz - 0.12), (mx, s * my, mz), 0.03, 0.014), 0), solid(CF)))
        rings = []
        for (dx, w, h) in ((0.09, 0.045, 0.02), (0.06, 0.08, 0.035), (-0.03, 0.085, 0.038), (-0.05, 0.07, 0.03)):
            rings.append([Vector((mx + dx, s * my + yy * w, mz + zz * h)) for (yy, zz) in ((-1, -1), (1, -1), (1.1, 0.6), (0.6, 1), (-0.6, 1), (-1.1, 0.6))])
        mo = loft('mirror', rings)
        for p in mo.data.polygons: p.use_smooth = False
        parts.append(flat_paint(mo, rule))

def suspension(S, lod, parts):
    if lod == 2: return
    for s in (1, -1):
        x, y, r, w = WHEELS['FL']
        for (z0, z1) in ((0.2, 0.23), (0.38, 0.45)):
            for dx in (0.24, -0.22):
                parts.append(paint(finish(strut('arm', (x + dx, s * 0.22, z0), (x, s * 0.64, z1), 0.04, 0.014), 0), solid(CF)))
        parts.append(paint(finish(strut('push', (x - 0.03, s * 0.62, 0.21), (x - 0.25, s * 0.2, 0.42), 0.028, 0.028), 0), solid(MT)))
        x, y, r, w = WHEELS['RL']
        for (z0, z1) in ((0.2, 0.23), (0.4, 0.45)):
            for dx in (0.26, -0.12):
                parts.append(paint(finish(strut('arm', (x + dx, s * 0.14, z0 + 0.02), (x, s * 0.6, z1), 0.04, 0.014), 0), solid(CF)))
        parts.append(paint(finish(strut('shaft', (x, s * 0.1, 0.32), (x, s * 0.6, 0.34), 0.035, 0.035), 0), solid(MT)))

def arc_fender(name, key, a0, a1, prof, sharp, segs, rule, lod, radius=0.04, t=0.022, steps=None):
    """A fender swept round a wheel from angle a0 to a1 (degrees: 0 forward, 90 straight up). prof is
    an open line of keys (y across the tyre from its inner face, d out from the tyre, bulge), outer
    face first; Q.x is the angle, Q.u the place along the profile."""
    x, y, r, w = WHEELS[key]
    sg = _scale(segs, lod)
    pts, us, sh = _curve([tuple(k) + (0.0,) * (4 - len(k)) for k in prof], sharp, sg)
    inn = _offset(pts, t)
    n = steps or (26, 12, 6)[lod]
    rings, meta = [], []
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n
        c, s_ = math.cos(math.radians(a)), math.sin(math.radians(a))
        ring = []
        for (py, pd, _) in pts + inn[::-1]:
            rr = r + radius + pd
            ring.append(Vector((x + c * rr, y - w / 2 + py, r + s_ * rr)))
        rings.append(ring)
        meta.append([(a, u, 1, False) for u in us] + [(a, u, 1, True) for u in us[::-1]])
    n0 = len(pts)
    cols = set(sh) | {2 * n0 - 1 - i for i in sh} | {0, n0 - 1, n0, 2 * n0 - 1}
    return _mesh(name, rings, meta, cols, rule, ('ngon', 'ngon'), True)

def build_car(S, lod):
    """Assemble a car from its spec (see falcon.py for every field)."""
    parts = []
    parts.append(panel('body', S['BODY'], S.get('body_sharp', (False, True, True, True, True)), S['body_segs'], S['body_rule'], lod))
    for s in (1, -1):
        if S.get('POD'):
            parts.append(panel_inlet('pod', S['POD'], S.get('pod_sharp', (False, True, True, True, True)), S['pod_segs'], S['pod_rule'], lod,
                                     s=s, depth=0.3, inset=S.get('pod_inset', 0.04)))
        if S.get('NAC'):
            N = S['NAC']
            parts.append(panel('nacelle', N['rows'], N['sharp'], N['segs'], N['rule'], lod, mode='shell', s=s, t=0.03,
                               step=(0.06, 0.14, 0.35)[lod], cap=('ngon', 'ngon')))
            x0, x1, y0, y1 = N['mouth']
            parts.append(plate('mouthfloor', [(x0, s * y0), (x0, s * y1), (x1, s * y1), (x1, s * y0)], 0.02, solid(CF), frame='xy', at=0.07))
            if lod == 0:
                for z in N.get('vanes', ()):
                    parts.append(plate('vane', [(x0 - 0.02, s * (y0 + 0.01)), (x0 - 0.02, s * (y1 - 0.01)), (x0 - 0.24, s * (y1 - 0.01)), (x0 - 0.24, s * (y0 + 0.01))],
                                       0.012, solid(CF), frame='xy', at=z))
        for F in S.get('FENDERS', ()):
            key = F['key'] if s > 0 else F['key'][0] + 'R'
            f = arc_fender('fender', F['key'], F['a0'], F['a1'], F['prof'], F['sharp'], F['segs'], F['rule'], lod, F.get('radius', 0.04), F.get('t', 0.022))
            parts.append(mirror_y(f) if s < 0 else f)
            if lod < 2 and F.get('stay'):
                for (p0, p1) in F['stay']:
                    parts.append(paint(finish(strut('stay', (p0[0], s * p0[1], p0[2]), (p1[0], s * p1[1], p1[2]), 0.06, 0.02), 0), solid(CF)))
    floor(S, lod, parts, S.get('floor_rule', lambda q: P2 if abs(q.n.y) > 0.6 and abs(q.p.y) > 0.55 else CF))
    diffuser(S, lod, parts)
    front_wing(S, lod, parts)
    rear_wing(S, lod, parts)
    if S.get('AIRBOX'):
        A = S['AIRBOX']
        parts.append(panel('airbox', A['rows'], A['sharp'], A['segs'], A['rule'], lod, cap=('ngon' if A.get('open') else 'fan', 'fan')))
    if lod < 2 and S.get('fin'):
        poly, rule = S['fin']
        parts.append(plate('fin', poly, 0.016, rule, at=0.0))
    halo_bar(S, lod, parts, S.get('bar_rule', lambda q: P1))
    mirrors(S, lod, parts, S.get('mirror_rule', lambda q: P2 if q.n.x < -0.5 else P1))
    suspension(S, lod, parts)
    if lod < 2: parts.append(helmet(S.get('helmet_x', 0.16), lod, lambda p, n: CF if n.x > 0.5 and p.z > 0.49 else (P2 if abs(p.y) < 0.025 else P1)))
    if S.get('extras'): S['extras'](lod, parts)
    car = join('body', parts)
    glass = canopy(S, lod)
    W = S.get('wheels', {})
    wheels = [wheel('wheel_' + k, k, lod, ring=W.get('ring', P2), spokes=W.get('spokes', 10), style=W.get('style', 'turbine'),
                    tyre_ring=W.get('tyre_ring')) for k in ('FL', 'FR', 'RL', 'RR')]
    return car, glass, wheels
