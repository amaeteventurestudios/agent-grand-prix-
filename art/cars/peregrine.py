# AGP-09 Peregrine: a broad, flat-topped nose with an accent chevron, a closed canopy with mirrors on
# stalks, thin carbon fenders arching over the front and rear wheels with light strips down their
# leading edges, aero covers on the wheels, deep carbon scallops cut into sculpted sidepods, a tall
# airbox scoop and a rear wing with an accent flap.
import math
from mathutils import Vector
from carkit import *

def body_rings(n):
    S = [  # x, half-width, bottom, top, top roundness
        (2.78, 0.070, 0.130, 0.165, 2.0),
        (2.60, 0.180, 0.120, 0.215, 4.0),
        (2.25, 0.225, 0.115, 0.290, 4.2),
        (1.85, 0.240, 0.110, 0.370, 3.8),
        (1.40, 0.255, 0.105, 0.455, 3.2),
        (1.00, 0.290, 0.100, 0.525, 2.8),
        (0.55, 0.400, 0.095, 0.565, 3.0),
        (0.15, 0.620, 0.090, 0.540, 3.6),
        (-0.40, 0.680, 0.090, 0.520, 3.8),
        (-0.90, 0.560, 0.095, 0.600, 3.2),
        (-1.35, 0.350, 0.105, 0.660, 2.8),
        (-1.75, 0.230, 0.125, 0.580, 2.4),
        (-2.08, 0.150, 0.160, 0.450, 2.2),
        (-2.28, 0.090, 0.200, 0.340, 2.0),
    ]
    return [superellipse(x, w, zb, zt, n, ntop=nt) for (x, w, zb, zt, nt) in S]

def chevron(p):
    # the accent chevron on the nose: two bands sweeping back from the tip and out to the sidepods
    if p.x < 0.6 or p.x > 2.6: return False
    edge = 0.05 + (2.6 - p.x) * 0.16
    return abs(abs(p.y) - edge) < 0.035

def body_rule(p, n):
    ay = abs(p.y)
    if p.z < 0.15: return CF
    if chevron(p) and n.z > 0.3: return P2
    # the scallop: a deep carbon cut along each sidepod, edged in the accent colour
    if -1.2 < p.x < 0.25 and ay > 0.38:
        mid = 0.32 + 0.05 * math.sin((p.x + 1.2) * 2.2)
        d = abs(p.z - mid)
        if d < 0.085: return CF
        if d < 0.11 and p.x > -0.5: return P2
    if p.z < 0.22: return CF
    if p.x < -1.85: return CF
    return P1

