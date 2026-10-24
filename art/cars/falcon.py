# AGP-01 Falcon: closed bubble canopy, swept front fenders half-covering the front wheels with light
# strips in their leading edges, broad two-element front wing, sculpted sidepods with a flowing
# secondary stripe, rear wing on swan-neck mounts.
import math
from mathutils import Vector
from carkit import *

def body_rings(n):
    S = [  # x, half-width, bottom, top, top roundness
        (2.66, 0.060, 0.140, 0.180, 2.0),
        (2.50, 0.170, 0.120, 0.230, 3.0),
        (2.20, 0.215, 0.110, 0.300, 3.2),
        (1.80, 0.220, 0.110, 0.390, 3.0),
        (1.30, 0.235, 0.110, 0.470, 2.7),
        (0.90, 0.270, 0.100, 0.540, 2.6),
        (0.45, 0.380, 0.090, 0.575, 3.0),
        (0.05, 0.600, 0.085, 0.545, 3.4),
        (-0.45, 0.665, 0.085, 0.530, 3.4),
        (-0.95, 0.560, 0.090, 0.600, 3.0),
        (-1.40, 0.340, 0.100, 0.640, 2.6),
        (-1.80, 0.220, 0.125, 0.560, 2.4),
        (-2.10, 0.150, 0.160, 0.440, 2.2),
        (-2.28, 0.090, 0.200, 0.340, 2.0),
    ]
    return [superellipse(x, w, zb, zt, n, ntop=nt) for (x, w, zb, zt, nt) in S]

def stripe_z(x):
    # the secondary stripe sweeps up from the nose, along the sidepod and over the rear haunch
    if x > 0.55: return stripe_z(0.55) - (x - 0.55) * 0.12
    return 0.30 + 0.09 * max(0.0, min(1.0, (0.4 - x) / 1.8)) + 0.04 * math.sin(x * 2.0)

def body_rule(p, n):
    ay = abs(p.y)
    if p.z < 0.16: return CF                                    # floor edge
    if p.x > 0.95 and ay < 0.028 and p.z > 0.2: return P2          # nose centre line
    if p.x > -2.0 and (ay > 0.22 or p.x > 0.55):
        d = p.z - stripe_z(p.x)
        if abs(d) < 0.042 and p.x < 1.7: return P2                 # the flowing side stripe
        if d < 0: return CF                                       # dark lower body
    return P1

