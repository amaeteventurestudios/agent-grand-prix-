# AGP-02 Vortex: a needle nose that climbs steeply to a long closed canopy, fully open front wheels
# on exposed wishbones, a wide three-element front wing with tall endplates lit down their front
# edges, sharp boxy sidepods with a deep undercut and a lit inlet, a high engine cover, and a broad
# rear wing on one central pylon with lit endplate tips.
import math
from mathutils import Vector
from carkit import *

def body_rings(n):
    S = [  # x, half-width, bottom, top, top roundness
        (2.80, 0.045, 0.150, 0.175, 2.0),
        (2.62, 0.110, 0.135, 0.215, 2.6),
        (2.30, 0.150, 0.125, 0.270, 3.0),
        (1.90, 0.170, 0.120, 0.345, 3.0),
        (1.45, 0.190, 0.115, 0.440, 2.8),
        (1.05, 0.230, 0.105, 0.535, 2.6),
        (0.60, 0.300, 0.100, 0.590, 2.8),
        (0.25, 0.360, 0.095, 0.590, 3.2),
        (-0.15, 0.420, 0.095, 0.585, 3.6),
        (-0.70, 0.400, 0.095, 0.680, 3.4),
        (-1.20, 0.300, 0.105, 0.700, 3.0),
        (-1.62, 0.210, 0.125, 0.600, 2.6),
        (-1.98, 0.140, 0.160, 0.470, 2.3),
        (-2.22, 0.085, 0.210, 0.360, 2.0),
    ]
    return [superellipse(x, w, zb, zt, n, ntop=nt) for (x, w, zb, zt, nt) in S]

def pod_rings(n, s):
    # sidepods: boxy, with an undercut that lifts the floor line at the front, wide at the inlet
    S = [  # x, centre y, half-width, bottom, top
        (0.55, 0.43, 0.035, 0.30, 0.44),
        (0.48, 0.47, 0.150, 0.24, 0.47),
        (0.20, 0.50, 0.200, 0.19, 0.47),
        (-0.30, 0.48, 0.200, 0.13, 0.45),
        (-0.85, 0.40, 0.150, 0.11, 0.40),
        (-1.35, 0.30, 0.080, 0.12, 0.32),
    ]
    return [superellipse(x, w, zb, zt, n, ntop=5.0, nbot=5.0, yoff=s * yc) for (x, yc, w, zb, zt) in S]

def body_rule(p, n):
    ay = abs(p.y)
    if p.z < 0.15: return CF                                       # floor edge
    if p.x > 0.7 and ay < 0.03 and n.z > 0.5: return P2              # the stripe up the nose
    if p.x > 1.0 and p.z < 0.22: return CF                          # dark chin
    if p.x < -1.75: return CF                                       # tail
    return P1

def pod_rule(s):
    def r(p, n):
        if p.x > 0.44 and n.x > 0.5: return GLOW if p.z > 0.42 else CF    # dark inlet, lit upper lip
        if n.z < -0.2: return CF                                     # undercut
        if p.z > 0.43 and abs(abs(p.y) - 0.5) < 0.05: return P2       # stripe along the top edge
        if p.z < 0.2: return CF
        return P1
    return r