def build(lod):
    n = (24, 10, 6)[lod]
    sd = (2, 1, 0)[lod]
    parts = []
    parts.append(paint(finish(loft('body', body_rings(n)), sd), body_rule))

    floor = loft('floor', [superellipse(x, w, 0.055, 0.09, (12, 8, 4)[lod], 6, 6) for (x, w) in ((1.3, 0.2), (0.95, 0.62), (-0.3, 0.86), (-1.6, 0.82), (-2.05, 0.55))])
    parts.append(paint(finish(floor, min(sd, 1)), solid(CF)))
    dif = loft('diffuser', [superellipse(x, w, zb, zt, (10, 6, 4)[lod], 6, 6) for (x, w, zb, zt) in ((-1.9, 0.55, 0.06, 0.1), (-2.36, 0.58, 0.2, 0.24))])
    parts.append(paint(finish(dif, 0), (lambda p, nn: GLOW if p.x < -2.33 and abs(p.y) < 0.1 else CF)))
    if lod < 2:
        for yy in (-0.4, -0.15, 0.15, 0.4):
            st = loft('strake', [[Vector((x, yy + dy, z)) for (dy, z) in ((-0.008, zl), (0.008, zl), (0.008, zl + 0.12), (-0.008, zl + 0.12))] for (x, zl) in ((-1.9, 0.08), (-2.36, 0.21))])
            parts.append(paint(finish(st, 0, False), solid(CF)))

    # front wing: three stacked, swept elements stepping up toward the endplates
    for k, (z, ch, xo, pitch, th) in enumerate(((0.08, 0.42, 2.98, 3, 0.022), (0.15, 0.28, 2.72, 12, 0.016), (0.215, 0.2, 2.52, 22, 0.013))):
        st = []
        for i in range(11):
            t = -1 + 2 * i / 10
            st.append((t * 1.03, xo - 0.2 * abs(t) ** 1.3, z + 0.05 * abs(t) ** 2 - 0.02 * (1 - abs(t)), ch * (1 - 0.15 * t * t), th, pitch))
        wg = finish(wing('fwing%d' % k, st, (14, 6, 4)[lod]), 0)
        parts.append(paint(wg, (lambda p, nn, k=k: P1 if k == 2 and abs(p.y) < 0.5 else CF)))
    for s in (1, -1):
        ep = loft('endplate', [[Vector((x, s * yy, z)) for (yy, z) in ((1.01, zb), (1.04, zb), (1.04, zt), (1.01, zt))] for (x, zb, zt) in ((2.95, 0.04, 0.14), (2.75, 0.04, 0.3), (2.45, 0.06, 0.32), (2.25, 0.09, 0.18))])
        parts.append(paint(finish(ep, 0, bevel=0.008 if lod == 0 else 0), solid(CF)))
        # the accent fin rising inboard of each endplate
        fin = loft('ffin', [[Vector((x, s * yy, z)) for (yy, z) in ((0.8, zb), (0.82, zb), (0.82, zt), (0.8, zt))] for (x, zb, zt) in ((2.7, 0.18, 0.24), (2.5, 0.2, 0.44), (2.3, 0.22, 0.42))])
        parts.append(paint(finish(fin, 0, False), solid(P2)))

        # fenders: thin carbon arcs over the front and rear wheels, light strip down the leading edge
        for key, (a0, a1) in (('FL', (10, 175)), ('RL', (15, 165))):
            x, y, r, w = WHEELS[key]
            hub = Vector((x, s * y, r))
            f = arc_shell('fender', (x, s * y, r), r + 0.06, w + 0.08, a0, a1, (16, 8, 4)[lod], 0.025)
            def frule(p, nn, hub=hub, front=key == 'FL'):
                out = p - hub; out.y = 0
                if out.length and nn.dot(out.normalized()) < 0.2: return CF
                ang = math.degrees(math.atan2(out.z, out.x))
                # a thin light strip on the outer edge of the fender's leading quarter
                if ang < 45 and nn.y * math.copysign(1, hub.y) > 0.7: return GLOW
                return CF
            parts.append(paint(finish(f, min(sd, 1)), frule))
            if lod < 2:
                # fender stays to the chassis
                parts.append(paint(finish(strut('stay', (x, s * (y - 0.06), r + 0.2), (x + 0.1, s * 0.3, 0.42 if key == 'FL' else 0.5), 0.06, 0.02), 0), solid(CF)))
        x, y, r, w = WHEELS['FL']
        if lod < 2:
            for (z0, z1) in ((0.2, 0.22), (0.4, 0.46)):
                for dx in (0.22, -0.2):
                    parts.append(paint(finish(strut('arm', (x + dx, s * 0.24, z0 + 0.03), (x, s * 0.63, z1 - 0.02), 0.045, 0.016), 0), solid(CF)))
            x, y, r, w = WHEELS['RL']
            for (z0, z1) in ((0.2, 0.22), (0.4, 0.46)):
                for dx in (0.25, -0.15):
                    parts.append(paint(finish(strut('arm', (x + dx, s * 0.26, z0 + 0.03), (x, s * 0.6, z1 - 0.02), 0.045, 0.016), 0), solid(CF)))
        # mirrors on stalks beside the cockpit
        if lod < 2:
            parts.append(paint(finish(strut('mstalk', (0.75, s * 0.28, 0.52), (0.82, s * 0.48, 0.66), 0.03, 0.015), 0), solid(CF)))
            mir = loft('mirror', [superellipse(xx, 0.08, 0.62, 0.7, 8, 3, 3, yoff=s * 0.5) for xx in (0.9, 0.78)])
            parts.append(paint(finish(mir, 0), solid(CF)))
        # bargeboard blade ahead of the sidepod
        bb = wing('barge', [(s * 0.35, 1.2, 0.2, 0.55, 0.03, -4), (s * 0.6, 1.0, 0.24, 0.5, 0.03, -8)], (8, 5, 3)[lod])
        parts.append(paint(finish(bb, 0), solid(CF)))

    # rear wing: carbon main plane, accent flap, swan-neck pylons, endplates with accent tips
    for k, (z, ch, xo, pitch, th) in enumerate(((0.98, 0.36, -1.95, 5, 0.022), (1.11, 0.22, -2.22, 24, 0.015))):
        st = [(t * 0.66, xo - 0.08 * abs(t), z + 0.04 * t * t, ch, th, pitch) for t in (-1, -0.66, -0.33, 0, 0.33, 0.66, 1)]
        parts.append(paint(finish(wing('rwing%d' % k, st, (14, 6, 4)[lod], 0.05), 0), solid(P2 if k == 1 else CF)))
    for s in (1, -1):
        ep = loft('rplate', [[Vector((x, s * yy, z)) for (yy, z) in ((0.66, zb), (0.685, zb), (0.685, zt), (0.66, zt))] for (x, zb, zt) in ((-1.9, 0.9, 1.1), (-2.2, 0.76, 1.2), (-2.5, 0.72, 1.26))])
        parts.append(paint(finish(ep, 0), (lambda p, nn: P2 if p.z > 1.16 else CF)))
    for yy in (-0.2, 0.2):
        neck = loft('neck', [superellipse(x, 0.02, zb, zt, (8, 6, 4)[lod], 4, 4, yoff=yy) for (x, zb, zt) in ((-1.62, 0.52, 0.62), (-1.86, 0.68, 0.86), (-2.05, 0.9, 1.02), (-2.15, 0.98, 1.06))])
        parts.append(paint(finish(neck, min(sd, 1)), solid(CF)))

    # tall airbox scoop with an accent lip, engine-cover fin, helmet
    box = loft('airbox', [superellipse(x, w, 0.55, zt, (12, 8, 4)[lod], 3, 4) for (x, w, zt) in ((-0.38, 0.1, 0.8), (-0.5, 0.12, 0.84), (-0.85, 0.1, 0.78), (-1.2, 0.04, 0.68))])
    parts.append(paint(finish(box, min(sd, 1)), (lambda p, nn: CF if nn.x > 0.6 and p.z < 0.78 else (P2 if nn.x > 0.3 else P1))))
    if lod < 2:
        fin = loft('fin', [[Vector((x, yy, z)) for (yy, z) in ((-0.012, zb), (0.012, zb), (0.012, zt), (-0.012, zt))] for (x, zb, zt) in ((-0.95, 0.66, 0.76), (-1.55, 0.6, 0.86), (-1.95, 0.5, 0.94))])
        parts.append(paint(finish(fin, 0, False), solid(CF)))
        helmet = loft('helmet', [superellipse(x, w, 0.5 - h, 0.5 + h, 12, 2, 2) for (x, w, h) in ((0.4, 0.02, 0.02), (0.34, 0.1, 0.1), (0.22, 0.13, 0.13), (0.08, 0.11, 0.11), (0.0, 0.03, 0.03))])
        parts.append(paint(finish(helmet, min(sd, 1)), (lambda p, nn: CF if nn.x > 0.5 and p.z > 0.47 else P2)))

    car = join('body', parts)
    glass = loft('glass', [superellipse(x, w, 0.44, zt, n, 2.0, 2.0) for (x, w, zt) in ((1.15, 0.04, 0.5), (0.9, 0.2, 0.68), (0.5, 0.29, 0.82), (0.1, 0.3, 0.84), (-0.25, 0.22, 0.78), (-0.45, 0.1, 0.72), (-0.55, 0.02, 0.68))])
    glass = finish(glass, sd)
    paint(glass, solid((0, 0, 0, 1)))
    wheels = [wheel('wheel_' + k, k, (32, 14, 6)[lod], lod < 2, P2) for k in ('FL', 'FR', 'RL', 'RR')]
    return car, glass, wheels

CAMS = {  # attachment points in the car frame
    'cam_chase': (-5.2, 0, 1.9), 'cam_cockpit': (0.35, 0, 0.78), 'cam_front': (3.2, 0, 0.35),
    'cam_rear': (-2.9, 0, 1.25), 'cam_wheel': (1.2, 1.15, 0.45), 'cam_top': (0, 0, 9.0),
}