def build(lod):
    n = (24, 10, 6)[lod]
    sd = (2, 1, 0)[lod]
    parts = []
    body = finish(loft('body', body_rings(n)), sd)
    parts.append(paint(body, body_rule))

    # floor and plank: a wide carbon plate with turned-down edges
    floor = loft('floor', [superellipse(x, w, 0.055, 0.09, (12, 8, 4)[lod], 6, 6) for (x, w) in ((1.25, 0.18), (0.9, 0.62), (-0.3, 0.86), (-1.6, 0.8), (-2.05, 0.55))])
    parts.append(paint(finish(floor, min(sd, 1)), solid(CF)))

    # diffuser ramp with strakes and the rain light housing
    dif = loft('diffuser', [superellipse(x, w, zb, zt, (10, 6, 4)[lod], 6, 6) for (x, w, zb, zt) in ((-1.9, 0.55, 0.06, 0.1), (-2.35, 0.55, 0.18, 0.22))])
    parts.append(paint(finish(dif, 0), solid(CF)))
    if lod < 2:
        for yy in (-0.4, -0.15, 0.15, 0.4):
            s = loft('strake', [[Vector((x, yy + dy, z)) for (dy, z) in ((-0.008, zl), (0.008, zl), (0.008, zl + 0.12), (-0.008, zl + 0.12))] for (x, zl) in ((-1.9, 0.08), (-2.35, 0.2))])
            parts.append(paint(finish(s, 0, False), solid(CF)))

    # front wing: two swept elements, endplates painted, light strip along the leading edge
    for k, (z, ch, xo) in enumerate(((0.10, 0.44, 2.86), (0.19, 0.26, 2.58))):
        st = []
        for i in range(9):
            t = -1 + 2 * i / 8
            y = t * 1.0
            st.append((y, xo - 0.1 * abs(t), z + 0.025 * t * t - 0.02 * (1 - abs(t)), ch * (1 - 0.15 * t * t), 0.055, 4 + 12 * k))
        wg = finish(wing('fwing%d' % k, st, (14, 6, 4)[lod]), 0)
        parts.append(paint(wg, (lambda p, nn, k=k: GLOW if k == 0 and nn.x > 0.6 and abs(p.y) < 0.95 else CF)))
    for s in (1, -1):
        ep = loft('endplate', [[Vector((x, s * yy, z)) for (yy, z) in ((0.99, 0.05), (1.02, 0.05), (1.02, zt), (0.99, zt))] for (x, zt) in ((2.9, 0.13), (2.6, 0.21), (2.32, 0.24))])
        parts.append(paint(finish(ep, 0, bevel=0.008 if lod == 0 else 0), (lambda p, nn: GLOW if p.x > 2.86 else CF)))
        # front fender: a swept shell over the front and top of the front wheel, light strip in its lip
        x, y, r, w = WHEELS['FL']
        hub = Vector((x, s * y, r))
        # front wheel pod: a tunnel over the wheel, low in front, highest over the hub, open underneath
        tyre_top = lambda xx: r + math.sqrt(max(0.0, (r + 0.03) ** 2 - (xx - x) ** 2))
        rings = []
        nr = (11, 6, 3)[lod]
        for k in range(nr + 1):
            xx = 2.2 - 1.15 * k / nr
            top = max(tyre_top(xx), 0.3) + 0.03 + 0.015 * math.sin(math.pi * k / nr)
            zb = 0.13 + 0.12 * max(0.0, min(1.0, (2.0 - xx) / 0.4))
            rings.append(arch(xx, s * y, 0.22 + 0.02 * math.sin(math.pi * k / nr), zb, top, 0.04, (10, 6, 3)[lod]))
        pod = finish(loft('pod', rings), min(sd, 1))
        def prule(p, nn, hub=hub):
            if nn.z < -0.35: return CF                                           # inside the tunnel
            if p.x > 1.98 and abs(abs(p.y) - (y + 0.24)) < 0.035: return GLOW      # light strip down the front
            if p.z > hub.z + 0.25 and abs(abs(p.y) - y) < 0.06: return P2         # stripe over the top
            return P1
        parts.append(paint(pod, prule))
        # a swept strake tying the pod into the nose
        blade = wing('cheek', [(s * 0.2, 2.25, 0.27, 0.42, 0.08, -3), (s * 0.42, 2.18, 0.36, 0.4, 0.07, -6), (s * 0.6, 2.12, 0.46, 0.36, 0.07, -10)], (8, 5, 3)[lod])
        parts.append(paint(finish(blade, 0), solid(P1)))
        # rear fender: a short cover over the top of the rear wheel
        x, y, r, w = WHEELS['RL']
        rf = arc_shell('rfender', (x, s * y, r), r + 0.05, w + 0.1, 40, 150, (10, 6, 3)[lod], 0.03)
        rhub = Vector((x, s * y, r))
        def rrule(p, nn, hub=rhub):
            out = (p - hub); out.y = 0
            if out.length and nn.dot(out.normalized()) < 0: return CF
            return GLOW if p.x < hub.x - 0.3 and p.z < hub.z + 0.3 else P1
        parts.append(paint(finish(rf, min(sd, 1)), rrule))
        if lod < 1:
            # suspension: upper and lower wishbones to each wheel
            for (wx, wr) in ((1.55, 0.34), (-1.55, 0.34)):
                for (z0, z1) in ((0.2, 0.26), (0.38, 0.44)):
                    parts.append(paint(finish(strut('arm', (wx + 0.18, s * 0.25, z0 + 0.02), (wx, s * 0.62, z1 - 0.02)), 0), solid(CF)))
                    parts.append(paint(finish(strut('arm', (wx - 0.18, s * 0.25, z0 + 0.02), (wx, s * 0.62, z1 - 0.02)), 0), solid(CF)))

    # rear wing: main plane and flap on a swan-neck pylon, painted endplates with a glowing edge
    for k, (z, ch, xo, pitch) in enumerate(((0.98, 0.34, -1.98, 4), (1.1, 0.2, -2.24, 22))):
        st = [(t * 0.62, xo - 0.05 * abs(t), z + 0.02 * t * t, ch, 0.12, pitch) for t in (-1, -0.5, 0, 0.5, 1)]
        st = [(y, x, z, c, 0.07, pt) for (y, x, z, c, _, pt) in st]
        rw = finish(wing('rwing%d' % k, st, (14, 6, 4)[lod], 0.05), 0)
        parts.append(paint(rw, solid(P1 if k == 1 else CF)))
    for s in (1, -1):
        ep = loft('rplate', [[Vector((x, s * yy, z)) for (yy, z) in ((0.62, zb), (0.645, zb), (0.645, zt), (0.62, zt))] for (x, zb, zt) in ((-1.95, 0.9, 1.08), (-2.2, 0.8, 1.16), (-2.45, 0.74, 1.2))])
        parts.append(paint(finish(ep, 0), (lambda p, nn: GLOW if p.x < -2.41 else CF)))
    for yy in (-0.22, 0.22):
        neck = loft('neck', [superellipse(x, 0.022, zb, zt, (8, 6, 4)[lod], 4, 4, yoff=yy) for (x, zb, zt) in ((-1.6, 0.52, 0.62), (-1.85, 0.68, 0.86), (-2.05, 0.9, 1.02), (-2.15, 0.98, 1.06))])
        parts.append(paint(finish(neck, min(sd, 1)), solid(CF)))

    # airbox above the canopy and a shark fin down the engine cover
    if lod < 2:
        fin = loft('fin', [[Vector((x, yy, z)) for (yy, z) in ((-0.012, zb), (0.012, zb), (0.012, zt), (-0.012, zt))] for (x, zb, zt) in ((-0.4, 0.5, 0.6), (-1.5, 0.6, 0.78), (-1.95, 0.55, 0.9))])
        parts.append(paint(finish(fin, 0, False), solid(P2)))
        helmet = loft('helmet', [superellipse(x, w, 0.5 - h, 0.5 + h, 12, 2, 2) for (x, w, h) in ((0.42, 0.02, 0.02), (0.36, 0.1, 0.1), (0.24, 0.13, 0.13), (0.1, 0.11, 0.11), (0.02, 0.03, 0.03))])
        parts.append(paint(finish(helmet, min(sd, 1)), (lambda p, nn: CF if nn.x > 0.5 and p.z > 0.47 else P2)))

    car = join('body', parts)
    # bubble canopy (its own glass material)
    glass = loft('glass', [superellipse(x, w, 0.42, zt, n, 2.0, 2.0) for (x, w, zt) in ((1.05, 0.04, 0.52), (0.82, 0.2, 0.72), (0.45, 0.28, 0.86), (0.05, 0.29, 0.87), (-0.35, 0.23, 0.78), (-0.7, 0.12, 0.66), (-0.9, 0.03, 0.58))])
    glass = finish(glass, sd)
    paint(glass, solid((0, 0, 0, 1)))
    wheels = [wheel('wheel_' + k, k, (32, 14, 6)[lod], lod < 2) for k in ('FL', 'FR', 'RL', 'RR')]
    return car, glass, wheels

CAMS = {  # attachment points in the car frame
    'cam_chase': (-5.2, 0, 1.9), 'cam_cockpit': (0.35, 0, 0.78), 'cam_front': (3.1, 0, 0.35),
    'cam_rear': (-2.9, 0, 1.25), 'cam_wheel': (1.2, 1.15, 0.45), 'cam_top': (0, 0, 9.0),
}