def build(lod):
    n = (24, 10, 6)[lod]
    sd = (2, 1, 0)[lod]
    parts = []
    parts.append(paint(finish(loft('body', body_rings(n)), sd), body_rule))
    for s in (1, -1):
        parts.append(paint(finish(loft('pod', pod_rings((16, 8, 4)[lod], s)), min(sd, 1)), pod_rule(s)))

    # floor with turned-down edges, and the diffuser
    floor = loft('floor', [superellipse(x, w, 0.055, 0.09, (12, 8, 4)[lod], 6, 6) for (x, w) in ((1.3, 0.16), (0.95, 0.6), (-0.3, 0.84), (-1.55, 0.8), (-2.0, 0.55))])
    parts.append(paint(finish(floor, min(sd, 1)), solid(CF)))
    dif = loft('diffuser', [superellipse(x, w, zb, zt, (10, 6, 4)[lod], 6, 6) for (x, w, zb, zt) in ((-1.85, 0.55, 0.06, 0.1), (-2.32, 0.58, 0.2, 0.24))])
    parts.append(paint(finish(dif, 0), (lambda p, nn: GLOW if p.x < -2.29 and abs(p.y) < 0.12 else CF)))   # rain light
    if lod < 2:
        for yy in (-0.42, -0.21, 0.0, 0.21, 0.42):
            st = loft('strake', [[Vector((x, yy + dy, z)) for (dy, z) in ((-0.008, zl), (0.008, zl), (0.008, zl + 0.13), (-0.008, zl + 0.13))] for (x, zl) in ((-1.85, 0.08), (-2.32, 0.22))])
            parts.append(paint(finish(st, 0, False), solid(CF)))

    # front wing: three swept elements; the lowest carries a light strip on each outer half
    for k, (z, ch, xo, pitch) in enumerate(((0.085, 0.40, 2.95, 3), (0.155, 0.26, 2.66, 12), (0.225, 0.18, 2.47, 22))):
        st = []
        for i in range(11):
            t = -1 + 2 * i / 10
            st.append((t * 1.04, xo - 0.16 * abs(t) ** 1.4, z + 0.03 * t * t - 0.025 * (1 - abs(t)), ch * (1 - 0.2 * t * t), (0.022, 0.016, 0.013)[k], pitch))
        wg = finish(wing('fwing%d' % k, st, (14, 6, 4)[lod]), 0)
        parts.append(paint(wg, (lambda p, nn, k=k: GLOW if k == 0 and nn.z > 0.6 and 0.35 < abs(p.y) < 0.95 and p.x < 2.72 and p.x > 2.66 else (P2 if k == 2 else CF))))
    for s in (1, -1):
        # tall endplates, swept back, a light strip down the leading edge
        ep = loft('endplate', [[Vector((x, s * yy, z)) for (yy, z) in ((1.02, zb), (1.05, zb), (1.05, zt), (1.02, zt))] for (x, zb, zt) in ((2.92, 0.05, 0.16), (2.78, 0.05, 0.36), (2.45, 0.06, 0.36), (2.2, 0.08, 0.2))])
        parts.append(paint(finish(ep, 0, bevel=0.008 if lod == 0 else 0), (lambda p, nn: GLOW if p.x > 2.74 and nn.x > 0.4 else CF)))
        # the nose's turning vanes under the chassis
        if lod < 2:
            vane = loft('vane', [[Vector((x, s * yy, z)) for (yy, z) in ((0.16, 0.06), (0.175, 0.06), (0.175, 0.2), (0.16, 0.2))] for x in (2.2, 1.6)])
            parts.append(paint(finish(vane, 0, False), solid(CF)))

        # open front wheel: wishbones and a pushrod into the chassis, a brake duct on the inside
        x, y, r, w = WHEELS['FL']
        if lod < 2:
            for (z0, z1) in ((0.2, 0.22), (0.4, 0.46)):
                for dx in (0.22, -0.2):
                    parts.append(paint(finish(strut('arm', (x + dx, s * 0.17, z0 + 0.03), (x, s * 0.63, z1 - 0.02), 0.045, 0.016), 0), solid(CF)))
            parts.append(paint(finish(strut('push', (x - 0.05, s * 0.62, 0.2), (x - 0.25, s * 0.16, 0.45), 0.03, 0.03), 0), solid(MT)))
            duct = loft('duct', [superellipse(xx, 0.06, 0.24, 0.44, 8, 3, 3, yoff=s * 0.6) for xx in (x + 0.2, x - 0.12)])
            parts.append(paint(finish(duct, 0), solid(CF)))
        # rear wheel: wishbones and a small winglet over the brake duct
        x, y, r, w = WHEELS['RL']
        if lod < 2:
            for (z0, z1) in ((0.2, 0.22), (0.4, 0.46)):
                for dx in (0.25, -0.15):
                    parts.append(paint(finish(strut('arm', (x + dx, s * 0.26, z0 + 0.03), (x, s * 0.6, z1 - 0.02), 0.045, 0.016), 0), solid(CF)))
            wl = wing('rduct', [(s * 0.55, x + 0.25, 0.68, 0.3, 0.06, 6), (s * 0.66, x + 0.22, 0.7, 0.28, 0.06, 6)], (8, 5, 3)[lod])
            parts.append(paint(finish(wl, 0), solid(CF)))

    # rear wing: wide main plane and flap, one central pylon, endplates with lit tips
    for k, (z, ch, xo, pitch) in enumerate(((0.96, 0.36, -1.92, 5), (1.1, 0.22, -2.2, 24))):
        st = [(t * 0.7, xo - 0.06 * abs(t), z + 0.035 * t * t, ch, (0.022, 0.015)[k], pitch) for t in (-1, -0.66, -0.33, 0, 0.33, 0.66, 1)]
        parts.append(paint(finish(wing('rwing%d' % k, st, (14, 6, 4)[lod], 0.05), 0), solid(P2 if k == 1 else CF)))
    for s in (1, -1):
        ep = loft('rplate', [[Vector((x, s * yy, z)) for (yy, z) in ((0.7, zb), (0.725, zb), (0.725, zt), (0.7, zt))] for (x, zb, zt) in ((-1.86, 0.92, 1.12), (-2.15, 0.7, 1.22), (-2.46, 0.66, 1.3))])
        parts.append(paint(finish(ep, 0), (lambda p, nn: GLOW if p.z > 1.17 and p.x < -2.0 else CF)))
    pyl = loft('pylon', [superellipse(x, 0.03, zb, zt, (8, 6, 4)[lod], 4, 4) for (x, zb, zt) in ((-1.5, 0.55, 0.66), (-1.75, 0.64, 0.86), (-1.95, 0.84, 0.98), (-2.08, 0.94, 1.02))])
    parts.append(paint(finish(pyl, min(sd, 1)), solid(CF)))

    # airbox over the driver's head, a shark fin along the engine cover, the driver's helmet
    box = loft('airbox', [superellipse(x, w, 0.6, zt, (12, 8, 4)[lod], 2.4, 4) for (x, w, zt) in ((-0.42, 0.11, 0.76), (-0.62, 0.13, 0.8), (-0.95, 0.1, 0.76), (-1.2, 0.04, 0.7))])
    parts.append(paint(finish(box, min(sd, 1)), (lambda p, nn: CF if nn.x > 0.6 else P1)))
    if lod < 2:
        fin = loft('fin', [[Vector((x, yy, z)) for (yy, z) in ((-0.012, zb), (0.012, zb), (0.012, zt), (-0.012, zt))] for (x, zb, zt) in ((-1.0, 0.68, 0.78), (-1.6, 0.58, 0.9), (-1.92, 0.5, 0.96))])
        parts.append(paint(finish(fin, 0, False), (lambda p, nn: GLOW if p.z > 0.86 else P2)))
        helmet = loft('helmet', [superellipse(x, w, 0.52 - h, 0.52 + h, 12, 2, 2) for (x, w, h) in ((0.3, 0.02, 0.02), (0.24, 0.1, 0.1), (0.12, 0.13, 0.13), (-0.02, 0.11, 0.11), (-0.1, 0.03, 0.03))])
        parts.append(paint(finish(helmet, min(sd, 1)), (lambda p, nn: CF if nn.x > 0.5 and p.z > 0.49 else P2)))

    car = join('body', parts)
    # a long, low canopy that runs from the nose ridge to the airbox
    glass = loft('glass', [superellipse(x, w, 0.46, zt, n, 2.0, 2.0) for (x, w, zt) in ((1.2, 0.03, 0.5), (0.95, 0.15, 0.64), (0.55, 0.25, 0.78), (0.15, 0.27, 0.82), (-0.2, 0.22, 0.79), (-0.45, 0.1, 0.72), (-0.55, 0.02, 0.68))])
    glass = finish(glass, sd)
    paint(glass, solid((0, 0, 0, 1)))
    wheels = [wheel('wheel_' + k, k, (32, 14, 6)[lod], lod < 2, GLOW) for k in ('FL', 'FR', 'RL', 'RR')]
    return car, glass, wheels

CAMS = {  # attachment points in the car frame
    'cam_chase': (-5.2, 0, 1.9), 'cam_cockpit': (0.25, 0, 0.8), 'cam_front': (3.2, 0, 0.35),
    'cam_rear': (-2.9, 0, 1.3), 'cam_wheel': (1.2, 1.15, 0.45), 'cam_top': (0, 0, 9.0),
}
